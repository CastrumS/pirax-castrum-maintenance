<?php
/**
 * Plugin Name:       Pirax Form Test
 * Description:       Redirects marked Pirax test form submissions to the operator's test mailbox and keeps them away from clients.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Author:            Pirax
 * License:           GPL-2.0-or-later
 *
 * Every module is required, so a damaged package fails loudly instead of treating test submissions
 * as ordinary; each adapter guards for its own form plugin being absent.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

const SWEEP_HOOK = 'pirax_form_test_sweep';

require_once __DIR__ . '/includes/settings.php';
require_once __DIR__ . '/includes/marker.php';
require_once __DIR__ . '/includes/mail.php';
require_once __DIR__ . '/includes/compatibility.php';
require_once __DIR__ . '/includes/gravity-forms.php';
require_once __DIR__ . '/includes/fluent-forms.php';
require_once __DIR__ . '/includes/cleanup.php';

/** Create both options with autoload off and schedule one hourly recovery event (idempotent). */
function activate() {
	add_option( OPTION_TOKEN, '', '', false );
	add_option( OPTION_REDIRECT, '', '', false );
	wp_set_options_autoload( array( OPTION_TOKEN, OPTION_REDIRECT ), false );
	if ( ! wp_next_scheduled( SWEEP_HOOK ) ) {
		wp_schedule_event( time() + HOUR_IN_SECONDS, 'hourly', SWEEP_HOOK );
	}
}

function deactivate() {
	wp_clear_scheduled_hook( SWEEP_HOOK );
}

register_activation_hook( __FILE__, __NAMESPACE__ . '\activate' );
register_deactivation_hook( __FILE__, __NAMESPACE__ . '\deactivate' );
