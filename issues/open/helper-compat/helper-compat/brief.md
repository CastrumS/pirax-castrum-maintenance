# Brief: helper-compat

## What
Extend the `pirax-form-test` WordPress plugin (`plugin/pirax-form-test/`) so marked test submissions work on the plugin stacks the operator's real sites use, and so an admin can see what would block them.

1. **Compatibility panel.** Settings → Pirax Form Test shows, for Gravity Forms and Fluent Forms separately: detected version and whether it is audited, and every unaudited callback on the audited submission hooks (the same list `unaudited_callbacks()` computes), grouped by hook, as `class::method`, function name or closure file. Read-only; admins only (`manage_options`), escaped output, no secrets shown. A one-line verdict per form plugin: "ready" or "blocked: <reason>".
2. **Anti-Spam by CleanTalk 6.88.** For a *marked* submission only, CleanTalk's form integration must not run for that submission (nothing sent to CleanTalk's servers, no spam verdict), on both Fluent Forms and Gravity Forms. Ordinary submissions keep CleanTalk exactly as before. If CleanTalk is present in a version other than 6.88, or its hook cannot be neutralised, the marked submission is rejected with the existing blocked message.
3. **Fluent Forms Pro Add On Pack 6.2.14.** Audit it the way free Fluent Forms 6.2.14 was audited: a marked submission on a site with Pro active runs no Pro integration, webhook, CRM or payment side effect; only the email notification runs (redirected). Pro callbacks that are safe or suppressed are added to the audited list; anything else keeps rejecting. Exact-version pinning as today (`AUDITED_VERSIONS` gains Pro and CleanTalk).
4. **FluentSMTP 2.4.x.** Prove mail redirection still holds when FluentSMTP replaces `wp_mail()`: the redirected recipient, stripped Cc/Bcc, subject prefix and `X-Pirax-Form-Test` header are what FluentSMTP hands to its transport (use its log/"simulate" mode or its pre-send filter in tests; no real SMTP send).

Inputs (gitignored `.env`, read by the test harness only, never on command lines): `GRAVITY_FORMS_ZIP` (licensed GF 3.1.2), `FLUENT_FORMS_PRO_ZIP` (licensed Fluent Forms Pro 6.2.14). CleanTalk 6.88 and FluentSMTP are free on wordpress.org and may be fetched by the harness at pinned versions. A CleanTalk API key is not required: with no key CleanTalk still hooks submissions, which is the case to neutralise; tests must assert that no request to CleanTalk's hosts is made for a marked submission (intercept `pre_http_request`).

## Why
First live rollout (stolarijabanek.com, 2026-09-28) correctly rejected the marked submission: "Pirax test blocked: integrations could not be suppressed". The site runs Fluent Forms 6.2.14 + Fluent Forms Pro 6.2.14 + Anti-Spam by CleanTalk 6.88 + FluentSMTP 2.4.0 (+ Bricks/Bricksforge). CleanTalk hooks `fluentform/before_insert_submission` (verified in its source, `inc/cleantalk-integrations-by-hook.php`). The other Fluent Forms sites (suntos, bravarskiservis, spok-ing) share this Bricks stack. The operator also could not tell which plugin blocked, hence the panel.

## Done-criteria
1. Playground suites (existing `test/plugin/` harness, extended) with GF 3.1.2, FF 6.2.14, FF Pro 6.2.14, CleanTalk 6.88 and FluentSMTP all active: a marked FF submission and a marked GF submission each succeed, produce exactly one redirected mail with the header/subject contract, make **zero** HTTP requests to CleanTalk hosts, run no Pro integration feed (assert with a configured Pro webhook feed pointing at a local capture URL: zero hits), and leave no entry.
2. Same stack, ordinary (unmarked) submissions: CleanTalk's hook still runs (its request is attempted and captured by `pre_http_request`), the Pro webhook fires once, mail goes to the original recipient — i.e. behaviour unchanged.
3. Version pinning: CleanTalk or FF Pro at any other version → marked submission rejected with the existing blocked message; an extra unknown callback on an audited hook → rejected, and the settings panel names that callback.
4. Settings panel: renders for admins with per-plugin verdicts and the unaudited-callback list; non-admins get nothing; output escaped (test with a closure file path containing `<script>`).
5. `bun run build:plugin` ZIP still contains only allowlisted files; plugin version bumped to 0.2.0; `plugin/pirax-form-test/README.md` documents the audited versions, the panel and the CleanTalk behaviour.
6. `bun run typecheck` and `bun test` pass.
