# Secret in a diagnostic path — 2026-10-12

## Case

The deployment renderer derives ZIP entry paths from the selected plugin slug. The build scanner correctly rejected a rendered file containing a known credential value, but its exception named the rendered path. When a credential value equaled the configured slug, that diagnostic repeated the very value being rejected.

## Evidence

- A controlled synthetic value, not a real credential, reproduced the leak in `tests/deployment-build.test.ts`. The assertion compares a boolean so its failure does not print a credential matcher subject.
- Red: ignored `artifacts/deployment-folder/slug-privacy-red.log`.
- Repair: `scripts/build-plugin.ts` reports the fixed allowlisted template `file`, not the config-derived output `path`.
- Green: `artifacts/deployment-folder/slug-privacy-green.log`: 30 pass, 0 fail, 562 assertions.

## Learning

Once a value is identified as sensitive, surrounding context derived from the same input is not automatically safe to print. Prefer fixed field names or allowlisted source labels in rejection diagnostics. Keep the check before output creation and retain a regression for secret/path overlap.
