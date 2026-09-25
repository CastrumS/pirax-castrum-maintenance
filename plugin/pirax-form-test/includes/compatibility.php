<?php
/**
 * Integration preflight (plan D8): a marked submission is only processed when every callback on
 * the form plugin's submission side-effect hooks is one this plugin was audited against, and the
 * form plugin is an audited version. Anything else (another integration hooked straight into the
 * submission, payment or post creation) makes the marked submission fail with BLOCKED_MESSAGE.
 *
 * Callbacks are identified by declaring class::method, function name, or for closures by the
 * file they are defined in; never by the plugin directory alone. Native feed frameworks (GF's
 * feed add-ons, FF's global feed dispatch) are allowed because the adapters suppress them.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

/** Exactly the audited versions; any other, a later patch release included, is rejected until re-audited. */
const AUDITED_VERSIONS = array(
	'gf' => '3.1.2',
	'ff' => '6.2.14',
);

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

/** Callbacks on $hooks (hook => allowed ids) that are neither audited nor this plugin's own. */
function unaudited_callbacks( array $hooks ) {
	global $wp_filter;
	$found = array();
	foreach ( $hooks as $hook => $allowed ) {
		if ( empty( $wp_filter[ $hook ] ) ) {
			continue;
		}
		foreach ( $wp_filter[ $hook ]->callbacks as $callbacks ) {
			foreach ( $callbacks as $callback ) {
				$id = callback_id( $callback['function'] );
				if ( 0 !== strpos( $id, __NAMESPACE__ . '\\' ) && ! in_array( $id, $allowed, true ) ) {
					$found[] = "$hook: $id";
				}
			}
		}
	}
	return $found;
}

function version_is_audited( $plugin, $version ) {
	return AUDITED_VERSIONS[ $plugin ] === (string) $version;
}

/** True when a marked submission of this GF form can be fully suppressed. */
function gf_supported( array $form ) {
	if ( ! class_exists( 'GFForms' ) || ! version_is_audited( 'gf', \GFForms::$version ) || \GFCommon::has_post_field( $form['fields'] ) ) {
		return false;
	}
	$hooks = array();
	foreach ( audited_hooks( 'gf' ) as $hook => $allowed ) {
		$hooks[ $hook ]                           = $allowed;
		$hooks[ $hook . '_' . (int) $form['id'] ] = array();
	}
	return ! unaudited_callbacks( $hooks );
}

/** True when a marked submission of this FF form can be fully suppressed. */
function ff_supported( $form ) {
	if ( ! defined( 'FLUENTFORM_VERSION' ) || ! version_is_audited( 'ff', FLUENTFORM_VERSION ) || ! empty( $form->has_payment ) || 'form' !== $form->type ) {
		return false;
	}
	return ! unaudited_callbacks( audited_hooks( 'ff' ) );
}
