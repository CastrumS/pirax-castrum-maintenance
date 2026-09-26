# 2026-09-25 — WordPress mail filter arguments versus effective recipients

## Case

Review B of form-helper-plugin at `2e2105c37b199065a311b16ffc5797799fc50253` inspected a helper whose late `wp_mail` filter stripped Cc/Bcc using an anchored header-name regex. Its tests observed arguments at `pre_wp_mail` and stopped before WordPress parsed headers.

## Evidence

In a real Playground WordPress 7.1.2, a marked `wp_mail()` call included `chr(11) . 'Cc: cc@client.test'` and `chr(0) . 'Bcc: bcc@client.test'`. The helper retained both lines and its idempotence guard accepted them. WordPress subsequently trimmed those header names and added both addresses to PHPMailer's effective Cc/Bcc lists. A review-only `phpmailer_init` observer captured those lists and threw before sending; no message was delivered.

The To list contained only the configured test redirect, while Cc and Bcc still contained the client fixture addresses. This was not a transport plugin overriding the filter: it was WordPress's ordinary downstream parsing.

- Finding and reproduction: `issues/open/site-checks/form-helper-plugin/review-B.md`, F1.
- Durable result: `issues/open/site-checks/form-helper-plugin/review-B-evidence.json`.
- Worktree trace/manifest: `artifacts/plugin/review-B-probes-2026-09-25T16-05-29-209Z/`.

## Learning

An argument-level safety assertion can miss semantics introduced by downstream normalization. For this mail filter, checking effective recipients after WordPress parsed headers exposed a defect that checking `pre_wp_mail` arguments did not. The review requests a repair and a native-envelope regression; this history does not claim that repair has already landed.
