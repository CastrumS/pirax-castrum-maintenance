// Test-only process wrapper; production CLI has no storage-root flag.
import { dispatch, type Command } from "../../src/commands/common.ts";
import { createStore } from "../../src/store.ts";
const [root, runsDir, command, ...args] = process.argv.slice(2);
if (!root || !/^test\/(?:visual|forms)-[A-Za-z0-9.-]+\/$/.test(root) || !runsDir) process.exit(2);
process.exitCode = await dispatch(command as Command, args, { store: createStore({ root }), runsDir, log: () => {} });
