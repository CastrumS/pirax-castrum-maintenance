<?php
/**
 * Plugin Name: Pirax form test harness (test only)
 * Description: Local Playground observer. Never packaged into the production plugin ZIP.
 *
 * - Logs the final wp_mail arguments (after every wp_mail filter) and short-circuits sending.
 * - Answers Google reCAPTCHA siteverify with {"success":false} without network access.
 * - Keeps Action Scheduler from dispatching its own loopback runner; the harness drives queues.
 * - Registers ledger feeds through the real Gravity Forms feed add-on framework and the real
 *   Fluent Forms integration framework, recording each native execution.
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
		return true;
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
