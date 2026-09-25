<?php
/**
 * Removes Pirax Form Test's options and scheduled events. WordPress includes this file only when
 * the plugin is deleted; direct requests exit.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'pirax_form_test_token' );
delete_option( 'pirax_form_test_redirect' );
wp_clear_scheduled_hook( 'pirax_form_test_sweep' );
