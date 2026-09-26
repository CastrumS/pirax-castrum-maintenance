# Form checker: unrelated localhost probes masquerading as a socket leak

Recorded: 2026-09-26.

## Case

The form-check IMAP deadline test intermittently saw one server-side connection remaining after production polling had closed. The original assertion counted every connection accepted by its ephemeral loopback listener. Isolated reruns often passed; the complete integration suite exposed the failure.

## Evidence

- Original stress run: 299 pass / 1 fail across 20 repeats of `test/forms/imap.test.ts`.
- Endpoint/process observation showed the ImapFlow client socket and its matching peer had both closed. The remaining connection belonged to local `moshi-hook`, which independently probed the listening port. Changing loopback addresses or IPv4/IPv6 did not eliminate the interference.
- The revised test observes the installed client's real socket/local endpoint without changing `connect()` arguments, transport, authentication or result. It requires exactly one owned peer, zero open owned peers, and the client close event within the existing bound.
- A deliberately unrelated idle connection reproduces the old false leak deterministically. Forty repeats after repair: 600 pass / 0 fail, 11,480 assertions.
- Original diagnostics: form-check leaf `implementation/evidence/worker-4/{imap-stress,poll-socket3,imap-owned-green}.txt`; interpretation and results: `implementation/worker-4.md`. Runnable regression: `test/forms/imap.test.ts`.

## Learning

An ephemeral localhost port is not private ownership of every accepted connection. Desktop discovery/security tools can connect independently. Tie network cleanup assertions to the actual client's identity and lifecycle, keep explicit negative controls, and preserve the cleanup deadline. Do not disable local services, increase waits blindly, accept the first connection as the client, or turn a real client leak into a passing aggregate count.
