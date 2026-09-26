<?php
/**
 * Marked mail (plan D5): while current_id() is set, every wp_mail() call goes only to the
 * configured redirect, without To/Cc/Bcc (or Resent-*) headers (named as wp_mail() parses them, so
 * control-character padding cannot hide one), tagged `X-Pirax-Form-Test: <id>` and with the subject
 * prefixed `[pirax-test <id>] ` once. Body, attachments, From, Reply-To and other headers are kept,
 * and delivery stays on the site's own mail path. The plugin never sends mail itself.
 *
 * If the redirect is unusable, or a later filter undoes the transformation, marked mail fails
 * (wp_mail() returns false, `wp_mail_failed` fires) rather than reaching the original recipients.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

add_filter( 'wp_mail', __NAMESPACE__ . '\filter_mail', PHP_INT_MAX );
add_filter( 'pre_wp_mail', __NAMESPACE__ . '\guard_mail', PHP_INT_MIN, 2 );

/** Pure, idempotent transformation of wp_mail() arguments for test submission $id. */
function transform_mail( array $atts, $id, $redirect ) {
	// Normalise string/array headers into logical lines, unfolding continuation lines.
	$lines = array();
	foreach ( (array) ( isset( $atts['headers'] ) ? $atts['headers'] : array() ) as $header ) {
		foreach ( preg_split( '/\r\n|\r|\n/', (string) $header ) as $line ) {
			if ( '' === trim( $line ) ) {
				continue;
			}
			if ( preg_match( '/^[ \t]/', $line ) ) {
				if ( $lines ) { // A continuation without a header to continue is dropped.
					$lines[ count( $lines ) - 1 ] .= ' ' . ltrim( $line );
				}
				continue;
			}
			$lines[] = $line;
		}
	}
	// Match header names exactly as wp_mail() reads them: trimmed (control characters included) up to the first colon.
	$headers   = array_filter(
		$lines,
		static function ( $line ) {
			return ! preg_match( '/^(?:(?:resent-)?(?:to|cc|bcc)|x-pirax-form-test)$/i', trim( explode( ':', trim( $line ), 2 )[0] ) );
		}
	);
	$headers[] = 'X-Pirax-Form-Test: ' . $id;
	$subject   = preg_replace( '/^(?:\[pirax-test ' . ID_PATTERN . '\] )+/', '', (string) $atts['subject'] );

	return array_merge(
		$atts,
		array(
			'to'      => array( $redirect ),
			'subject' => "[pirax-test $id] $subject",
			'headers' => array_values( $headers ),
		)
	);
}

function filter_mail( $atts ) {
	$id = current_id();
	return null === $id || config_error() ? $atts : transform_mail( $atts, $id, redirect() );
}

/** Earliest pre_wp_mail: only correctly transformed marked mail may continue to a transport. */
function guard_mail( $short_circuit, $atts ) {
	$id = current_id();
	if ( null === $id ) {
		return $short_circuit;
	}
	$error = config_error();
	if ( ! $error ) {
		$expected = transform_mail( $atts, $id, redirect() );
		if ( $expected['to'] === $atts['to'] && $expected['subject'] === $atts['subject'] && $expected['headers'] === $atts['headers'] ) {
			return $short_circuit;
		}
		$error = new \WP_Error( 'pirax_form_test_mail', 'Pirax test mail was altered after redirection; not sent' );
	}
	do_action( 'wp_mail_failed', $error );
	return false;
}
