<?php
/**
 * Integration preflight (plan D8; helper-compat D1–D3): a marked submission is only processed when
 * the form plugin and every applicable optional plugin (Fluent Forms Pro for FF; CleanTalk and
 * FluentSMTP for both) are the exact audited versions, and every callback on the form plugin's
 * submission side-effect hooks is one this plugin was audited against: either safe, or one of the
 * exactly identified CleanTalk/Pro bindings that are removed for the marked submission before they
 * run. Anything else (another integration hooked straight into the submission, payment or post
 * creation) makes the marked submission fail with BLOCKED_MESSAGE.
 *
 * Callbacks are identified by declaring class::method, function name, or for closures by the
 * file they are defined in; never by the plugin directory alone. Native feed frameworks (GF's
 * feed add-ons, FF's global feed dispatch) are allowed because the adapters suppress them.
 *
 * compatibility_report() is side-effect-free and shared by the submission preflight and the
 * settings panel; only suppress()/restore_suppressed() change hooks, and only for marked work.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

/** Exactly the audited versions; any other, a later patch release included, is rejected until re-audited. */
const AUDITED_VERSIONS = array(
	'gf'          => '3.1.2',
	'ff'          => '6.2.14',
	'ff_pro'      => '6.2.14',
	'cleantalk'   => '6.88',
	'fluent_smtp' => '2.4.0',
);

const PLUGIN_LABELS = array(
	'gf'          => 'Gravity Forms',
	'ff'          => 'Fluent Forms',
	'ff_pro'      => 'Fluent Forms Pro',
	'cleantalk'   => 'Anti-Spam by CleanTalk',
	'fluent_smtp' => 'FluentSMTP',
);

/** Optional plugins that take part in each form plugin's submissions (when active). */
const OPTIONAL_PLUGINS = array(
	'gf' => array( 'cleantalk', 'fluent_smtp' ),
	'ff' => array( 'ff_pro', 'cleantalk', 'fluent_smtp' ),
);

/** CleanTalk's per-integration closure (Cleantalk\Antispam\Integrations::__construct), bound to 'FluentForm'. */
const CLEANTALK_FF_CLOSURE = 'closure:cleantalk-spam-protect/lib/Cleantalk/Antispam/Integrations.php';

/** hook => callbacks allowed on it (besides this plugin's own). Form-specific GF variants allow none. */
function audited_hooks( $plugin ) {
	$gf_honeypot = 'Gravity_Forms\Gravity_Forms\Honeypot\GF_Honeypot_Handler::';
	$ff_email    = 'FluentForm\App\Services\FormBuilder\Notifications\EmailNotificationActions::';
	$ff_actions  = 'closure:fluentform/app/Hooks/actions.php';
	$hooks       = array(
		'gf' => array(
			'gform_validation'                         => array( $gf_honeypot . 'cache_invalid_state_counts' ),
			'gform_abort_submission_with_confirmation' => array( $gf_honeypot . 'handle_abort_submission' ),
			'gform_pre_submission'                     => array(),
			'gform_pre_submission_filter'              => array(),
			'gform_entry_id_pre_save_lead'             => array(),
			'gform_entry_created'                      => array(),
			'gform_entry_is_spam'                      => array( $gf_honeypot . 'handle_entry_is_spam' ),
			// GF's feed framework, whose feeds the adapter empties (gform_addon_pre_process_feeds).
			'gform_entry_post_save'                    => array( 'GFFeedAddOn::maybe_process_feed' ),
			'gform_pre_handle_confirmation'            => array(),
			'gform_after_submission'                   => array( $gf_honeypot . 'handle_after_submission' ),
			'gform_post_submission'                    => array(),
			'gform_after_email'                        => array(),
			'gform_delete_entry'                       => array(),
		),
		'ff' => array(
			// Native honeypot and token spam checks.
			'fluentform/before_insert_submission'           => array( $ff_actions ),
			'fluentform_before_insert_submission'           => array(),
			'fluentform/before_insert_payment_form'         => array(),
			'fluentform_before_insert_payment_form'         => array(),
			// Native on-submit payment emails; redirected like any marked mail.
			'fluentform/notify_on_form_submit'              => array( $ff_email . 'notifyOnSubmitPaymentForm' ),
			'fluentform/before_form_actions_processing'     => array(),
			'fluentform_before_form_actions_processing'     => array(),
			// Native global feed dispatch, which the adapter narrows to the email feed.
			'fluentform/submission_inserted'                => array( $ff_actions ),
			'fluentform_submission_inserted'                => array(),
			'fluentform/submission_inserted_form_form'      => array(),
			'fluentform_submission_inserted_form_form'      => array(),
			'fluentform/before_submission_confirmation'     => array(),
			'fluentform_before_submission_confirmation'     => array(),
			'fluentform/integration_notify_notifications'   => array( $ff_email . 'notify' ),
			'fluentform_integration_notify_notifications'   => array(),
			// Native password-value truncation.
			'fluentform/global_notify_completed'            => array( $ff_actions ),
			'fluentform_global_notify_completed'            => array(),
			'fluentform/before_deleting_entries'            => array(),
			'fluentform/after_deleting_submissions'         => array(),
		),
	);
	return $hooks[ $plugin ];
}

/**
 * hook => callback id => [owner plugin, priority]: audited bindings with side effects that a marked
 * submission removes before they run (audit: test/plugin/README.md). Each counts as audited only
 * while its owner is the audited version and it sits at exactly this priority.
 */
function suppressed_callbacks( $plugin ) {
	$bindings = array(
		'gf' => array(
			// Moderation request, spam verdict and entry deletion; and its spam confirmation text.
			'gform_entry_is_spam' => array( 'apbct_form__gravityForms__testSpam' => array( 'cleantalk', 999 ) ),
			'gform_confirmation'  => array( 'apbct_form__gravityForms__showResponse' => array( 'cleantalk', 999 ) ),
		),
		'ff' => array(
			// Moderation request and spam verdict.
			'fluentform/before_insert_submission'       => array( CLEANTALK_FF_CLOSURE => array( 'cleantalk', 10 ) ),
			// Opt-in / approval mail, entry status change and early JSON response instead of notifications.
			'fluentform/before_form_actions_processing' => array(
				'FluentFormPro\classes\DoubleOptin::processOnSubmission' => array( 'ff_pro', 10 ),
				'FluentFormPro\classes\AdminApproval\AdminApproval::processOnSubmission' => array( 'ff_pro', 10 ),
			),
			// Deletes the visitor's saved and step-form drafts.
			'fluentform/submission_inserted'            => array( 'FluentFormPro\classes\DraftSubmissionsManager::delete' => array( 'ff_pro', 10 ) ),
			// "Delete entry on submission": would delete the entry before the helper's own cleanup.
			'fluentform/global_notify_completed'        => array( 'closure:fluentformpro/fluentformpro.php' => array( 'ff_pro', 10 ) ),
		),
	);
	return $bindings[ $plugin ];
}

/** Stable identity of a hooked callback. */
function callback_id( $callback ) {
	try {
		if ( is_string( $callback ) && false === strpos( $callback, '::' ) ) {
			return ltrim( $callback, '\\' );
		}
		if ( $callback instanceof \Closure ) {
			$file = wp_normalize_path( ( new \ReflectionFunction( $callback ) )->getFileName() );
			foreach ( array( WP_PLUGIN_DIR, WPMU_PLUGIN_DIR, ABSPATH ) as $root ) {
				$root = trailingslashit( wp_normalize_path( $root ) );
				if ( 0 === strpos( $file, $root ) ) {
					return 'closure:' . substr( $file, strlen( $root ) );
				}
			}
			return 'closure:' . $file;
		}
		if ( is_string( $callback ) ) {
			$callback = explode( '::', $callback, 2 );
		}
		if ( is_object( $callback ) ) {
			$callback = array( $callback, '__invoke' );
		}
		$method = new \ReflectionMethod( $callback[0], $callback[1] );
		return $method->getDeclaringClass()->getName() . '::' . $method->getName();
	} catch ( \ReflectionException $e ) {
		return 'unknown';
	}
}

/** Active plugin's version: null when not active, '' when active but its version cannot be read. */
function detected_version( $key ) {
	switch ( $key ) {
		case 'gf':
			return class_exists( 'GFForms' ) ? (string) \GFForms::$version : null;
		case 'ff':
			return defined( 'FLUENTFORM_VERSION' ) ? (string) FLUENTFORM_VERSION : null;
		case 'ff_pro':
			return defined( 'FLUENTFORMPRO_VERSION' ) ? (string) FLUENTFORMPRO_VERSION : ( defined( 'FLUENTFORMPRO' ) ? '' : null );
		case 'cleantalk':
			return defined( 'APBCT_VERSION' ) ? (string) APBCT_VERSION : ( defined( 'CLEANTALK_PLUGIN_DIR' ) ? '' : null );
		case 'fluent_smtp':
			return defined( 'FLUENTMAIL_PLUGIN_VERSION' ) ? (string) FLUENTMAIL_PLUGIN_VERSION : ( defined( 'FLUENTMAIL_PLUGIN_FILE' ) ? '' : null );
	}
	return null;
}

function version_is_audited( $plugin, $version ) {
	return AUDITED_VERSIONS[ $plugin ] === (string) $version;
}

/** True when $callback at $priority on $hook is an audited suppressible binding of a verified owner version. */
function is_suppressible( $plugin, $hook, $priority, $callback, $id ) {
	$rule = suppressed_callbacks( $plugin )[ $hook ][ $id ] ?? null;
	if ( ! $rule || $rule[1] !== (int) $priority || ! version_is_audited( $rule[0], detected_version( $rule[0] ) ) ) {
		return false;
	}
	if ( CLEANTALK_FF_CLOSURE === $id ) {
		// That file binds one closure per integration; only the Fluent Forms one is audited here.
		$function = new \ReflectionFunction( $callback );
		return $function->getClosureThis() instanceof \Cleantalk\Antispam\Integrations
			&& 'FluentForm' === ( $function->getStaticVariables()['integration_name'] ?? null );
	}
	return true;
}

/**
 * Registered callbacks on $hooks (hook => allowed ids) and on $plugin's suppression hooks:
 * 'unaudited' (hook, priority, id) on $hooks, and 'suppress' (hook, priority, id, function,
 * accepted_args) for the audited suppressible bindings. Reads only.
 */
function callback_findings( array $hooks, $plugin = null ) {
	global $wp_filter;
	$found      = array( 'unaudited' => array(), 'suppress' => array() );
	$suppressed = $plugin ? suppressed_callbacks( $plugin ) : array();
	foreach ( array_keys( $hooks + $suppressed ) as $hook ) {
		if ( empty( $wp_filter[ $hook ] ) ) {
			continue;
		}
		foreach ( $wp_filter[ $hook ]->callbacks as $priority => $callbacks ) {
			foreach ( $callbacks as $callback ) {
				$id = callback_id( $callback['function'] );
				if ( $plugin && is_suppressible( $plugin, $hook, $priority, $callback['function'], $id ) ) {
					$found['suppress'][] = array( 'hook' => $hook, 'priority' => (int) $priority, 'id' => $id ) + $callback;
				} elseif ( isset( $hooks[ $hook ] ) && 0 !== strpos( $id, __NAMESPACE__ . '\\' ) && ! in_array( $id, $hooks[ $hook ], true ) ) {
					$found['unaudited'][] = array( 'hook' => $hook, 'priority' => (int) $priority, 'id' => $id );
				}
			}
		}
	}
	return $found;
}

/** Callbacks on $hooks (hook => allowed ids) that are neither audited nor this plugin's own. */
function unaudited_callbacks( array $hooks, $plugin = null ) {
	return array_map(
		static function ( $callback ) {
			return "{$callback['hook']}: {$callback['id']}";
		},
		callback_findings( $hooks, $plugin )['unaudited']
	);
}

/**
 * Audited hooks to inspect. GF also runs form-specific variants (hook_<form id>), which allow no
 * callbacks: a submission checks its own form's; the overview checks every registered one.
 */
function inspected_hooks( $plugin, $form = null ) {
	global $wp_filter;
	$hooks = audited_hooks( $plugin );
	if ( 'gf' !== $plugin ) {
		return $hooks;
	}
	$variants = null === $form
		? preg_grep( '/^(?:' . implode( '|', array_map( 'preg_quote', array_keys( $hooks ) ) ) . ')_\d+$/', array_keys( (array) $wp_filter ) )
		: array_map(
			static function ( $hook ) use ( $form ) {
				return $hook . '_' . (int) $form['id'];
			},
			array_keys( $hooks )
		);
	return $hooks + array_fill_keys( $variants, array() );
}

/**
 * Suppression hooks where CleanTalk's check is switched on for this request but its audited binding
 * is not there to remove: changed or unrecognizable, so it could still run. CleanTalk binds FF from
 * its contact-form setting, and GF only on public requests (apbct_init).
 */
function cleantalk_unrecognized( $plugin, array $suppress ) {
	global $apbct;
	$version = detected_version( 'cleantalk' );
	if ( null === $version || ! version_is_audited( 'cleantalk', $version ) ) {
		return array(); // Absent, or already blocked by its version.
	}
	if ( 'ff' === $plugin ) {
		$expected = isset( $apbct->settings ) && empty( $apbct->settings['forms__contact_forms_test'] ) ? array() : array( 'fluentform/before_insert_submission' );
	} else {
		$expected = has_action( 'plugins_loaded', 'apbct_init' ) ? array( 'gform_entry_is_spam', 'gform_confirmation' ) : array();
	}
	return array_values( array_diff( $expected, array_column( $suppress, 'hook' ) ) );
}

/**
 * Side-effect-free compatibility facts for $plugin ('gf'|'ff'): 'versions' (key => version|null,
 * audited) for the core and each active optional plugin, 'unaudited' callbacks, the 'suppress'
 * bindings a marked submission would remove, 'reasons' it would be blocked and 'ready'.
 * $form narrows GF's form-specific hooks to that form; null inspects every registered variant.
 */
function compatibility_report( $plugin, $form = null ) {
	$versions = array();
	$reasons  = array();
	foreach ( array_merge( array( $plugin ), OPTIONAL_PLUGINS[ $plugin ] ) as $key ) {
		$version = detected_version( $key );
		if ( null === $version && $key !== $plugin ) {
			continue;
		}
		$audited          = null !== $version && version_is_audited( $key, $version );
		$versions[ $key ] = array( 'version' => $version, 'audited' => $audited );
		if ( null === $version ) {
			$reasons[] = PLUGIN_LABELS[ $key ] . ' is not active';
		} elseif ( ! $audited ) {
			$reasons[] = sprintf( '%s %s is not the audited %s', PLUGIN_LABELS[ $key ], '' === $version ? '(unknown version)' : $version, AUDITED_VERSIONS[ $key ] );
		}
	}
	$findings = callback_findings( inspected_hooks( $plugin, $form ), $plugin );
	if ( $findings['unaudited'] ) {
		$reasons[] = sprintf( '%d unaudited callback(s) on submission hooks', count( $findings['unaudited'] ) );
	}
	foreach ( cleantalk_unrecognized( $plugin, $findings['suppress'] ) as $hook ) {
		$reasons[] = "CleanTalk's check on $hook could not be identified";
	}
	return array(
		'versions'  => $versions,
		'unaudited' => $findings['unaudited'],
		'suppress'  => array_map(
			static function ( $binding ) {
				return array_intersect_key( $binding, array_flip( array( 'hook', 'priority', 'id' ) ) );
			},
			$findings['suppress']
		),
		'reasons'   => $reasons,
		'ready'     => ! $reasons,
	);
}

/** True when a marked submission of this GF form can be fully suppressed. */
function gf_supported( array $form ) {
	return class_exists( 'GFForms' ) && ! \GFCommon::has_post_field( $form['fields'] ) && compatibility_report( 'gf', $form )['ready'];
}

/** True when a marked submission of this FF form can be fully suppressed. */
function ff_supported( $form ) {
	return empty( $form->has_payment ) && 'form' === $form->type && compatibility_report( 'ff' )['ready'];
}

/** Bindings removed for marked work in this request, for restore_suppressed(). */
function &suppressed_bindings() {
	static $removed = array();
	return $removed;
}

/**
 * Remove $plugin's audited suppressible bindings (again, if something re-registered them) for
 * marked work. True when none is left afterwards.
 */
function suppress( $plugin ) {
	$removed = &suppressed_bindings();
	$hooks   = array_fill_keys( array_keys( suppressed_callbacks( $plugin ) ), array() );
	foreach ( callback_findings( $hooks, $plugin )['suppress'] as $binding ) {
		remove_filter( $binding['hook'], $binding['function'], $binding['priority'] );
		$removed[] = $binding;
	}
	return ! callback_findings( $hooks, $plugin )['suppress'];
}

/** Put removed bindings back at their priorities before ordinary work runs in the same request. */
function restore_suppressed() {
	$removed = &suppressed_bindings();
	foreach ( $removed as $binding ) {
		add_filter( $binding['hook'], $binding['function'], $binding['priority'], $binding['accepted_args'] );
	}
	$removed = array();
}

/**
 * Classification boundary of a marked submission: supported, and every audited side-effect binding
 * was removed before the submission's hooks run. The adapters' dispatch guards keep them removed.
 */
function prepare_marked_submission( $plugin, $form ) {
	return ( 'gf' === $plugin ? gf_supported( $form ) : ff_supported( $form ) ) && suppress( $plugin );
}
