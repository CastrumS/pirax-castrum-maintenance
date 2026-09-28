<?php
/**
 * Plugin Name: Pirax form test harness (test only)
 * Description: Local Playground observer. Never packaged into the production plugin ZIP.
 *
 * - Logs the final wp_mail arguments (after every wp_mail filter) and short-circuits sending
 *   (compatibility stack: optionally observes only, so FluentSMTP's Simulator is the transport).
 * - Answers Google reCAPTCHA siteverify with {"success":false} without network access.
 * - Keeps Action Scheduler from dispatching its own loopback runner; the harness drives queues.
 * - Registers ledger feeds through the real Gravity Forms feed add-on framework and the real
 *   Fluent Forms integration framework, recording each native execution.
 * - Compatibility stack only (PIRAX_HARNESS_COMPAT): contains all third-party HTTP at the Requests
 *   transport, answers CleanTalk moderation and the local webhook capture URL, records the
 *   effective PHPMailer envelope.
 * It does not touch authentication, capabilities or form validation.
 */

defined( 'ABSPATH' ) || exit;

const PIRAX_FORM_TEST_HARNESS = true;

function pirax_harness_log( $name, array $record ) {
	$dir = WP_CONTENT_DIR . '/pirax-harness';
	wp_mkdir_p( $dir );
	$record['request'] = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : 'cli';
	$record['time']    = microtime( true );
	file_put_contents( "$dir/$name.jsonl", wp_json_encode( $record ) . "\n", FILE_APPEND | LOCK_EX );
}

add_filter(
	'pre_wp_mail',
	static function ( $short_circuit, $atts ) {
		if ( null !== $short_circuit ) {
			return $short_circuit;
		}
		$headers = $atts['headers'];
		if ( is_string( $headers ) ) {
			$headers = '' === $headers ? array() : preg_split( "/\r\n|\n/", $headers );
		}
		pirax_harness_log(
			'mail',
			array(
				'to'          => array_values( (array) $atts['to'] ),
				'subject'     => (string) $atts['subject'],
				'message'     => (string) $atts['message'],
				'headers'     => array_values( (array) $headers ),
				'attachments' => array_values( (array) $atts['attachments'] ),
			)
		);
		return pirax_harness_mail_passthrough() ? $short_circuit : true;
	},
	PHP_INT_MAX,
	2
);

add_filter(
	'pre_http_request',
	static function ( $response, $args, $url ) {
		if ( 0 !== strpos( $url, 'https://www.google.com/recaptcha/api/siteverify' ) && 0 !== strpos( $url, 'https://www.recaptcha.net/recaptcha/api/siteverify' ) ) {
			return $response;
		}
		pirax_harness_log( 'siteverify', array( 'url' => $url ) );
		return array(
			'headers'  => array( 'content-type' => 'application/json' ),
			'body'     => '{"success":false}',
			'response' => array( 'code' => 200, 'message' => 'OK' ),
			'cookies'  => array(),
			'filename' => null,
		);
	},
	PHP_INT_MAX,
	3
);

// Which plugins were activated with this mu-plugin (and its safeguards) already loaded.
add_action(
	'activated_plugin',
	static function ( $plugin ) {
		pirax_harness_log( 'activations', array( 'plugin' => $plugin ) );
	}
);

/**
 * pirax_harness_mail_passthrough (compatibility stack only): the mail observer above records and then
 * lets wp_mail() continue, but only while FluentSMTP's own wp_mail() is loaded with its simulation
 * constant, so its Simulator provider is the sole transport. Otherwise it short-circuits as always.
 */
function pirax_harness_mail_passthrough() {
	return defined( 'PIRAX_HARNESS_COMPAT' ) && get_option( 'pirax_harness_mail_passthrough' )
		&& defined( 'FLUENTMAIL_SIMULATE_EMAILS' ) && FLUENTMAIL_SIMULATE_EMAILS && function_exists( 'fluentMailGetProvider' )
		&& 'fluent-smtp.php' === basename( ( new ReflectionFunction( 'wp_mail' ) )->getFileName() );
}

if ( defined( 'PIRAX_HARNESS_COMPAT' ) ) {
	/**
	 * The only Requests transport, so WordPress HTTP and direct Requests calls (CleanTalk's "WordPress
	 * HTTP API" mode calls Requests itself, bypassing pre_http_request) cannot leave the machine.
	 * Loopback goes to the real transport; the capture URL, CleanTalk moderation and everything
	 * else are answered here and logged as method, host, path and purpose (no query, headers or body).
	 */
	class Pirax_Harness_Transport implements \WpOrg\Requests\Transport {
		const CAPTURE = '/pirax-harness/capture/';

		public function request( $url, $headers = array(), $data = array(), $options = array() ) {
			$parts = wp_parse_url( $url );
			$host  = strtolower( $parts['host'] ?? '' );
			$path  = $parts['path'] ?? '/';
			if ( in_array( $host, array( '127.0.0.1', 'localhost', wp_parse_url( home_url(), PHP_URL_HOST ) ), true ) && 0 !== strpos( $path, self::CAPTURE ) ) {
				foreach ( \WpOrg\Requests\Requests::DEFAULT_TRANSPORTS as $class ) {
					if ( $class::test( array( 'ssl' => 0 === stripos( $url, 'https://' ) ) ) ) {
						return ( new $class() )->request( $url, $headers, $data, $options );
					}
				}
				throw new \WpOrg\Requests\Exception( 'Pirax harness: no loopback transport', 'pirax_harness_loopback' );
			}
			$body   = is_string( $data ) ? json_decode( $data, true ) : null;
			$record = array(
				'method' => strtoupper( $options['type'] ?? 'GET' ),
				'host'   => $host,
				'path'   => $path,
				'hooks'  => array_values( $GLOBALS['wp_current_filter'] ),
				'action' => isset( $_REQUEST['action'] ) && is_string( $_REQUEST['action'] ) ? sanitize_key( $_REQUEST['action'] ) : null, // phpcs:ignore
			);
			if ( 0 === strpos( $path, self::CAPTURE ) ) {
				$record += array( 'purpose' => 'webhook-capture', 'entry' => isset( $body['pirax_entry'] ) ? (int) $body['pirax_entry'] : null );
				$answer  = '{"ok":true}';
			} elseif ( preg_match( '/(^|\.)cleantalk\.org$/', $host ) && in_array( $body['method_name'] ?? null, array( 'check_message', 'check_newuser' ), true ) ) {
				$record += array( 'purpose' => 'cleantalk-moderation', 'api' => $body['method_name'] );
				$answer  = wp_json_encode( array( 'allow' => 1, 'spam' => 0, 'stop_queue' => 0, 'inactive' => 0, 'account_status' => 1, 'comment' => 'Pirax harness: allowed', 'id' => 'pirax-harness' ) );
			} else {
				pirax_harness_log( 'http', $record + array( 'purpose' => 'blocked' ) );
				throw new \WpOrg\Requests\Exception( 'Pirax harness: third-party HTTP is contained', 'pirax_harness_blocked' );
			}
			pirax_harness_log( 'http', $record );
			return "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " . strlen( $answer ) . "\r\n\r\n" . $answer;
		}

		public function request_multiple( $requests, $options ) {
			$responses = array();
			foreach ( $requests as $id => $request ) {
				try {
					$responses[ $id ] = $this->request( $request['url'], $request['headers'], $request['data'], $request['options'] );
					$request['options']['hooks']->dispatch( 'transport.internal.parse_response', array( &$responses[ $id ], $request ) );
				} catch ( \WpOrg\Requests\Exception $e ) {
					$responses[ $id ] = $e;
				}
				if ( ! is_string( $responses[ $id ] ) ) {
					$request['options']['hooks']->dispatch( 'multiple.request.complete', array( &$responses[ $id ], $id ) );
				}
			}
			return $responses;
		}

		public static function test( $capabilities = array() ) {
			return true;
		}
	}
	\Closure::bind(
		static function () {
			self::$transports = array( Pirax_Harness_Transport::class => Pirax_Harness_Transport::class );
			self::$transport  = array();
		},
		null,
		\WpOrg\Requests\Requests::class
	)();

	// Effective envelope FluentSMTP hands to its provider (phpmailer_init runs just before the provider).
	add_action(
		'phpmailer_init',
		static function ( $mailer ) {
			$names = static fn( $list ) => array_values( array_map( static fn( $a ) => $a[0], $list ) );
			pirax_harness_log(
				'envelopes',
				array(
					'to'        => $names( $mailer->getToAddresses() ),
					'cc'        => $names( $mailer->getCcAddresses() ),
					'bcc'       => $names( $mailer->getBccAddresses() ),
					'replyTo'   => $names( $mailer->getReplyToAddresses() ),
					'from'      => $mailer->From,
					'subject'   => $mailer->Subject,
					'headers'   => array_values( array_map( static fn( $h ) => $h[0] . ': ' . $h[1], $mailer->getCustomHeaders() ) ),
					'mailer'    => basename( ( new ReflectionFunction( 'wp_mail' ) )->getFileName() ),
					'transport' => function_exists( 'fluentMailGetProvider' ) && fluentMailGetProvider( $mailer->From ) instanceof \FluentMail\App\Services\Mailer\Providers\Simulator\Handler ? 'fluentsmtp-simulator' : 'other',
				)
			);
		},
		PHP_INT_MAX
	);
}

/**
 * Fluent Forms Pro per-form features in their native settings (compatibility stack):
 * 'double_optin' (form double_optin_settings, email field 'email'), 'admin_approval' (global module +
 * form admin_approval_settings) and 'auto_delete' (formSettings.delete_entry_on_submission).
 */
function pirax_harness_ff_pro_feature( $form_id, $feature, $on ) {
	$helper = '\FluentForm\App\Helpers\Helper';
	$yes    = $on ? 'yes' : 'no';
	switch ( $feature ) {
		case 'double_optin':
			$helper::setFormMeta( $form_id, 'double_optin_settings', array( 'status' => $yes, 'email_field' => 'email', 'skip_if_logged_in' => 'no', 'email_body_type' => 'global' ) );
			return;
		case 'admin_approval':
			$modules                   = (array) get_option( 'fluentform_global_modules_status', array() );
			$modules['admin_approval'] = $yes;
			update_option( 'fluentform_global_modules_status', $modules );
			$helper::setFormMeta( $form_id, 'admin_approval_settings', array( 'status' => $yes, 'skip_if_logged_in' => 'no' ) );
			return;
		case 'auto_delete':
			$settings                               = (array) $helper::getFormMeta( $form_id, 'formSettings', array() );
			$settings['delete_entry_on_submission'] = $yes;
			$helper::setFormMeta( $form_id, 'formSettings', $settings );
			return;
	}
	throw new InvalidArgumentException( "Unknown Fluent Forms Pro feature: $feature" );
}

// Queues run only when the harness drives them (as DISABLE_WP_CRON does for WP-Cron): no Action
// Scheduler loopback runner racing the tests, and no pause inside a harness-driven runner request.
add_filter( 'action_scheduler_allow_async_request_runner', '__return_false' );
add_filter( 'action_scheduler_async_request_sleep_seconds', '__return_zero' );

// Gravity Forms only sends a notification's CC when this documented filter opts in (as sites using CC do).
add_filter( 'gform_notification_enable_cc', '__return_true' );

// Gravity Forms: a minimal feed add-on on GF's own feed framework (sync feed processing).
add_action(
	'gform_loaded',
	static function () {
		if ( ! method_exists( 'GFForms', 'include_feed_addon_framework' ) ) {
			return;
		}
		GFForms::include_feed_addon_framework();

		class Pirax_Harness_GF_Ledger extends GFFeedAddOn {
			protected $_version                  = '1.0';
			protected $_min_gravityforms_version = '2.5';
			protected $_slug                     = 'pirax-harness-ledger';
			protected $_path                     = 'pirax-harness/ledger.php';
			protected $_full_path                = __FILE__;
			protected $_title                    = 'Pirax harness ledger';
			protected $_short_title              = 'Pirax ledger';
			private static $_instance            = null;

			public static function get_instance() {
				return self::$_instance ?? ( self::$_instance = new self() );
			}

			public function feed_settings_fields() {
				return array( array( 'fields' => array( array( 'name' => 'feedName', 'label' => 'Name', 'type' => 'text' ) ) ) );
			}

			public function process_feed( $feed, $entry, $form ) {
				pirax_harness_log( 'feeds', array( 'plugin' => 'gf', 'form' => (int) $form['id'], 'entry' => (int) $entry['id'], 'feed' => (int) $feed['id'] ) );
				return $entry;
			}
		}

		GFAddOn::register( 'Pirax_Harness_GF_Ledger' );
	},
	5
);

// Fluent Forms: a ledger integration on FF's integration manager (global feed dispatch).
add_action(
	'fluentform/loaded',
	static function ( $app ) {
		if ( ! class_exists( '\FluentForm\App\Http\Controllers\IntegrationManagerController' ) ) {
			return;
		}

		class Pirax_Harness_FF_Ledger extends \FluentForm\App\Http\Controllers\IntegrationManagerController {
			public $hasGlobalMenu = false;

			public function getIntegrationDefaults( $settings, $formId ) {
				return array( 'name' => 'Pirax ledger', 'enabled' => true, 'conditionals' => array( 'status' => false, 'conditions' => array() ) );
			}

			public function pushIntegration( $integrations, $formId ) {
				return $integrations;
			}

			public function getSettingsFields( $settings, $formId ) {
				return array();
			}

			public function getMergeFields( $list, $listId, $formId ) {
				return array();
			}

			public function notify( $feed, $formData, $entry, $form ) {
				pirax_harness_log( 'feeds', array( 'plugin' => 'ff', 'form' => (int) $form->id, 'entry' => (int) $entry->id, 'feed' => (int) $feed['id'] ) );
				do_action( 'fluentform/integration_action_result', $feed, 'success', 'Pirax ledger recorded' );
			}
		}

		( new Pirax_Harness_FF_Ledger( $app, 'Pirax ledger', 'pirax_ledger', 'pirax_ledger_settings', 'pirax_ledger_feeds' ) )->registerAdminHooks();
	}
);

/*
 * Option-driven test fixtures (all off unless a test sets the option):
 * - pirax_harness_ff_async_email: queue Fluent Forms email notifications natively. FF forces them
 *   synchronous with priority-9 filters; a later filter enables its own queue, as a site could.
 * - pirax_harness_fail_mail: ['match' => [substrings], 'times' => n] makes the next n matching
 *   final mails fail like a broken transport (wp_mail() returns false and fires wp_mail_failed);
 *   with 'throw' => true they throw instead, like a transport raising an exception.
 * - pirax_harness_gf_async_feeds: Gravity Forms add-on feeds run in GF's background feed processor
 *   (its gform_is_feed_asynchronous filter) instead of synchronously.
 * - pirax_harness_direct_dispatch: a direct side-effect integration on the form plugins' own
 *   submission actions, outside their suppressible feed frameworks (recorded as gf-direct/ff-direct).
 */
add_filter(
	'gform_is_feed_asynchronous',
	static function ( $async ) {
		return get_option( 'pirax_harness_gf_async_feeds' ) ? true : $async;
	}
);

add_filter(
	'fluentform/notifying_async_email_notifications',
	static function ( $async ) {
		return get_option( 'pirax_harness_ff_async_email' ) ? true : $async;
	},
	20
);

add_filter(
	'pre_wp_mail',
	static function ( $short_circuit, $atts ) {
		$fail = get_option( 'pirax_harness_fail_mail' );
		if ( null !== $short_circuit || ! is_array( $fail ) || empty( $fail['times'] ) ) {
			return $short_circuit;
		}
		foreach ( (array) $fail['match'] as $needle ) {
			if ( false === strpos( (string) $atts['subject'], $needle ) ) {
				return $short_circuit;
			}
		}
		--$fail['times'];
		update_option( 'pirax_harness_fail_mail', $fail, false );
		pirax_harness_log( 'mail-failed', array( 'to' => array_values( (array) $atts['to'] ), 'subject' => (string) $atts['subject'] ) );
		if ( ! empty( $fail['throw'] ) ) {
			throw new RuntimeException( 'Pirax harness mail exception' );
		}
		do_action( 'wp_mail_failed', new WP_Error( 'wp_mail_failed', 'Pirax harness transport failure', array( 'to' => $atts['to'], 'subject' => $atts['subject'] ) ) );
		return false;
	},
	PHP_INT_MAX - 1,
	2
);

if ( get_option( 'pirax_harness_direct_dispatch' ) ) {
	add_action(
		'gform_after_submission',
		static function ( $entry, $form ) {
			pirax_harness_log( 'feeds', array( 'plugin' => 'gf-direct', 'form' => (int) $form['id'], 'entry' => (int) $entry['id'], 'feed' => 0 ) );
		},
		10,
		2
	);
	add_action(
		'fluentform/submission_inserted',
		static function ( $entry_id, $form_data, $form ) {
			pirax_harness_log( 'feeds', array( 'plugin' => 'ff-direct', 'form' => (int) $form->id, 'entry' => (int) $entry_id, 'feed' => 0 ) );
		},
		20,
		3
	);
}

/*
 * pirax_harness_competing_filters: later Gravity Forms filters that try to bring back what a
 * marked submission turns off: the ledger feeds (add-on-specific filter, which runs after the
 * generic and form-specific ones) and background notifications (form-specific filter).
 */
if ( get_option( 'pirax_harness_competing_filters' ) ) {
	add_filter(
		'gform_pirax-harness-ledger_pre_process_feeds',
		static function ( $feeds, $entry, $form ) {
			$all = GFAPI::get_feeds( null, $form['id'], 'pirax-harness-ledger' );
			return is_wp_error( $all ) ? $feeds : $all;
		},
		10,
		3
	);
	add_filter(
		'gform_pre_render',
		static function ( $form ) {
			add_filter( "gform_is_asynchronous_notifications_enabled_{$form['id']}", '__return_true' );
			return $form;
		}
	);
	add_filter(
		'gform_pre_validation',
		static function ( $form ) {
			add_filter( "gform_is_asynchronous_notifications_enabled_{$form['id']}", '__return_true' );
			return $form;
		}
	);
}

/*
 * pirax_harness_late_feed_types: a filter registered after every plugin has loaded (on init), at
 * PHP_INT_MAX like this plugin's own, that adds the ledger integration back to Fluent Forms'
 * active feed types for every submission.
 */
if ( get_option( 'pirax_harness_late_feed_types' ) ) {
	add_action(
		'init',
		static function () {
			add_filter(
				'fluentform/global_notification_active_types',
				static function ( $types ) {
					$types['pirax_ledger_feeds'] = 'pirax_ledger';
					return $types;
				},
				PHP_INT_MAX
			);
		}
	);
}

/*
 * pirax_harness_ff_delete_on_notify: <entry id>. Set after submitting, so only a later runner request
 * registers it: when FF's notification action for that entry starts (the runner has already loaded
 * the entry, form and response), the entry is deleted once with FF's native deleteEntries(), before
 * any priority-9 callback, like a concurrent native cleanup would.
 */
if ( get_option( 'pirax_harness_ff_delete_on_notify' ) ) {
	add_action(
		'fluentform/integration_notify_notifications',
		static function ( $feed, $form_data, $entry, $form ) {
			if ( (int) $entry->id !== (int) get_option( 'pirax_harness_ff_delete_on_notify' ) ) {
				return;
			}
			delete_option( 'pirax_harness_ff_delete_on_notify' );
			( new \FluentForm\App\Services\Submission\SubmissionService() )->deleteEntries( array( (int) $entry->id ), (int) $form->id );
		},
		8,
		4
	);
}

/*
 * CleanTalk binding fixtures (compatibility stack; off unless a test sets the option):
 * - pirax_harness_ct_rebind: after CleanTalk has bound its Fluent Forms check, replace that closure
 *   with a wrapper defined here that calls it, so the check still runs but is no longer recognizable.
 * - pirax_harness_ct_late: re-register CleanTalk's real checks after a submission was classified and
 *   before its hooks run (on unaudited hooks in between): a new Integrations closure for Fluent Forms
 *   (fluentform/filter_insert_data), and GF's testSpam callback (gform_field_validation).
 */
if ( get_option( 'pirax_harness_ct_rebind' ) ) {
	add_action(
		'plugins_loaded',
		static function () {
			global $wp_filter;
			foreach ( $wp_filter['fluentform/before_insert_submission']->callbacks[10] ?? array() as $callback ) {
				if ( $callback['function'] instanceof Closure && str_ends_with( ( new ReflectionFunction( $callback['function'] ) )->getFileName(), 'Cleantalk/Antispam/Integrations.php' ) ) {
					$original = $callback['function'];
					remove_action( 'fluentform/before_insert_submission', $original, 10 );
					add_action( 'fluentform/before_insert_submission', static fn( ...$args ) => $original( ...$args ), 10, 3 );
				}
			}
		},
		20
	);
}
if ( get_option( 'pirax_harness_ct_late' ) ) {
	add_filter(
		'fluentform/filter_insert_data',
		static function ( $data ) {
			global $apbct;
			new \Cleantalk\Antispam\Integrations( array( 'FluentForm' => array( 'hook' => 'fluentform/before_insert_submission', 'setting' => 'forms__contact_forms_test', 'ajax' => false ) ), (array) $apbct->settings );
			return $data;
		}
	);
	add_filter(
		'gform_field_validation',
		static function ( $result ) {
			add_filter( 'gform_entry_is_spam', 'apbct_form__gravityForms__testSpam', 999, 3 );
			return $result;
		}
	);
}

/*
 * pirax_harness_render_probe: around the Pirax Form Test settings page callback, record every
 * callback on form-plugin hooks (hook, priority, identity and object) and count option writes, so a
 * test can prove that rendering the compatibility panel changes neither.
 */
if ( get_option( 'pirax_harness_render_probe' ) ) {
	$pirax_harness_writes = 0;
	foreach ( array( 'added_option', 'updated_option', 'deleted_option' ) as $pirax_harness_hook ) {
		add_action(
			$pirax_harness_hook,
			static function () use ( &$pirax_harness_writes ) {
				++$pirax_harness_writes;
			}
		);
	}
	$pirax_harness_snapshot = static function ( $when ) use ( &$pirax_harness_writes ) {
		global $wp_filter;
		$hooks = array();
		foreach ( $wp_filter as $hook => $object ) {
			if ( preg_match( '#^(gform_|fluentform[/_])#', $hook ) ) {
				foreach ( $object->callbacks as $priority => $callbacks ) {
					foreach ( $callbacks as $key => $callback ) {
						$hooks[] = "$hook $priority $key";
					}
				}
			}
		}
		pirax_harness_log( 'render', array( 'when' => $when, 'hooks' => $hooks, 'writes' => $pirax_harness_writes ) );
	};
	add_action( 'settings_page_pirax-form-test', static fn() => $pirax_harness_snapshot( 'before' ), PHP_INT_MIN );
	add_action( 'settings_page_pirax-form-test', static fn() => $pirax_harness_snapshot( 'after' ), PHP_INT_MAX );
}
