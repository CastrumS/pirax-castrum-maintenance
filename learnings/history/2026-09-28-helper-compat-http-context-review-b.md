# Safe HTTP fields were followed by unsanitized request context

Recorded: 2026-09-28, helper-compat initial review B.

## Case

The compatibility test harness projected outgoing requests to method, host, path, hook names and purpose, excluding the destination query, headers and body. It then passed those fields through a shared logger that appended the inbound `$_SERVER['REQUEST_URI']` unchanged. The new HTTP reader documentation promised no query strings, but that additional context carried them.

## Evidence

- Reviewed commit: `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`.
- `test/plugin/mu-plugin.php:22-25`: the shared logger appends the raw inbound URI after constructing the safe outgoing record.
- `test/plugin/README.md:109` and `test/plugin/harness.ts:49`: the HTTP ledger promises query-free metadata.
- The passing full-stack artifact `artifacts/plugin/compatibility-2026-09-28T18-03-33-971Z/http.jsonl` held 77 records. A count-only review found 34 inbound request-context fields with a query and 6 with `_wpnonce=`, while every outgoing `path` was query-free.
- Count-only evidence and the finding are in the authoritative leaf's `review-B-evidence.json` and `review-B.md`. No query/nonce values were printed or copied into this history.

The configured credential/path scanner had passed. It checks known values, so that result did not establish the stronger structural promise that arbitrary query fields are absent.

## Learning

A safe projection is not the complete logging boundary when another layer appends context afterward. Evaluate the final serialized record, including shared logger metadata, and test both inbound and outbound URI handling. Known-secret scanning and structural exclusion are different checks; passing one does not establish the other.
