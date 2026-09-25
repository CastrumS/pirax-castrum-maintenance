# Brief: form-check-scope

## What
Change the form check so each site submits exactly one designated test form per run, and nothing else.
- `sites.yaml` gets an optional per-site field `test_form: { page: <path>, plugin: gravity|fluent, id: <int> }`. `page` must be one of that site's listed `pages`; `loadSites` rejects anything else with a message naming the site.
- During a `check` or `forms` run, per site: if `test_form` is set, only that form (matched by plugin and id on that page) is filled and, when `form_helper: true`, submitted **once**. Every other Gravity/Fluent form found on listed pages is reported with the new outcome `skipped`, never filled or submitted.
- If `test_form` is absent, no form on that site is filled or submitted; all found forms are `skipped`.
- If the designated form isn't found on its page, the outcome is `failed` with detail "test form not found".
- In `sites.yaml`, turn the `# test_form:` comment lines already written for each site into real `test_form` fields.

No new credentials. It uses the ones form-check already needs (`FORM_TEST_TOKEN`, `FORM_TEST_ADDRESS`, `IMAP_*`, `SMTP_*`, `GRAVITY_FORMS_ZIP`, `S3_*`).

## Why
Site-wide forms appear on most listed pages, so the current form-check would send one test submission per page (for example 16 per run on laris-tcb.hr). It would also submit the login/registration forms on instrukcijezasve.hr, which can create real accounts. The operator wants one submission per maintenance cycle, on the most important form, and never the login/registration form.

## Done-criteria
1. `bun test` covers `test_form` validation: a page not in `pages`, an unknown plugin, a non-integer id and an unknown key inside `test_form` each fail with the site slug named; a valid entry loads.
2. End to end against the local `@wp-playground/cli` WordPress used by form-check, with one page holding two Gravity forms and one Fluent form, listed on two pages: with `test_form` pointing at one form, `bun run forms local` produces exactly one submission (asserted from the test mail log and entry count) and reports every other form as `skipped`. Trace and report kept as artifacts.
3. Without `test_form`, the same run produces zero submissions and every form is `skipped`; with `test_form` pointing at a missing form id, the outcome is `failed` with "test form not found".
4. With `form_helper: false`, the designated form is filled but not submitted (`not-verified`) and no other form is touched.
5. The committed `sites.yaml` loads without errors and has a `test_form` for every site that had a `# test_form:` comment; downstairs has none.
6. `bun run typecheck` passes.
