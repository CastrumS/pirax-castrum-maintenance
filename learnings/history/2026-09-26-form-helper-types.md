# Generic bridge results and overloaded test matchers

## Case — 2026-09-26

After rebasing form-helper-plugin onto `9140cdd`, strict TypeScript checking included `test/`. At `67ab9bd8d9b119e79440ae596adffe913701139c`, `bun run typecheck` reported 28 errors, including six misleading matcher overload errors. For example:

```ts
expect(await h.php("return (bool) get_option('gform_enable_async_notifications');")).toBe(true);
// TS2769: Argument of type 'true' is not assignable to parameter of type 'undefined'.
```

`Harness.php<T = unknown>` has a return-only generic parameter. Contextual inference from Bun's first `expect` overload (`actual?: never`) inferred `T = never` rather than using the `unknown` default. The matcher consequently expected `undefined`.

## Repair and evidence

Specify the known PHP result type at the bridge call (`h.php<boolean>(...)` here), preserving the `unknown` default for unspecified results. The same fix applies to the fixture's string and parser-object results. No runtime expected values change.

The red diagnostic is reproducible at the commit above with the merged compiler configuration. The repaired `test/plugin/{adapters,core,harness}.test.ts` retains the native PHP expressions and expectations. Worker verification passed all 38 plugin tests / 680 assertions. B then ran unchanged strict typecheck successfully and the full integrated suite: 137 tests / 1482 assertions, no failures.

## Learning and scope

A default generic return type is a fallback, not a guarantee against inference from an overloaded consumer. Diagnose the inferred type before weakening a matcher, compiler option or shared bridge to `any`. Supply the producer's actual result shape at that boundary; runtime assertions still validate it. Observed with Bun 1.4.2's matcher declarations in this repository; this is not a claim that every test library has the same overload behavior.
