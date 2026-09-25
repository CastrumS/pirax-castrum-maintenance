<?php
/*
 * Test-only site fixtures, run once by harness.ts through Playground's PHP API after WordPress
 * boots. Uses the form plugins' own APIs/tables so the forms, notifications and feeds are native.
 * The harness wraps this file in a closure; its return value becomes Harness fixture data.
 */

wp_set_current_user( 1 );

$users = array();
foreach ( array( 'editor' => 'editor', 'subscriber' => 'subscriber' ) as $login => $role ) {
	$id = username_exists( $login ) ?: wp_insert_user(
		array( 'user_login' => $login, 'user_pass' => "pirax-local-$login", 'user_email' => "$login@site.test", 'role' => $role )
	);
	if ( is_wp_error( $id ) ) {
		throw new RuntimeException( $id->get_error_message() );
	}
	$users[ $login ] = array( 'id' => (int) $id, 'login' => $login, 'password' => "pirax-local-$login" );
}

// Gravity Forms: GF finishes its install routine lazily; run it now so its tables exist.
if ( class_exists( 'GFForms' ) ) {
	GFForms::setup( true );
}
$notification = static function ( $id, $to, $label ) {
	return array(
		'id'                => $id,
		'name'              => "Notification $label",
		'isActive'          => true,
		'event'             => 'form_submission',
		'toType'            => 'email',
		'to'                => $to,
		'cc'                => 'cc@client.test',
		'bcc'               => 'bcc@client.test',
		'from'              => 'wordpress@site.test',
		'fromName'          => 'Site',
		'subject'           => "gf-{form_id} notification $label",
		'message'           => '{all_fields}',
		'disableAutoformat' => false,
	);
};
$gf_id = GFAPI::add_form(
	array(
		'title'         => 'Pirax GF contact',
		'fields'        => array(
			array( 'id' => 1, 'type' => 'text', 'label' => 'Name', 'isRequired' => true ),
			array( 'id' => 2, 'type' => 'email', 'label' => 'Email', 'isRequired' => true ),
			array( 'id' => 3, 'type' => 'textarea', 'label' => 'Message' ),
		),
		'notifications' => array(
			'pirax00000001' => $notification( 'pirax00000001', 'owner@client.test', 'A' ),
			'pirax00000002' => $notification( 'pirax00000002', 'owner-2@client.test', 'B' ),
		),
		'confirmations' => array(
			'pirax0000000c' => array( 'id' => 'pirax0000000c', 'name' => 'Default', 'isDefault' => true, 'type' => 'message', 'message' => 'Pirax GF thanks' ),
		),
	)
);
if ( is_wp_error( $gf_id ) ) {
	throw new RuntimeException( $gf_id->get_error_message() );
}
$gf_feed = GFAPI::add_feed( $gf_id, array( 'feedName' => 'Pirax ledger' ), 'pirax-harness-ledger' );
if ( is_wp_error( $gf_feed ) ) {
	throw new RuntimeException( $gf_feed->get_error_message() );
}

// Fluent Forms: clone the demo contact form FF creates on activation, with native notifications and a ledger feed.
global $wpdb;
$demo = $wpdb->get_row( "SELECT * FROM {$wpdb->prefix}fluentform_forms WHERE title = 'Contact Form Demo' ORDER BY id LIMIT 1" );
if ( ! $demo ) {
	throw new RuntimeException( 'Fluent Forms demo contact form missing; FF activation did not complete' );
}
$now = current_time( 'mysql' );
$wpdb->insert(
	"{$wpdb->prefix}fluentform_forms",
	array( 'title' => 'Pirax FF contact', 'status' => 'published', 'form_fields' => $demo->form_fields, 'has_payment' => 0, 'type' => 'form', 'created_by' => 1, 'created_at' => $now, 'updated_at' => $now )
);
$ff_id    = (int) $wpdb->insert_id;
$settings = $wpdb->get_var( $wpdb->prepare( "SELECT value FROM {$wpdb->prefix}fluentform_form_meta WHERE form_id = %d AND meta_key = 'formSettings'", $demo->id ) );
$meta     = array( array( 'formSettings', $settings ) );
foreach ( array( 'A' => 'owner@client.test', 'B' => 'owner-2@client.test' ) as $label => $to ) {
	$meta[] = array(
		'notifications',
		wp_json_encode(
			array(
				'name'         => "Notification $label",
				'sendTo'       => array( 'type' => 'email', 'email' => $to, 'field' => '', 'routing' => array() ),
				'fromName'     => 'Site',
				'fromEmail'    => '',
				'replyTo'      => '',
				'cc'           => 'cc@client.test',
				'bcc'          => 'bcc@client.test',
				'subject'      => "ff-$ff_id notification $label",
				'message'      => '<p>{all_data}</p>',
				'conditionals' => array( 'status' => false, 'type' => 'all', 'conditions' => array() ),
				'enabled'      => true,
			)
		),
	);
}
$meta[] = array( 'pirax_ledger_feeds', wp_json_encode( array( 'name' => 'Pirax ledger', 'enabled' => true, 'conditionals' => array( 'status' => false ) ) ) );
foreach ( $meta as list( $key, $value ) ) {
	$wpdb->insert( "{$wpdb->prefix}fluentform_form_meta", array( 'form_id' => $ff_id, 'meta_key' => $key, 'value' => $value ) );
}
$modules                 = (array) get_option( 'fluentform_global_modules_status', array() );
$modules['pirax_ledger'] = 'yes';
update_option( 'fluentform_global_modules_status', $modules );
update_option( 'pirax_ledger_settings', array( 'apiKey' => '', 'status' => true ) );

// Adapter fixtures (AC4/AC6): reCAPTCHA v2 forms whose siteverify the mu-plugin answers with
// success:false, and forms with side effects outside the suppressible feed paths.
update_option( 'rg_gforms_captcha_public_key', 'pirax-local-site-key' );
update_option( 'rg_gforms_captcha_private_key', 'pirax-local-secret-key' );
update_option( 'rg_gforms_captcha_type', 'checkbox' );
$gf_form = static function ( $title, array $fields, array $extra = array() ) use ( $notification ) {
	$id = GFAPI::add_form(
		$extra + array(
			'title'         => $title,
			'fields'        => $fields,
			'notifications' => array( 'pirax00000003' => $notification( 'pirax00000003', 'owner-3@client.test', 'C' ) ),
			'confirmations' => array(
				'pirax0000000c' => array( 'id' => 'pirax0000000c', 'name' => 'Default', 'isDefault' => true, 'type' => 'message', 'message' => 'Pirax GF thanks' ),
			),
		)
	);
	if ( is_wp_error( $id ) ) {
		throw new RuntimeException( $id->get_error_message() );
	}
	return (int) $id;
};
$gf_captcha = $gf_form(
	'Pirax GF captcha',
	array(
		array( 'id' => 1, 'type' => 'text', 'label' => 'Name', 'isRequired' => true ),
		array( 'id' => 2, 'type' => 'textarea', 'label' => 'Message' ),
		array( 'id' => 3, 'type' => 'captcha', 'label' => 'CAPTCHA', 'captchaType' => '' ),
	),
	array( 'enableHoneypot' => true, 'honeypotAction' => 'abort' )
);
$gf_post = $gf_form(
	'Pirax GF post',
	array(
		array( 'id' => 1, 'type' => 'post_title', 'label' => 'Title', 'isRequired' => true ),
		array( 'id' => 2, 'type' => 'textarea', 'label' => 'Message' ),
	)
);

update_option( '_fluentform_reCaptcha_details', array( 'siteKey' => 'pirax-local-site-key', 'secretKey' => 'pirax-local-secret-key', 'api_version' => 'v2_visible' ), false );
$ff_form = static function ( $title, array $fields, $has_payment = 0 ) use ( $wpdb, $now, $settings, $ff_id ) {
	$wpdb->insert(
		"{$wpdb->prefix}fluentform_forms",
		array( 'title' => $title, 'status' => 'published', 'form_fields' => wp_json_encode( $fields ), 'has_payment' => $has_payment, 'type' => 'form', 'created_by' => 1, 'created_at' => $now, 'updated_at' => $now )
	);
	$id = (int) $wpdb->insert_id;
	$notification = json_decode( $wpdb->get_var( $wpdb->prepare( "SELECT value FROM {$wpdb->prefix}fluentform_form_meta WHERE form_id = %d AND meta_key = 'notifications' ORDER BY id LIMIT 1", $ff_id ) ), true );
	$notification['sendTo']['email'] = 'owner-3@client.test';
	$notification['subject']         = "ff-$id notification C";
	foreach ( array( array( 'formSettings', $settings ), array( 'notifications', wp_json_encode( $notification ) ) ) as list( $key, $value ) ) {
		$wpdb->insert( "{$wpdb->prefix}fluentform_form_meta", array( 'form_id' => $id, 'meta_key' => $key, 'value' => $value ) );
	}
	return $id;
};
$ff_fields             = json_decode( $demo->form_fields, true );
$ff_captcha_fields     = $ff_fields;
$ff_captcha_fields['fields'][] = array(
	'index'          => 2,
	'element'        => 'recaptcha',
	'attributes'     => array( 'name' => 'g-recaptcha-response' ),
	'settings'       => array( 'label' => '', 'label_placement' => '', 'validation_rules' => array(), 'render_recaptcha_v3_badge' => false ),
	'editor_options' => array( 'title' => 'reCaptcha', 'icon_class' => 'ff-edit-recaptha', 'why_disabled_modal' => 'recaptcha', 'template' => 'recaptcha' ),
	'uniqElKey'      => 'el_pirax_recaptcha',
);
$ff_captcha = $ff_form( 'Pirax FF captcha', $ff_captcha_fields );
$ff_payment = $ff_form( 'Pirax FF payment', $ff_fields, 1 );

$extra_page = static function ( $title, $content ) {
	$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => $title, 'post_content' => $content ), true );
	if ( is_wp_error( $id ) ) {
		throw new RuntimeException( $id->get_error_message() );
	}
	return get_permalink( $id );
};
$captcha_page     = $extra_page( 'Pirax captcha forms', "[gravityform id=\"$gf_captcha\" title=\"false\" ajax=\"false\"]\n\n[fluentform id=\"$ff_captcha\"]" );
$unsupported_page = $extra_page( 'Pirax unsupported forms', "[gravityform id=\"$gf_post\" title=\"false\" ajax=\"false\"]\n\n[fluentform id=\"$ff_payment\"]" );

$page = wp_insert_post(
	array(
		'post_type'    => 'page',
		'post_status'  => 'publish',
		'post_title'   => 'Pirax forms',
		'post_content' => "[gravityform id=\"$gf_id\" title=\"false\" ajax=\"false\"]\n\n[fluentform id=\"$ff_id\"]",
	),
	true
);
if ( is_wp_error( $page ) ) {
	throw new RuntimeException( $page->get_error_message() );
}

return array(
	'gf'    => (int) $gf_id,
	'ff'    => $ff_id,
	'page'  => get_permalink( $page ),
	'users' => $users,
	'feeds' => array( 'gf' => (int) $gf_feed ),
	'async' => array( 'gf' => (bool) get_option( 'gform_enable_async_notifications' ) ),
	'captcha'     => array( 'gf' => $gf_captcha, 'ff' => $ff_captcha, 'page' => $captcha_page ),
	'unsupported' => array( 'gf' => $gf_post, 'ff' => $ff_payment, 'page' => $unsupported_page ),
);
