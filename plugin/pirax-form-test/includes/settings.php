<?php
/**
 * Settings → Pirax Form Test: the shared marker token and the single redirect mailbox.
 *
 * Both render and save require manage_options; saving also requires the nonce. The token is never
 * printed back. A blank token field keeps the stored token; "clear" disables all test behaviour.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

const OPTION_TOKEN    = 'pirax_form_test_token';
const OPTION_REDIRECT = 'pirax_form_test_redirect';
const PAGE            = 'pirax-form-test';
const SAVE_ACTION     = 'pirax_form_test_save';

/** Configured marker token; '' when test behaviour is disabled. */
function token() {
	$token = get_option( OPTION_TOKEN, '' );
	return is_string( $token ) ? $token : '';
}

/** Configured redirect mailbox, unvalidated; see redirect_is_valid(). */
function redirect() {
	$redirect = get_option( OPTION_REDIRECT, '' );
	return is_string( $redirect ) ? $redirect : '';
}

/** Characters that survive form plugins' sanitizing unchanged; long enough to be unguessable. */
function token_is_valid( $token ) {
	return is_string( $token ) && 1 === preg_match( '/^[A-Za-z0-9._~+\/=-]{16,255}$/D', $token );
}

/** Exactly one mailbox: no lists, whitespace or CR/LF, and nothing is_email() would alter. */
function redirect_is_valid( $redirect ) {
	return is_string( $redirect ) && ! preg_match( '/[\s,;]/', $redirect ) && is_email( $redirect ) === $redirect;
}

/** '' when the pair may be stored, otherwise the notice code. */
function settings_error( $token, $redirect ) {
	if ( '' !== $token && ! token_is_valid( $token ) ) {
		return 'invalid-token';
	}
	if ( '' === $redirect ) {
		return '' === $token ? '' : 'redirect-required';
	}
	return redirect_is_valid( $redirect ) ? '' : 'invalid-redirect';
}

add_action(
	'admin_menu',
	static function () {
		add_options_page( 'Pirax Form Test', 'Pirax Form Test', 'manage_options', PAGE, __NAMESPACE__ . '\render_settings' );
	}
);
add_action( 'admin_post_' . SAVE_ACTION, __NAMESPACE__ . '\save_settings' );

function render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'Sorry, you are not allowed to access this page.' ), 403 );
	}
	$notices = array(
		'saved'             => array( 'success', 'Settings saved.' ),
		'invalid-token'     => array( 'error', 'Not saved: the token must be 16–255 characters of A–Z, a–z, 0–9 or . _ ~ + / = -' ),
		'invalid-redirect'  => array( 'error', 'Not saved: the redirect must be exactly one valid email address.' ),
		'redirect-required' => array( 'error', 'Not saved: a redirect address is required while a token is set.' ),
	);
	$code = isset( $_GET['pirax-form-test'] ) ? sanitize_key( wp_unslash( $_GET['pirax-form-test'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
	?>
	<div class="wrap">
		<h1>Pirax Form Test</h1>
		<?php if ( isset( $notices[ $code ] ) ) : ?>
			<div class="notice notice-<?php echo esc_attr( $notices[ $code ][0] ); ?>"><p><?php echo esc_html( $notices[ $code ][1] ); ?></p></div>
		<?php endif; ?>
		<form id="pirax-form-test-settings" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="<?php echo esc_attr( SAVE_ACTION ); ?>">
			<?php wp_nonce_field( SAVE_ACTION ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="pirax_form_test_token">Marker token</label></th>
					<td>
						<input type="password" id="pirax_form_test_token" name="pirax_form_test_token" class="regular-text" autocomplete="new-password" value="">
						<p id="pirax-form-test-token-status" class="description"><?php echo '' === token() ? 'Token is not set: test submissions are treated as ordinary submissions.' : 'A token is set. Leave blank to keep it.'; ?></p>
						<label><input type="checkbox" id="pirax_form_test_clear" name="pirax_form_test_clear" value="1"> Clear the token (disables test handling)</label>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="pirax_form_test_redirect">Redirect address</label></th>
					<td><input type="email" id="pirax_form_test_redirect" name="pirax_form_test_redirect" class="regular-text" value="<?php echo esc_attr( redirect() ); ?>"></td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

function save_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'Sorry, you are not allowed to manage these options.' ), 403 );
	}
	check_admin_referer( SAVE_ACTION );

	$field    = static function ( $name ) {
		return isset( $_POST[ $name ] ) && is_string( $_POST[ $name ] ) ? wp_unslash( $_POST[ $name ] ) : ''; // phpcs:ignore WordPress.Security -- nonce checked above; validated, never altered.
	};
	$typed    = $field( 'pirax_form_test_token' );
	$token    = '' !== $field( 'pirax_form_test_clear' ) ? '' : ( '' === $typed ? token() : $typed );
	$redirect = $field( 'pirax_form_test_redirect' );

	$code = settings_error( $token, $redirect );
	if ( '' === $code ) {
		update_option( OPTION_TOKEN, $token, false );
		update_option( OPTION_REDIRECT, $redirect, false );
		$code = 'saved';
	}
	wp_safe_redirect( add_query_arg( 'pirax-form-test', $code, admin_url( 'options-general.php?page=' . PAGE ) ) );
	exit;
}
