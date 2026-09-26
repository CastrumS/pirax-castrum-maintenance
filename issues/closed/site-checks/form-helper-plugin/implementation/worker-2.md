# Worker 2 report: production plugin core, settings, marker, mail and build

Scope: brief-2 only. I didn't build any GF/FF adapters, compatibility preflight or sweep callback.

- I made no commits, ran no lifecycle commands, did not run the full suite and did not touch `issues/` in the worktree.
- I did not open, print or edit any `.env` or `.env.*` file. Credentials were loaded only through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env`.
- The only check on the real token printed a single boolean: whether it matches the settings validation pattern. It does.

## Result

`test/plugin/core.test.ts` runs against real WordPress 7.1.2 / PHP 8.3 in Playground with GF 3.1.2 and FF 6.2.14. Result: **9 pass, 0 fail, 134 expect() calls**.

The generated ZIP is uploaded and activated through the real wp-admin upload form, with GF and FF deactivated. Settings are driven with real admin, editor and subscriber sessions and real nonces. All marker and mail assertions run through actual WordPress (`wp_mail` observed by the harness mu-plugin). No WordPress function or auth is mocked.

## Changed files and reasons

- `plugin/pirax-form-test/pirax-form-test.php` (new): the plugin header and bootstrap.
  - Metadata: Requires WP 6.4 (for `wp_set_options_autoload`) and PHP 7.4. The code uses 7.4-compatible syntax because the live sites' PHP versions are unknown.
  - Loading: always loads `includes/settings.php`, `marker.php` and `mail.php`. It then loads `includes/{compatibility,gravity-forms,fluent-forms,cleanup}.php` only if the file exists. Those files don't exist in this unit.
  - Lifecycle: `activate()` / `deactivate()`.
- `plugin/pirax-form-test/includes/settings.php` (new): the two options and validation, plus the Settings → Pirax Form Test page and its `admin-post.php` save handler.
  - Both render and save check `manage_options`. Save then calls `check_admin_referer` before any mutation.
  - The token field is a password field that is never pre-filled. The page shows only whether a token is set.
  - Leaving the token blank keeps the stored token; the "Clear the token" checkbox disables test handling.
  - Values are validated but never changed: no trimming, no sanitize.
- `plugin/pirax-form-test/includes/marker.php` (new): the parser, request marker, worker context stack and the shared rejection messages.
- `plugin/pirax-form-test/includes/mail.php` (new): a pure `transform_mail()`, the late `wp_mail` filter and a fail-closed `pre_wp_mail` guard.
- `plugin/pirax-form-test/uninstall.php` (new): exits unless `WP_UNINSTALL_PLUGIN` is defined, then deletes both options and clears `pirax_form_test_sweep`.
- `scripts/build-plugin.ts` (new): builds from an explicit `FILES` allowlist.
  - Any missing allowlisted file, or any extra file in `plugin/pirax-form-test/`, fails the build. **Worker 3 must add its files to `FILES`**, and a later plugin README must also be added deliberately.
  - It also fails if an allowlisted file contains the value of `FORM_TEST_TOKEN` or `GRAVITY_FORMS_ZIP`, reporting only the variable names.
  - It stages the files under `pirax-form-test/`, replaces `dist/pirax-form-test.zip` using system `zip -X`, and re-checks the archive listing against the allowlist. It prints the path and SHA-256.
- `test/plugin/core.test.ts` (new): the targeted suite, written before the code.

No consolidation: each file named in the brief is its own file. `uninstall.php` uses literal option and hook names because WordPress runs it without loading the plugin. `package.json` already had `build:plugin`, so it and `.gitignore` are unchanged; `dist/` and `artifacts/` were already ignored.

## Exported API for worker 3 (namespace `Pirax\FormTest`)

**Constants**

| Constant | Value |
|---|---|
| `OPTION_TOKEN` | `'pirax_form_test_token'` |
| `OPTION_REDIRECT` | `'pirax_form_test_redirect'` |
| `SWEEP_HOOK` | `'pirax_form_test_sweep'` |
| `ID_PATTERN` | `'[a-z0-9]{6,32}'` (no delimiters) |
| `PAGE` | `'pirax-form-test'` |
| `SAVE_ACTION` | `'pirax_form_test_save'` |
| `BLOCKED_MESSAGE` | `'Pirax test blocked: integrations could not be suppressed'` |
| `MARKER_MESSAGE` | `'Pirax test blocked: invalid test marker'` |
| `CONFIG_MESSAGE` | `'Pirax test blocked: test configuration is invalid'` |

**Settings access**

- `token(): string` returns the configured token. An empty string means test behaviour is disabled.
- `redirect(): string` returns the raw redirect value, unvalidated.
- `token_is_valid($t)` checks `^[A-Za-z0-9._~+/=-]{16,255}$`.
- `redirect_is_valid($r)` accepts exactly one address: no whitespace, CR/LF, `,` or `;`, and `is_email($r) === $r`.
- `settings_error($token, $redirect)` returns `''` or one of `invalid-token`, `invalid-redirect`, `redirect-required`.

**Marker parsing and context**

- `parse($values, $token = null)` returns `['state' => 'ordinary'|'marked'|'invalid-marker', 'id' => ?string, 'reason' => null|'malformed'|'ambiguous']`.
  - Input: a scalar or a nested array of submitted **field values**. Keys, non-strings and objects are ignored.
  - The adapter must unslash exactly once before calling. A `null` token means the configured one; an empty token always returns `ordinary`.
  - The token is matched literally with `strpos`, and every occurrence must be followed by `-<id>` plus a boundary. The boundary is any character other than `[A-Za-z0-9_-]`, so `@` works for email suffixes.
  - Any occurrence without a valid ID and boundary makes the result `malformed`. Two distinct IDs make it `ambiguous`.
- `mark($id)` returns `true`, or a `WP_Error` and marks nothing. It sets the request marker until the request ends.
  - `pirax_form_test_marker`: bad ID grammar, or a different ID when the request is already marked.
  - `pirax_form_test_config`: no token, or the redirect fails validation.
  - Calling it again with the same ID is harmless.
- `push_context(?string $id)` / `pop_context()` open and close a scoped worker context for queued jobs. Always pop in `finally`.
  - `push_context` throws `InvalidArgumentException` on a bad ID and does not check the configuration; the mail guard fails closed instead.
  - Pass `null` for an unmarked job to keep push and pop balanced.
  - `pop_context()` on an empty stack is a no-op.
- `current_id(): ?string` returns the innermost non-null worker ID, otherwise the request marker. An unmarked scope inside a marked request or scope never removes protection.
- `config_error(): ?WP_Error` returns `pirax_form_test_config` when the token is empty or the redirect is invalid.

**Mail**

- `transform_mail(array $atts, $id, $redirect)` is pure and idempotent:
  - `to` becomes `[redirect]`.
  - Headers (string or array, including elements with embedded CRLF) are split into lines and folded continuations are joined. Orphan continuations are dropped.
  - `To`, `Cc`, `Bcc`, `Resent-To|Cc|Bcc` and any existing `X-Pirax-Form-Test` headers are removed case-insensitively, then `X-Pirax-Form-Test: <id>` is appended.
  - Any leading `[pirax-test <id>] ` prefixes are replaced with a single `[pirax-test <id>] `.
  - Message, attachments and every other key or header are kept.
- The `wp_mail` filter runs at `PHP_INT_MAX` and transforms mail only while `current_id()` is set and the configuration is valid.
- The `pre_wp_mail` guard runs at `PHP_INT_MIN`. For marked mail it returns `false` and fires `wp_mail_failed` in either case:
  - the configuration is invalid (`pirax_form_test_config`);
  - `to`, `subject` or `headers` differ from a re-transformation, meaning a later filter altered them (`pirax_form_test_mail`).

**Lifecycle**

- `activate()` adds both options with autoload off, forces autoload off via `wp_set_options_autoload`, and schedules one hourly `SWEEP_HOOK` event (idempotent).
- `deactivate()` clears `SWEEP_HOOK`.
- Worker 3's `cleanup.php` only needs `add_action( SWEEP_HOOK, ... )`.
- Adapters register their own hooks when their file is loaded and must guard for their form plugin being absent (for example, on `gform_loaded` / `fluentform/loaded`).
- No custom schema and no REST route.

## Tests run

**Red** (the suite existed; plugin and build script did not):

```
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts --timeout 180000
error: PHP error: Error: Call to undefined function Pirax\FormTest\mark()
 1 pass
 8 fail
 11 expect() calls
Ran 9 tests across 1 file. [63.90s]
```

The one test that passed checks that query strings, cookies and arbitrary POST data never mark a request. It passes trivially with no plugin installed.

**Intermediate run** after implementing: 2 pass, 7 fail. Root causes and fixes:

- Comments in `mail.php` mention `wp_mail()`, which tripped the build test's "never sends mail" regex. The test now strips PHP comments before matching code.
- The Settings submenu is a hover flyout, so the click hit "element outside viewport". The test now hovers `#menu-settings` first, as a user would.
- The remaining failures were cascades from the token never being saved.

**Green** (the brief's exact command):

```
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts --timeout 180000
bun test v1.4.2 (744846f84)
 9 pass
 0 fail
 134 expect() calls
Ran 9 tests across 1 file. [109.93s]
```

What the suite covers, by brief criterion:

1. **Build and install (AC1)**
   - `bun run build:plugin` leaves `dist/` holding only `pirax-form-test.zip`. Every entry is under `pirax-form-test/`, and the file set equals the five production files.
   - The code (comments stripped) has no `register_rest_route`, `rest_api_init`, `wp_mail(`, PHPMailer or harness symbol.
   - `findSecret(dist)` finds neither the token nor the GF ZIP path.
   - With GF and FF deactivated, the ZIP uploads and activates through wp-admin. No form-plugin class loads, there is exactly one sweep event, no `pirax` REST route, and both option rows have autoload `off`.
   - GF and FF then reactivate without a fatal error, and the settings page still renders.
2. **Settings (AC1, AC6)**
   - The admin reaches the page through the Settings menu and saves the real token and a plus-address redirect. The stored token hash matches, and the token appears neither in the page nor in the input.
   - With the admin's valid nonce, these are all rejected and leave both options unchanged (compared by hash):
     - a redirect list;
     - a redirect with CRLF + `Bcc`;
     - a redirect with a trailing LF;
     - a non-address;
     - an empty redirect while a token is set;
     - a short token;
     - a token with a newline;
     - a token with spaces.
   - A missing or forged nonce returns 403 with no mutation. A logged-out request returns ≥400.
   - Editor and subscriber see no menu entry, get a 403 page, and get 403 on POST even with a **valid nonce minted for their own real session**. The nonce comes from `wp_create_nonce` with the session cookie.
   - Saving with a blank token keeps the token. Clearing disables the behaviour (`parse` returns `ordinary` and `mark` returns an error). Saving the token again restores the state.
3. **Parser (AC3, AC6)**: 26 table cases plus the configured-token path, all in WordPress.
   - Scalar values, nested fields and multi-value fields are parsed. A marker in a key is ignored.
   - Email suffixes and plus-addresses are marked.
   - A 32-character ID is marked in full. A 33-character ID is malformed, not truncated. So are 5-character IDs, uppercase IDs and IDs followed by `X`, `_` or `-`.
   - The bare secret, the secret plus `-`, and the secret followed by extra characters are malformed.
   - The same ID twice is marked; different IDs are ambiguous; one valid plus one malformed occurrence is malformed.
   - `.` and other regex metacharacters are matched literally.
   - A wrong token or a truncated token is ordinary. An empty token is ordinary. Non-string leaves are ignored.
4. **Context (AC3, AC6)**
   - `mark` rejects a bad ID and a different second ID, and accepts the same ID again.
   - An unmarked worker scope inside a marked request stays protected.
   - The push/pop stack restores correctly, a bad ID pushed throws, and popping an empty stack is harmless.
   - A new PHP request starts with `current_id()` null.
5. **Mail (AC2 core, AC3)**
   - Ordinary mail is unchanged.
   - Marked string headers:
     - a folded `CC` continuation, lowercase `bcc` and a spoofed `X-Pirax-Form-Test` are all stripped;
     - From, Reply-To, `X-Keep` and Content-Type stay in order, and exactly one tag is appended;
     - the subject is prefixed once, and the multi-recipient `to` is replaced by the redirect;
     - message and attachments are unchanged.
   - Marked header array: a tab-folded `CC`, `BCC:` with no space, `To:`, `Resent-Bcc:`, a lowercase tag, and an element with an embedded CRLF `Cc` are stripped. A subject already prefixed stays prefixed exactly once.
   - Running the transform twice gives the same result with one tag.
   - Stacked contexts: `aaa111` → `bbb222` (an `aaa111` prefix is replaced) → back to `aaa111` → ordinary mail with its original recipients and Cc.
   - Bad redirect: for a list, a CRLF injection and an empty value, `mark` returns `pirax_form_test_config` and marks nothing. In a pushed worker scope, `wp_mail` returns false, `wp_mail_failed` fires, and **no mail is logged** (nothing reaches the original recipients).
   - A real lost-password HTTP request, with the marker in the query string, a cookie, a POST key and a POST value, sends its mail unmarked to the original recipient.
6. **Lifecycle and evidence (AC1, AC8)**
   - Deactivation clears the event and keeps the options. Reactivation plus a second `activate()` leaves exactly one event.
   - A direct HTTP request to `uninstall.php` does nothing.
   - `delete_plugins()` runs the real uninstall path: it removes both option rows and a stray owned event, and deletes the plugin directory.
   - `saveEvidence()` runs, and `findSecret(artifactDir, [token])` is `[]`.

Manual checks after green:

- A Bun `findSecret` over all of `artifacts/plugin/` and `dist/`, for both credential values, reports `0 []` for each. Only counts were printed.
- `bun run build:plugin` output: `dist/pirax-form-test.zip (5 files, sha256 …)`. Current SHA-256: `ec490b004593cc36432e12b6f8c9d21c96b84981f305fb24528e257f234d41c5`. The ZIP embeds timestamps, so the digest changes on every rebuild.

## Artifact path

`artifacts/plugin/core-2026-09-25T13-50-12-540Z/` (ignored) contains:

- `core-install-settings.trace.zip` (42 actions: upload, activation, settings save, clear, re-save);
- `core-settings-editor.trace.zip` and `core-settings-subscriber.trace.zip` (10 actions each);
- `mail.jsonl`, `feeds.jsonl`, `entries.json`, `manifest.json` and `playground.log`.

The token was typed into the traced page, then scrubbed by the harness; the secret scan confirms nothing is retained.

## Known limitations

- **After `wp_mail`:** anything that changes recipients after the `pre_wp_mail` guard is out of reach, for example in `phpmailer_init` or inside an SMTP plugin's own transport. Another `pre_wp_mail` callback that ignores an earlier `false` short-circuit is also out of reach (plan D8 limitation). The guard catches changes made by later `wp_mail` filters.
- **Unmarked scopes inside marked ones:** an unmarked worker scope nested inside a marked request or scope stays marked. Genuine client mail sent inside a marked request is redirected, never leaked. This is deliberate fail-safe behaviour for the rare legacy-batch case.
- **Marked mail fails closed:** while marked, mail fails if the token is cleared or the redirect becomes invalid mid-request. It is never delivered to the original recipients.
- **Token charset:** the token is limited to `[A-Za-z0-9._~+/=-]`, 16–255 characters, so form-plugin sanitizing can't alter it. The configured `FORM_TEST_TOKEN` passes. A README (docs group) should state this.
- **Settings menu URL:** in Playground, WordPress renders the submenu link as `admin.php?page=pirax-form-test`, a core menu behaviour when it can't `file_exists` the parent. `options-general.php?page=pirax-form-test` works too; both were exercised.
- **Multisite:** network activation and per-site uninstall were not tested (single site only).
- **Plan D11 network tracing:** the trace has no network log, carried over from worker 1's note on D11.

## Unverified criteria

- **Not in scope for this unit, deferred to worker 3:** AC2 end-to-end (real marked GF/FF submissions, native feed suppression, entry deletion), AC4, AC5, AC6's adapter-level blocked message on a real unsupported dispatcher, and AC7. Worker 3 uses the API above.
- **Plugin with GF/FF inactive:** covered by deactivating them on the harness site before the first upload. That site was fresh, and the plugin had never been installed on it. A site that never had GF/FF installed at all was not built separately.
- **Local PHP lint:** no `php` binary is installed locally, so syntax was verified only by real activation and execution in Playground (PHP 8.3). PHP 7.4 compatibility is by construction, not tested.
