<?php
/**
 * Gravity Forms adapter (plan D6). A marked, supported submission:
 * - is detected from its posted field inputs before any field (CAPTCHA included) is validated;
 * - passes only the validation of GF's own CAPTCHA field (the field's server check still runs, its
 *   result is overridden); every other field, honeypot and spam check still applies;
 * - runs no add-on feeds (sync or background) and sends its notifications synchronously, even
 *   with GF background notifications on, so mail goes out (redirected) before the entry is deleted;
 * - has its entry deleted through GFAPI at the end of gform_after_submission.
 * Unsafe marked submissions (unsupported integrations, bad marker or settings) fail validation
 * with the literal rejection message before anything is saved. Ordinary submissions are untouched.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

add_filter( 'gform_pre_validation', __NAMESPACE__ . '\gf_detect', PHP_INT_MIN );
add_filter( 'gform_field_validation', __NAMESPACE__ . '\gf_captcha_validation', PHP_INT_MAX, 4 );
add_filter( 'gform_validation', __NAMESPACE__ . '\gf_reject', PHP_INT_MAX );
add_filter( 'gform_addon_pre_process_feeds', __NAMESPACE__ . '\gf_no_feeds', PHP_INT_MAX );
add_filter( 'gform_is_asynchronous_notifications_enabled', __NAMESPACE__ . '\gf_sync_notifications', PHP_INT_MAX );
add_action( 'gform_after_submission', __NAMESPACE__ . '\gf_delete_entry', PHP_INT_MAX, 2 );

/** Per-request verdict for each GF form: 'supported' or the rejection message. */
function &gf_verdicts() {
	static $verdicts = array();
	return $verdicts;
}

/** Posted values of the form's own field inputs (input_<field>[_<sub>]), unslashed once. */
function gf_posted_values( array $form ) {
	$ids    = array_map( 'intval', wp_list_pluck( $form['fields'], 'id' ) );
	$values = array();
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- read-only classification of the submission GF is validating.
	foreach ( $_POST as $name => $value ) {
		if ( preg_match( '/^input_(\d+)(?:_\d+)?$/', (string) $name, $m ) && in_array( (int) $m[1], $ids, true ) ) {
			$values[] = wp_unslash( $value );
		}
	}
	return $values;
}

function gf_detect( $form ) {
	if ( ! is_array( $form ) || empty( $form['fields'] ) ) {
		return $form;
	}
	$verdicts = &gf_verdicts();
	$form_id  = (int) $form['id'];
	unset( $verdicts[ $form_id ] );
	$parsed = parse( gf_posted_values( $form ) );
	if ( 'ordinary' === $parsed['state'] ) {
		return $form;
	}
	if ( 'invalid-marker' === $parsed['state'] ) {
		$verdicts[ $form_id ] = MARKER_MESSAGE;
		return $form;
	}
	$marked = mark( $parsed['id'] );
	if ( is_wp_error( $marked ) ) {
		$verdicts[ $form_id ] = $marked->get_error_message();
	} elseif ( ! gf_supported( $form ) ) {
		$verdicts[ $form_id ] = BLOCKED_MESSAGE;
	} else {
		$verdicts[ $form_id ] = 'supported';
		// Form- and add-on-specific variants run after the generic filters; empty them last too.
		add_filter( "gform_addon_pre_process_feeds_$form_id", __NAMESPACE__ . '\gf_no_feeds', PHP_INT_MAX );
		add_filter( "gform_is_asynchronous_notifications_enabled_$form_id", __NAMESPACE__ . '\gf_sync_notifications', PHP_INT_MAX );
		foreach ( \GFAddOn::get_registered_addons( true ) as $addon ) {
			if ( $addon instanceof \GFFeedAddOn ) {
				add_filter( 'gform_' . $addon->get_slug() . '_pre_process_feeds', __NAMESPACE__ . '\gf_no_feeds', PHP_INT_MAX );
				add_filter( 'gform_' . $addon->get_slug() . "_pre_process_feeds_$form_id", __NAMESPACE__ . '\gf_no_feeds', PHP_INT_MAX );
			}
		}
	}
	return $form;
}

function gf_is_supported( $form ) {
	$verdicts = &gf_verdicts();
	return 'supported' === ( isset( $verdicts[ (int) rgar( $form, 'id' ) ] ) ? $verdicts[ (int) rgar( $form, 'id' ) ] : null );
}

/** Only the CAPTCHA field of a marked, supported submission is accepted regardless of its verifier. */
function gf_captcha_validation( $result, $value, $form, $field ) {
	return is_object( $field ) && 'captcha' === $field->type && gf_is_supported( $form )
		? array( 'is_valid' => true, 'message' => '' )
		: $result;
}

/** Reject unsafe marked submissions before save; existing errors are kept. */
function gf_reject( $validation_result ) {
	$verdicts = &gf_verdicts();
	$form_id  = (int) rgars( $validation_result, 'form/id' );
	if ( isset( $verdicts[ $form_id ] ) && 'supported' !== $verdicts[ $form_id ] ) {
		$validation_result['is_valid'] = false;
		add_filter( "gform_validation_message_$form_id", __NAMESPACE__ . '\gf_rejection_message', PHP_INT_MAX, 2 );
	}
	return $validation_result;
}

function gf_rejection_message( $markup, $form ) {
	$verdicts = &gf_verdicts();
	return $markup . '<p class="pirax-form-test-rejected">' . esc_html( $verdicts[ (int) $form['id'] ] ) . '</p>';
}

/** No add-on feed runs or is queued while the request is a marked submission. */
function gf_no_feeds( $feeds ) {
	return null === current_id() ? $feeds : array();
}

function gf_sync_notifications( $enabled ) {
	return null === current_id() ? $enabled : false;
}

/** After native (synchronous) notifications: remove the marked entry and its related data. */
function gf_delete_entry( $entry, $form ) {
	if ( null !== current_id() && gf_is_supported( $form ) && ! empty( $entry['id'] ) ) {
		\GFAPI::delete_entry( (int) $entry['id'] );
	}
}
