<?php
/**
 * Hourly recovery sweep (plan D9). Test entries normally disappear right after their mail; this
 * catches the rest (failed deletion, stuck or crashed notification jobs, old malformed markers).
 * Entries whose submitted field values contain the configured token and that are strictly older
 * than one hour are deleted with the form plugin's own deletion API. The entry's queued work is
 * removed first: FF notification jobs (an entry with a job that may be sending right now,
 * processing and touched within the hour, is left for a later run) and GF background notification
 * and feed tasks (GF's notification task sends from an entry copy it carries even after the entry
 * is gone; while a GF worker is running, the entry is left for a later run). An empty token disables it.
 * SQL LIKE only narrows candidates (escaped, id cursor); the decoded field values decide.
 */

namespace Pirax\FormTest;

defined( 'ABSPATH' ) || exit;

const SWEEP_BATCH = 50;

add_action( SWEEP_HOOK, __NAMESPACE__ . '\sweep' );

function sweep() {
	$token = token();
	if ( '' === $token ) {
		return;
	}
	if ( class_exists( 'GFAPI' ) ) {
		sweep_gf( $token );
	}
	if ( defined( 'FLUENTFORM_VERSION' ) ) {
		sweep_ff( $token );
	}
}

/** LIKE pattern for every stored spelling of $token (JSON may escape `/` and other characters). */
function token_like( $token ) {
	global $wpdb;
	$parts = preg_split( '#[^A-Za-z0-9 ._+=%~-]+#', $token, -1, PREG_SPLIT_NO_EMPTY );
	return '%' . implode( '%', array_map( array( $wpdb, 'esc_like' ), $parts ) ) . '%';
}

function values_contain( $values, $token ) {
	$found = false;
	array_walk_recursive(
		$values,
		static function ( $value ) use ( $token, &$found ) {
			$found = $found || ( is_string( $value ) && false !== strpos( $value, $token ) );
		}
	);
	return $found;
}

/** GF: entry dates are UTC. Field values are the entry's numeric (field/input id) keys. */
function sweep_gf( $token ) {
	global $wpdb;
	$cutoff = gmdate( 'Y-m-d H:i:s', time() - HOUR_IN_SECONDS );
	$after  = 0;
	do {
		$ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT DISTINCT e.id FROM {$wpdb->prefix}gf_entry e JOIN {$wpdb->prefix}gf_entry_meta m ON m.entry_id = e.id
				WHERE e.id > %d AND e.date_created < %s AND m.meta_value LIKE %s ORDER BY e.id LIMIT %d",
				$after,
				$cutoff,
				token_like( $token ),
				SWEEP_BATCH
			)
		);
		foreach ( $ids as $id ) {
			$after = (int) $id;
			$entry = \GFAPI::get_entry( $after );
			if ( is_wp_error( $entry ) ) {
				continue;
			}
			$fields = array_filter(
				$entry,
				static function ( $key ) {
					return 1 === preg_match( '/^\d+(\.\d+)?$/', (string) $key );
				},
				ARRAY_FILTER_USE_KEY
			);
			if ( values_contain( $fields, $token ) && gf_unqueue( $after ) ) {
				\GFAPI::delete_entry( $after );
			}
		}
	} while ( count( $ids ) === SWEEP_BATCH );
}

/** GF's background processors: notifications, feeds, and each feed add-on's own feed processor. */
function gf_processors() {
	$container  = \GFForms::get_service_container();
	$processors = array(
		$container->get( \Gravity_Forms\Gravity_Forms\Async\GF_Background_Process_Service_Provider::NOTIFICATIONS ),
		$container->get( \Gravity_Forms\Gravity_Forms\Async\GF_Background_Process_Service_Provider::FEEDS ),
	);
	foreach ( \GFAddOn::get_registered_addons( true ) as $addon ) {
		if ( $addon instanceof \GFFeedAddOn ) {
			$processors[] = gf_feed_processor( $addon );
		}
	}
	return $processors;
}

/**
 * Remove GF's queued tasks for an entry (by entry_id or a carried entry copy), keeping every other
 * task. False, with the entry left for a later run, while a processor holding such a task is
 * running: its worker rewrites the batch from memory. ponytail: a worker starting between the
 * check and the update can still restore a removed task; GF has no compare-and-set batch API.
 */
function gf_unqueue( $entry_id ) {
	$other = static function ( $task ) use ( $entry_id ) {
		return ! is_array( $task ) || ( (int) rgar( $task, 'entry_id' ) !== $entry_id && (int) rgars( $task, 'entry/id' ) !== $entry_id );
	};
	foreach ( gf_processors() as $processor ) {
		foreach ( $processor->get_batches() as $batch ) {
			$data = array_filter( (array) $batch->data, $other );
			if ( count( $data ) === count( (array) $batch->data ) ) {
				continue;
			}
			if ( $processor->is_processing() ) {
				return false;
			}
			if ( $data ) {
				$processor->update( $batch->key, $data );
			} else {
				$processor->delete( $batch->key );
			}
		}
	}
	return true;
}

/** FF: submission and job times are site-local (current_time( 'mysql' )). */
function sweep_ff( $token ) {
	global $wpdb;
	$cutoff = wp_date( 'Y-m-d H:i:s', time() - HOUR_IN_SECONDS );
	$after  = 0;
	do {
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT id, form_id, response FROM {$wpdb->prefix}fluentform_submissions
				WHERE id > %d AND created_at < %s AND response LIKE %s ORDER BY id LIMIT %d",
				$after,
				$cutoff,
				token_like( $token ),
				SWEEP_BATCH
			)
		);
		foreach ( $rows as $row ) {
			$after = (int) $row->id;
			$form  = wpFluent()->table( 'fluentform_forms' )->find( $row->form_id );
			if ( $form && values_contain( ff_field_values( $form, json_decode( $row->response, true ) ), $token ) ) {
				ff_expire( $after, (int) $row->form_id, $cutoff );
			}
		}
	} while ( count( $rows ) === SWEEP_BATCH );
}

/** Cancel an expired FF test entry's queued jobs and delete it natively, unless a job may be sending. */
function ff_expire( $entry_id, $form_id, $cutoff ) {
	global $wpdb;
	$jobs   = $wpdb->prepare( "SELECT id, status, updated_at FROM {$wpdb->prefix}ff_scheduled_actions WHERE origin_id = %d", $entry_id );
	$active = static function ( $job ) use ( $cutoff ) {
		return 'processing' === $job->status && $job->updated_at >= $cutoff;
	};
	foreach ( $wpdb->get_results( $jobs ) as $job ) {
		if ( $active( $job ) ) {
			return;
		}
		if ( 'pending' === $job->status && function_exists( 'as_unschedule_all_actions' ) ) {
			as_unschedule_all_actions( 'fluentform/schedule_feed', array( 'queueId' => (int) $job->id ), 'fluentform' );
		}
	}
	// Final check: a runner may have claimed a job meanwhile. ponytail: a claim between this check and
	// the delete remains a race; that job already loaded the entry, so its mail is still redirected.
	if ( array_filter( $wpdb->get_results( $jobs ), $active ) ) {
		return;
	}
	( new \FluentForm\App\Services\Submission\SubmissionService() )->deleteEntries( array( $entry_id ), $form_id );
}
