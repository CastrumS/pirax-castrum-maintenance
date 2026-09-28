// Review A reproduction (scratch, not part of the repo): a marked GF submission sent with GF 3.1.2's
// true-AJAX method (admin-ajax.php action=gform_submit_form) on the full compatibility stack.
// Prints only booleans, counts, hook names and actions; never the token, marker or ZIP paths.
import { join } from "node:path";
import { startHarness } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat/test/plugin/harness";

const ROOT = "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat";
const ZIP = join(ROOT, "dist/pirax-form-test.zip");
const REDIRECT = "form-tests+pirax@operator.test";
const ID = "abc123";
const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}', true)`;

const build = await Bun.$`bun run build:plugin`.cwd(ROOT).quiet().nothrow();
if (build.exitCode !== 0) throw new Error("build:plugin failed");

const h = await startHarness({ run: "review-a-gf-true-ajax", compatibility: true });
try {
  const admin = await h.browser("review-admin");
  await admin.page.goto(`${h.url}/wp-login.php`);
  await admin.page.fill("#user_login", h.users.admin.login);
  await admin.page.fill("#user_pass", h.users.admin.password);
  await admin.page.click("#wp-submit");
  await admin.page.waitForURL(/\/wp-admin\/?/);
  await h.uploadPlugin(admin.page, ZIP);
  await h.php(`foreach (${lit({ pirax_form_test_token: h.token, pirax_form_test_redirect: REDIRECT })} as $k => $v) update_option($k, $v, false); return true;`);

  // Opt the fixture GF form into GF's true-AJAX submission, and record (booleans only) whether any
  // request body sent to CleanTalk hosts carries the marker id or the token.
  await h.php(`
    $code = <<<'PHP'
<?php
add_filter( 'gform_form_args', static function ( $args ) { $args['submission_method'] = 'ajax'; return $args; } );
if ( class_exists( 'Pirax_Harness_Transport' ) ) {
	class Review_A_Transport extends Pirax_Harness_Transport {
		public function request( $url, $headers = array(), $data = array(), $options = array() ) {
			$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
			if ( preg_match( '/(^|\\.)cleantalk\\.org$/', $host ) ) {
				$raw   = is_string( $data ) ? $data : http_build_query( (array) $data );
				$flat  = str_replace( '\\\\', '', $raw ) . ' ' . urldecode( $raw );
				$token = (string) get_option( 'pirax_form_test_token' );
				file_put_contents( WP_CONTENT_DIR . '/review-a-ct.jsonl', wp_json_encode( array(
					'hooks'         => array_values( $GLOBALS['wp_current_filter'] ),
					'action'        => isset( $_REQUEST['action'] ) ? sanitize_key( $_REQUEST['action'] ) : null,
					'has_marker_id' => false !== strpos( $flat, 'abc123' ),
					'has_token'     => '' !== $token && false !== strpos( $flat, $token ),
				) ) . "\\n", FILE_APPEND );
			}
			return parent::request( $url, $headers, $data, $options );
		}
	}
	\\Closure::bind( static function () { self::$transports = array( Review_A_Transport::class => Review_A_Transport::class ); self::$transport = array(); }, null, \\WpOrg\\Requests\\Requests::class )();
}
PHP;
    file_put_contents(WPMU_PLUGIN_DIR . '/zz-review-a.php', $code);
    return true;
  `);

  // Panel verdict for GF with this configuration.
  await admin.page.goto(`${h.url}/wp-admin/options-general.php?page=pirax-form-test`);
  const gfVerdict = await admin.page.locator("#pirax-form-test-compat-gf .pirax-form-test-verdict").innerText();
  console.log("panel GF verdict:", gfVerdict);

  const visitor = await h.browser("review-visitor");
  const id = h.fixtures.gf;
  const before = { http: (await h.http()).length, mail: (await h.mail()).length, entries: (await h.entries()).gf };
  await visitor.page.goto(h.fixtures.page);
  const method = await visitor.page.locator(`#gform_${id} [name=gform_submission_method]`).getAttribute("value");
  console.log("rendered gform_submission_method:", method);
  const form = visitor.page.locator(`#gform_${id}`);
  await form.locator("[name='input_1']").fill("Stack Visitor");
  await form.locator("[name='input_2']").fill("visitor@example.test");
  await form.locator("[name='input_3']").fill(`Pirax check ${h.token}-${ID}`);
  const ajax = visitor.page.waitForResponse((r) => r.url().includes("admin-ajax.php") && (r.request().postData() ?? "").includes("gform_submit_form"), { timeout: 60_000 }).catch(() => null);
  await form.locator("[type=submit]").click();
  const res = await ajax;
  console.log("admin-ajax gform_submit_form response:", res ? res.status() : "none");
  await visitor.page.locator(`#gform_confirmation_message_${id}, #gform_${id}_validation_container, .gform_validation_errors`).first().waitFor({ timeout: 60_000 });
  const confirmed = (await visitor.page.locator(`#gform_confirmation_message_${id}`).count()) > 0;
  console.log("marked GF confirmed:", confirmed);

  const http = (await h.http()).slice(before.http);
  console.log("contained HTTP during marked GF true-AJAX submission:", JSON.stringify(http.map((r) => ({ purpose: r.purpose, host: r.host, api: r.api, action: r.action, hooks: r.hooks }))));
  const ct = await h.php<unknown[]>(`$f = WP_CONTENT_DIR . '/review-a-ct.jsonl'; return file_exists($f) ? array_map(fn($l) => json_decode($l, true), file($f, FILE_IGNORE_NEW_LINES)) : [];`);
  console.log("CleanTalk request bodies (booleans):", JSON.stringify(ct));
  const mail = (await h.mail()).slice(before.mail);
  console.log("wp_mail calls:", mail.length, "all to redirect:", mail.every((m) => JSON.stringify(m.to) === JSON.stringify([REDIRECT])), "tagged subjects:", mail.every((m) => String(m.subject).startsWith(`[pirax-test ${ID}]`)));
  console.log("GF entries before/after:", before.entries, (await h.entries()).gf);
  await h.closeBrowser(visitor.context);
  await h.closeBrowser(admin.context);
} finally {
  await h.stop();
}
