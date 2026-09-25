<?php
/**
 * Marker parsing and marked context (plan D2, D4).
 *
 * A marker is `<token>-<id>`, id `[a-z0-9]{6,32}`, found only in submitted field values that an
 * adapter passes in (already unslashed once). Nothing here reads $_GET, $_POST, $_COOKIE or keys.
 *
 * Adapter API:
 *   parse( $values, $token = null )  ['state' => 'ordinary'|'marked'|'invalid-marker', 'id' => ?string, 'reason' => null|'malformed'|'ambiguous']
 *   mark( $id )                      true, or WP_Error (pirax_form_test_marker / pirax_form_test_config) and nothing is marked
 *   push_context( ?$id ) / pop_context()   scoped worker context (e.g. a queued notification job); always pop in `finally`
 *   current_id()                     id protecting mail right now, or null
 *   config_error()                   WP_Error when marked mail could not be redirected safely, else null
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

const ID_PATTERN = '[a-z0-9]{6,32}';

/** Adapter rejection texts (literal interface shared with form-check). */
const BLOCKED_MESSAGE = 'Pirax test blocked: integrations could not be suppressed';
const MARKER_MESSAGE  = 'Pirax test blocked: invalid test marker';
const CONFIG_MESSAGE  = 'Pirax test blocked: test configuration is invalid';

function id_is_valid( $id ) {
	return is_string( $id ) && 1 === preg_match( '/^' . ID_PATTERN . '$/D', $id );
}

/**
 * Classify submitted values (scalar or nested arrays; keys and non-strings are ignored).
 * The token is matched literally. A token occurrence not followed by `-<id>` and a boundary
 * (anything but [A-Za-z0-9_-], e.g. end, space or `@`) is malformed; two different ids are ambiguous.
 */
function parse( $values, $token = null ) {
	$token = null === $token ? token() : (string) $token;
	$ids   = array();
	$bad   = false;
	$leafs = is_array( $values ) ? $values : array( $values );
	if ( '' !== $token ) {
		array_walk_recursive(
			$leafs,
			static function ( $value ) use ( $token, &$ids, &$bad ) {
				if ( ! is_string( $value ) ) {
					return;
				}
				for ( $at = strpos( $value, $token ); false !== $at; $at = strpos( $value, $token, $at + strlen( $token ) ) ) {
					if ( preg_match( '/\G-(' . ID_PATTERN . ')(?![A-Za-z0-9_-])/', $value, $m, 0, $at + strlen( $token ) ) ) {
						$ids[ $m[1] ] = true;
					} else {
						$bad = true;
					}
				}
			}
		);
	}
	if ( $bad || count( $ids ) > 1 ) {
		return array( 'state' => 'invalid-marker', 'id' => null, 'reason' => $bad ? 'malformed' : 'ambiguous' );
	}
	return $ids
		? array( 'state' => 'marked', 'id' => (string) key( $ids ), 'reason' => null )
		: array( 'state' => 'ordinary', 'id' => null, 'reason' => null );
}

/** Marked-mail configuration problem, or null when a token and one valid redirect are set. */
function config_error() {
	return '' !== token() && redirect_is_valid( redirect() )
		? null
		: new \WP_Error( 'pirax_form_test_config', CONFIG_MESSAGE );
}

/** Per-request state: the submission marker (kept until request end) and the worker stack. */
function &state() {
	static $state = array( 'request' => null, 'stack' => array() );
	return $state;
}

/** Mark the current request as test submission $id. Configuration is checked first. */
function mark( $id ) {
	$state = &state();
	if ( ! id_is_valid( $id ) || ( null !== $state['request'] && $state['request'] !== $id ) ) {
		return new \WP_Error( 'pirax_form_test_marker', MARKER_MESSAGE );
	}
	$error = config_error();
	if ( $error ) {
		return $error;
	}
	$state['request'] = $id;
	return true;
}

/** Enter a worker scope for a stored submission; null for an unmarked one. */
function push_context( $id ) {
	if ( null !== $id && ! id_is_valid( $id ) ) {
		throw new \InvalidArgumentException( 'Invalid Pirax test id' );
	}
	$state            = &state();
	$state['stack'][] = $id;
}

function pop_context() {
	$state = &state();
	array_pop( $state['stack'] );
}

/**
 * Innermost marked worker scope, else the request marker. An unmarked scope never unprotects mail
 * inside a marked request or scope: a test submission's mail must not reach clients.
 */
function current_id() {
	$state = &state();
	foreach ( array_reverse( $state['stack'] ) as $id ) {
		if ( null !== $id ) {
			return $id;
		}
	}
	return $state['request'];
}
