<?php
/**
 * Fluent Forms adapter (plan D7). A marked, supported submission:
 * - is detected from FF's parsed field data before any validation (CAPTCHA included);
 * - skips only FF's reCAPTCHA check (fluentform/disable_captcha, type 'recaptcha');
 * - is recorded on its entry as FF submission meta (the test id only, never the token) before
 *   FF dispatches anything, and the same id is stamped into each of its notification feeds, so it
 *   travels inside FF's queued job payload;
 * - dispatches only the email notification feed (the feed-type filter is moved to the end of its
 *   hook right before dispatch, so even a later PHP_INT_MAX filter cannot add other feeds back),
 *   in whichever mode FF uses (sync or its native queue); each notification job runs in the context of the id stamped into it
 *   (entry meta only for jobs queued without one), never the runner request's POST, and restores
 *   the previous context afterwards. The stored id, not the token, decides, so clearing or rotating
 *   the token, or a native cleanup deleting the entry after the runner loaded it, cannot turn queued
 *   test mail into client mail.
 *   A job that throws inside FF's sender is unwound when Action Scheduler catches it (and reported
 *   failed, so FF retries it), so its context never reaches the next job in the same runner;
 * - is deleted with FF's native deleteEntries() at the end of a request once no notification job
 *   is pending, processing or retryable. FF's own completion signal only checks pending rows, and
 *   FF writes submission meta after its submission actions, so deletion waits for shutdown.
 * Unsafe marked submissions are rejected with the literal message before CAPTCHA and insert.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

/** FF retries failed jobs while retry_count < this (fluentFormHandleScheduledTasks). */
const FF_MAX_RETRIES = 4;
/** Submission meta holding the test id of a marked entry; FF's native deletion removes it. */
const FF_META = '_pirax_form_test';

add_action( 'fluentform/before_form_validation', __NAMESPACE__ . '\ff_detect', PHP_INT_MIN, 2 );
add_filter( 'fluentform/disable_captcha', __NAMESPACE__ . '\ff_disable_captcha', PHP_INT_MAX, 3 );
// FF checks form restrictions before nonce and CAPTCHA; its validation_errors filter comes after them.
add_filter( 'fluentform/is_form_renderable', __NAMESPACE__ . '\ff_reject', PHP_INT_MIN, 2 );
add_filter( 'fluentform/global_notification_active_types', __NAMESPACE__ . '\ff_email_feed_only', PHP_INT_MAX );
add_action( 'fluentform/before_form_actions_processing', __NAMESPACE__ . '\ff_submitted', PHP_INT_MAX, 3 );
add_filter( 'fluentform/integration_feed_before_parse', __NAMESPACE__ . '\ff_stamp_feed', PHP_INT_MAX, 4 );
add_action( 'fluentform/integration_notify_notifications', __NAMESPACE__ . '\ff_before_notification', 9, 4 );
add_action( 'fluentform/integration_notify_notifications', __NAMESPACE__ . '\ff_after_notification', 11, 0 );
add_action( 'action_scheduler_failed_execution', __NAMESPACE__ . '\ff_abandon_notifications', 10, 0 );
add_action( 'fluentform/global_notify_completed', __NAMESPACE__ . '\ff_schedule_cleanup', 10, 2 );
add_action( 'wp_mail_failed', __NAMESPACE__ . '\ff_count_mail_failure' );

function &ff_state() {
	static $state = array( 'parsed' => null, 'marked' => null, 'verdicts' => array(), 'jobs' => array(), 'failures' => 0, 'cleanup' => array() );
	return $state;
}

function ff_detect( $fields, $form_data ) {
	$state             = &ff_state();
	$state['parsed']   = parse( array_intersect_key( (array) $form_data, (array) $fields ) );
	$state['verdicts'] = array();
	$state['marked']   = 'marked' === $state['parsed']['state'] ? mark( $state['parsed']['id'] ) : null;
}

/** null (ordinary), 'supported', or the rejection message for this submission of $form. */
function ff_verdict( $form ) {
	$state = &ff_state();
	if ( null === $state['parsed'] || 'ordinary' === $state['parsed']['state'] || ! is_object( $form ) ) {
		return null;
	}
	$form_id = (int) $form->id;
	if ( ! isset( $state['verdicts'][ $form_id ] ) ) {
		if ( 'invalid-marker' === $state['parsed']['state'] ) {
			$state['verdicts'][ $form_id ] = MARKER_MESSAGE;
		} elseif ( is_wp_error( $state['marked'] ) ) {
			$state['verdicts'][ $form_id ] = $state['marked']->get_error_message();
		} else {
			$state['verdicts'][ $form_id ] = ff_supported( $form ) ? 'supported' : BLOCKED_MESSAGE;
		}
	}
	return $state['verdicts'][ $form_id ];
}

function ff_disable_captcha( $disabled, $form, $type ) {
	return 'recaptcha' === $type && 'supported' === ff_verdict( $form ) ? true : $disabled;
}

/** Reject unsafe marked submissions before CAPTCHA and insert, with FF's own validation error. */
function ff_reject( $allowed, $form ) {
	$verdict = ff_verdict( $form );
	if ( null !== $verdict && 'supported' !== $verdict ) {
		throw new \FluentForm\Framework\Validator\ValidationException( '', 423, null, array( 'errors' => array( 'pirax_form_test' => array( 'pirax_form_test' => $verdict ) ) ) );
	}
	return $allowed;
}

/** Marked submissions dispatch only FF's email notification feed; CRM/other feeds never run or queue. */
function ff_email_feed_only( $types ) {
	if ( null === current_id() ) {
		return $types;
	}
	return isset( $types['notifications'] ) ? array( 'notifications' => $types['notifications'] ) : array();
}

/** Right after insert, before FF's submission actions and feed dispatch. */
function ff_submitted( $entry_id, $form_data, $form ) {
	$id = current_id();
	if ( $entry_id && null !== $id && 'supported' === ff_verdict( $form ) ) {
		// Same priority runs in registration order: re-adding puts this filter after every other one.
		remove_filter( 'fluentform/global_notification_active_types', __NAMESPACE__ . '\ff_email_feed_only', PHP_INT_MAX );
		add_filter( 'fluentform/global_notification_active_types', __NAMESPACE__ . '\ff_email_feed_only', PHP_INT_MAX );
		\FluentForm\App\Helpers\Helper::setSubmissionMeta( $entry_id, FF_META, $id, $form->id );
		ff_schedule_cleanup( $entry_id, $form );
	}
}

/**
 * FF serializes each feed into its queued job row right after this filter (synchronous feeds are
 * passed on as is). A marked submission's feeds carry its validated test id; any other feed loses
 * the key, so only this plugin ever sets it.
 */
function ff_stamp_feed( $feed, $entry_id, $form_data, $form ) {
	$id = current_id();
	if ( ! is_array( $feed ) ) {
		return $feed;
	}
	unset( $feed[ FF_META ] );
	if ( null !== $id && 'supported' === ff_verdict( $form ) && ff_test_id( $entry_id ) === $id ) {
		$feed[ FF_META ] = $id;
	}
	return $feed;
}

/** Test id recorded on a stored FF entry, else null. */
function ff_test_id( $entry_id ) {
	$id = \FluentForm\App\Helpers\Helper::getSubmissionMeta( (int) $entry_id, FF_META, null );
	return id_is_valid( $id ) ? $id : null;
}

/**
 * Before FF's own sender (priority 10): enter the context of the job's submission. The id stamped
 * into the job at submission time decides, since a native cleanup can delete the entry and its
 * meta after the runner loaded them; jobs queued without it fall back to the entry meta.
 */
function ff_before_notification( $feed, $form_data, $entry, $form ) {
	$state = &ff_state();
	$id    = is_array( $feed ) && id_is_valid( $feed[ FF_META ] ?? null ) ? $feed[ FF_META ] : null;
	$id    = $id ?? ( is_object( $entry ) && ! empty( $entry->id ) ? ff_test_id( $entry->id ) : null );
	push_context( $id );
	$state['jobs'][] = array( 'id' => $id, 'failures' => $state['failures'], 'feed' => $feed, 'entry' => $entry, 'form' => $form );
}

/** After FF's sender (priority 11). */
function ff_after_notification() {
	ff_finish_notification( false );
}

/**
 * Leave the innermost job's context; false when no job is open. A marked queued job reports its
 * outcome through FF's own integration result action (FF's email action reports none), so a
 * finished job is distinguishable from one still processing and a failed one stays retryable.
 */
function ff_finish_notification( $threw ) {
	$state = &ff_state();
	$job   = array_pop( $state['jobs'] );
	if ( ! $job ) {
		return false;
	}
	pop_context();
	if ( null === $job['id'] ) {
		return true;
	}
	if ( ! empty( $job['feed']['scheduled_action_id'] ) ) {
		$failed = $threw || $state['failures'] > $job['failures'];
		do_action( 'fluentform/integration_action_result', $job['feed'], $failed ? 'failed' : 'success', $failed ? 'Pirax test notification failed' : 'Pirax test notification sent' );
	}
	if ( is_object( $job['entry'] ) && ! empty( $job['entry']->id ) ) {
		ff_schedule_cleanup( $job['entry']->id, $job['form'] );
	}
	return true;
}

/**
 * Action Scheduler caught an exception from its current action and goes on with the next one in
 * this request. Jobs FF's sender never finished belong to that action: leave their contexts and
 * report them failed. FF's legacy batch endpoint and WP-Cron retry let such an exception end the
 * request instead, and a synchronous submission is marked for its whole request anyway.
 */
function ff_abandon_notifications() {
	while ( ff_finish_notification( true ) ) {
		continue;
	}
}

function ff_count_mail_failure() {
	$state = &ff_state();
	++$state['failures'];
}

/** Candidate for deletion at the end of this request; re-checked then. */
function ff_schedule_cleanup( $entry_id, $form ) {
	$state                               = &ff_state();
	$state['cleanup'][ (int) $entry_id ] = is_object( $form ) ? (int) $form->id : (int) $form;
	if ( ! has_action( 'shutdown', __NAMESPACE__ . '\ff_cleanup' ) ) {
		add_action( 'shutdown', __NAMESPACE__ . '\ff_cleanup' );
	}
}

/** Notification jobs of an entry that may still send: pending, processing or retryable. */
function ff_open_jobs( $entry_id ) {
	global $wpdb;
	return (int) $wpdb->get_var(
		$wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->prefix}ff_scheduled_actions WHERE origin_id = %d AND NOT ( status IN ('success', 'skipped') OR ( status = 'failed' AND retry_count >= %d ) )",
			$entry_id,
			FF_MAX_RETRIES
		)
	);
}

function ff_cleanup() {
	$state = &ff_state();
	foreach ( $state['cleanup'] as $entry_id => $form_id ) {
		try {
			if ( null !== ff_test_id( $entry_id ) && ! ff_open_jobs( $entry_id ) ) {
				( new \FluentForm\App\Services\Submission\SubmissionService() )->deleteEntries( array( $entry_id ), $form_id );
			}
		} catch ( \Throwable $e ) {
			// Left in place; the hourly recovery sweep retries.
			unset( $e );
		}
	}
	$state['cleanup'] = array();
}
