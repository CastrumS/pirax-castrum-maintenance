<?php
/**
 * Signed self-updates from the repository's GitHub releases.
 *
 * The latest release carries pirax-form-test-manifest.json, {"version","package","sha256","audited"},
 * and pirax-form-test-manifest.json.sig, the base64 of the 64-byte detached Ed25519 signature over the
 * exact manifest bytes. WordPress is offered an update only from a manifest that verifies against
 * UPDATE_PUBLIC_KEY, is newer than the installed header and names this release's canonical package
 * URL. The package is downloaded again at install time against a freshly verified manifest that must
 * still match the offer, and is handed to the upgrader only if its SHA-256 matches. Any network,
 * signature or validation failure offers nothing and installs nothing.
 *
 * The channel and key are constants: nothing at runtime can replace them.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

const UPDATE_RELEASES_ROOT = 'https://github.com/CastrumS/pirax-castrum-maintenance/releases';
/** Base64 of the raw 32-byte Ed25519 public key; the private seed exists only as the PIRAX_HELPER_SIGNING_KEY repository secret. */
const UPDATE_PUBLIC_KEY = 'D8BfOn8TZC3jD+Hv5Q+p7SGPNGIYISVcMCqQWU0Dh9w=';
const UPDATE_BASENAME = 'pirax-form-test/pirax-form-test.php';
const UPDATE_SLUG = 'pirax-form-test';
const UPDATE_ERROR = 'pirax_form_test_update';

add_filter( 'pre_set_site_transient_update_plugins', __NAMESPACE__ . '\offer_update' );
add_filter( 'plugins_api', __NAMESPACE__ . '\update_details', 10, 3 );
add_filter( 'auto_update_plugin', __NAMESPACE__ . '\auto_update', 10, 2 );
// Last, so no later download handler can replace a refusal or a verified file.
add_filter( 'upgrader_pre_download', __NAMESPACE__ . '\download_update', PHP_INT_MAX, 4 );

/** The canonical package URL of a release version. */
function package_url( $version ) {
	return UPDATE_RELEASES_ROOT . '/download/v' . $version . '/pirax-form-test.zip';
}

/** Strict base64 of exactly $length raw bytes, or null. */
function decode_base64( $text, $length ) {
	$raw = is_string( $text ) ? base64_decode( $text, true ) : false;
	return false !== $raw && strlen( $raw ) === $length && base64_encode( $raw ) === $text ? $raw : null;
}

/**
 * The manifest as {version, package, sha256, audited} if $signature verifies over the exact bytes and
 * every field is well formed; otherwise null. Uses WordPress's sodium_compat when ext-sodium is absent.
 */
function verify_release( $bytes, $signature ) {
	$key       = decode_base64( UPDATE_PUBLIC_KEY, 32 );
	$signature = decode_base64( trim( (string) $signature ), 64 );
	if ( null === $key || null === $signature || ! is_string( $bytes ) || ! function_exists( 'sodium_crypto_sign_verify_detached' ) ) {
		return null;
	}
	try {
		if ( ! sodium_crypto_sign_verify_detached( $signature, $bytes, $key ) ) {
			return null;
		}
	} catch ( \Throwable $e ) {
		return null;
	}

	$manifest = json_decode( $bytes, true );
	if ( ! is_array( $manifest ) ) {
		return null;
	}
	$keys = array_keys( $manifest );
	sort( $keys );
	if ( array( 'audited', 'package', 'sha256', 'version' ) !== $keys ) {
		return null;
	}
	$version = $manifest['version'];
	if ( ! is_string( $version ) || ! preg_match( '/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$/D', $version ) ) {
		return null;
	}
	if ( package_url( $version ) !== $manifest['package'] ) {
		return null;
	}
	if ( ! is_string( $manifest['sha256'] ) || ! preg_match( '/^[0-9a-f]{64}$/D', $manifest['sha256'] ) ) {
		return null;
	}
	if ( ! is_array( $manifest['audited'] ) || ! $manifest['audited'] ) {
		return null;
	}
	foreach ( $manifest['audited'] as $plugin => $audited ) {
		if ( ! is_string( $plugin ) || '' === $plugin || ! is_string( $audited ) || '' === $audited ) {
			return null;
		}
	}
	return $manifest;
}

/** A small public release file, or null on any network or HTTP failure. */
function fetch_release_file( $url, $limit ) {
	$response = wp_safe_remote_get(
		$url,
		array(
			'timeout'             => 10,
			'redirection'         => 5,
			'limit_response_size' => $limit,
		)
	);
	return is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ? null : wp_remote_retrieve_body( $response );
}

/**
 * The verified latest release if it is newer than the installed helper, else null. The manifest is
 * fetched once per request unless $fresh; the installed version is read from the header on disk, so a
 * request that has just installed the release no longer offers it.
 */
function newer_release( $fresh = false ) {
	static $release = false;
	if ( $fresh || false === $release ) {
		$manifest  = UPDATE_RELEASES_ROOT . '/latest/download/pirax-form-test-manifest.json';
		$bytes     = fetch_release_file( $manifest, 65536 );
		$signature = null === $bytes ? null : fetch_release_file( $manifest . '.sig', 1024 );
		$release   = null === $signature ? null : verify_release( $bytes, $signature );
	}
	$installed = get_file_data( dirname( __DIR__ ) . '/pirax-form-test.php', array( 'Version' => 'Version' ) )['Version'];
	return $release && '' !== $installed && version_compare( $release['version'], $installed, '>' ) ? $release : null;
}

/** pre_set_site_transient_update_plugins: offer only a verified newer release; never keep an old offer. */
function offer_update( $value ) {
	if ( ! is_object( $value ) ) {
		return $value;
	}
	$response = isset( $value->response ) && is_array( $value->response ) ? $value->response : array();
	unset( $response[ UPDATE_BASENAME ] );
	$release = newer_release();
	if ( $release ) {
		$response[ UPDATE_BASENAME ] = (object) array(
			'id'           => UPDATE_RELEASES_ROOT,
			'slug'         => UPDATE_SLUG,
			'plugin'       => UPDATE_BASENAME,
			'new_version'  => $release['version'],
			'url'          => UPDATE_RELEASES_ROOT,
			'package'      => $release['package'],
			'requires_php' => '7.4',
			// Identity of the offer, compared with the manifest verified again at install time.
			'sha256'       => $release['sha256'],
		);
	}
	$value->response = $response;
	return $value;
}

/** plugins_api: this helper's details from the verified release; an error (not a wordpress.org lookup) otherwise. */
function update_details( $result, $action, $args ) {
	if ( 'plugin_information' !== $action || ! is_object( $args ) || ! isset( $args->slug ) || UPDATE_SLUG !== $args->slug ) {
		return $result;
	}
	$release = newer_release();
	if ( ! $release ) {
		return new \WP_Error( UPDATE_ERROR, 'No verified Pirax Form Test update is available.' );
	}
	$audited = '';
	foreach ( $release['audited'] as $plugin => $version ) {
		$audited .= '<li>' . esc_html( $plugin . ' ' . $version ) . '</li>';
	}
	return (object) array(
		'name'          => 'Pirax Form Test',
		'slug'          => UPDATE_SLUG,
		'version'       => $release['version'],
		'author'        => 'Pirax',
		'homepage'      => UPDATE_RELEASES_ROOT,
		'requires'      => '6.4',
		'requires_php'  => '7.4',
		'external'      => true,
		'download_link' => $release['package'],
		'sections'      => array(
			'description' => '<p>' . esc_html( 'Signed release ' . $release['version'] . ' of the Pirax form test helper.' ) . '</p>',
			'changelog'   => '<p>Plugin versions audited for this release:</p><ul>' . $audited . '</ul>',
		),
	);
}

/** auto_update_plugin: always for this helper; every other decision is passed through unchanged. */
function auto_update( $update, $item ) {
	return is_object( $item ) && isset( $item->plugin ) && UPDATE_BASENAME === $item->plugin ? true : $update;
}

/**
 * upgrader_pre_download: the helper's package (by upgrade context or release URL) is downloaded here
 * and returned only when it is the offered release's verified package. A refusal is always a WP_Error:
 * returning false would let WordPress download the package unchecked.
 */
function download_update( $reply, $package, $upgrader = null, $hook_extra = array() ) {
	$context = is_array( $hook_extra ) && isset( $hook_extra['plugin'] ) && UPDATE_BASENAME === $hook_extra['plugin'];
	$ours    = is_string( $package ) && 0 === strpos( $package, UPDATE_RELEASES_ROOT . '/' );
	if ( ! $context && ! $ours ) {
		return $reply;
	}
	if ( is_wp_error( $reply ) ) {
		return $reply;
	}
	$refuse = static function ( $why ) {
		return new \WP_Error( UPDATE_ERROR, 'Pirax Form Test update refused: ' . $why );
	};
	if ( false !== $reply ) {
		return $refuse( 'another download handler answered first.' );
	}
	if ( ! $context ) {
		return $refuse( 'this package is installed only as an update of the helper.' );
	}
	$release = newer_release( true );
	if ( ! $release ) {
		return $refuse( 'no verified newer release is available.' );
	}
	$updates = get_site_transient( 'update_plugins' );
	$offer   = is_object( $updates ) && isset( $updates->response[ UPDATE_BASENAME ] ) ? (array) $updates->response[ UPDATE_BASENAME ] : array();
	if ( $package !== $release['package'] || ( $offer['package'] ?? null ) !== $release['package']
		|| ( $offer['new_version'] ?? null ) !== $release['version'] || ( $offer['sha256'] ?? null ) !== $release['sha256'] ) {
		return $refuse( 'the release changed since it was offered; check for updates again.' );
	}
	$file = download_url( $package );
	if ( is_wp_error( $file ) ) {
		return $refuse( 'download failed: ' . $file->get_error_message() );
	}
	if ( ! hash_equals( $release['sha256'], (string) hash_file( 'sha256', $file ) ) ) {
		wp_delete_file( $file );
		return $refuse( 'the package does not match the signed release.' );
	}
	return $file;
}
