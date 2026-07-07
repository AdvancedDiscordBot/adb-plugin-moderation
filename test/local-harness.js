"use strict";

const { createMockCtx } = require("./mock-ctx");
const { load } = require("../index");
const { parseDuration } = require("../lib/parseDuration");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

async function run() {
  console.log("\n=== adb-plugin-moderation local test harness ===\n");

  // -------------------------------------------------------
  // 1. load(ctx) succeeds
  // -------------------------------------------------------
  console.log("-- load(ctx) --");
  const ctx = createMockCtx();
  try {
    await load(ctx);
    assert(true, "load(ctx) did not throw");
  } catch (err) {
    assert(false, `load(ctx) threw: ${err.message}`);
    console.error(err);
  }

  // -------------------------------------------------------
  // 2. All commands registered
  // -------------------------------------------------------
  console.log("\n-- command registration --");
  const expected = [
    "ban", "unban", "kick", "timeout", "untimeout",
    "warn", "warnings", "clearwarnings", "note",
    "purge", "slowmode", "lock", "unlock",
    "case", "history", "modstats", "ticket",
  ];

  const registered = (ctx._commands || []).map((c) => c.data.name);

  for (const name of expected) {
    assert(registered.includes(name), `command "${name}" registered`);
  }
  assert(
    registered.length === expected.length,
    `total command count = ${expected.length} (got ${registered.length})`
  );

  // -------------------------------------------------------
  // 3. parseDuration
  // -------------------------------------------------------
  console.log("\n-- parseDuration --");
  assert(parseDuration("1h") === 3600000, "parseDuration('1h') === 3600000");
  assert(parseDuration("30m") === 1800000, "parseDuration('30m') === 1800000");
  assert(parseDuration("28d") === 2419200000, "parseDuration('28d') === 2419200000");
  assert(parseDuration("7d") === 604800000, "parseDuration('7d') === 604800000");
  assert(parseDuration("99d") === null, "parseDuration('99d') === null (over max)");
  assert(parseDuration("abc") === null, "parseDuration('abc') === null (invalid)");
  assert(parseDuration("") === null, "parseDuration('') === null (empty)");
  assert(parseDuration("0m") === null, "parseDuration('0m') === null (zero)");
  assert(parseDuration(null) === null, "parseDuration(null) === null");

  // -------------------------------------------------------
  // 4. Models defined
  // -------------------------------------------------------
  console.log("\n-- models --");
  assert(typeof ctx.models.Case === "function", "Case model defined");
  assert(typeof ctx.models.Note === "function", "Note model defined");
  assert(typeof ctx.models.Ticket === "function", "Ticket model defined");

  // -------------------------------------------------------
  // 5. Hooks registered
  // -------------------------------------------------------
  console.log("\n-- hooks --");
  assert(
    ctx.hooks._handlers["onPluginUnload"] && ctx.hooks._handlers["onPluginUnload"].length > 0,
    "onPluginUnload hook registered"
  );

  // -------------------------------------------------------
  // Summary
  // -------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Harness crashed:", err);
  process.exit(1);
});
