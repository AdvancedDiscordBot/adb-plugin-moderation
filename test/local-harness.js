"use strict";

const { createMockCtx, buildInteraction, buildOptions } = require("./mock-ctx");
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
  // 4. Models defined (inspected via mock collector; the plugin itself
  //    carries them on its own local ctx, not the frozen core ctx)
  // -------------------------------------------------------
  console.log("\n-- models --");
  assert(typeof ctx._models.Case === "function", "Case model defined");
  assert(typeof ctx._models.Note === "function", "Note model defined");
  assert(typeof ctx._models.Ticket === "function", "Ticket model defined");

  // -------------------------------------------------------
  // 5. Hooks registered
  // -------------------------------------------------------
  console.log("\n-- hooks --");
  assert(
    ctx.hooks._handlers["onPluginUnload"] && ctx.hooks._handlers["onPluginUnload"].length > 0,
    "onPluginUnload hook registered"
  );

  // -------------------------------------------------------
  // 6. Member-scope identity fields: warn/note must set BOTH
  //    targetUserId and userId to the target's ID (platform
  //    member pages query {guildId, userId}).
  // -------------------------------------------------------
  console.log("\n-- member-scope identity fields --");
  const targetUser = { id: "target-user-42", tag: "Target#0001", displayAvatarURL: () => "" };
  const getCmd = (name) => (ctx._commands || []).find((c) => c.data.name === name);

  try {
    const warnInt = buildInteraction();
    warnInt.options = buildOptions({ user: targetUser, reason: "spam" });
    await getCmd("warn").execute(warnInt);
    const warnCase = ctx._models.Case._docs.find((d) => d.type === "warn");
    assert(warnCase, "warn created a Case");
    assert(warnCase && warnCase.targetUserId === "target-user-42", "warn Case targetUserId === target ID");
    assert(warnCase && warnCase.userId === "target-user-42", "warn Case userId === target ID");
  } catch (err) {
    assert(false, `warn execute threw: ${err.message}`);
    console.error(err);
  }

  try {
    const noteInt = buildInteraction();
    noteInt.options = buildOptions({ user: targetUser, text: "watch this one" });
    await getCmd("note").execute(noteInt);
    const noteCase = ctx._models.Case._docs.find((d) => d.type === "note");
    assert(noteCase, "note created a Case");
    assert(noteCase && noteCase.targetUserId === "target-user-42", "note Case targetUserId === target ID");
    assert(noteCase && noteCase.userId === "target-user-42", "note Case userId === target ID");
    const noteDoc = ctx._models.Note._docs[0];
    assert(noteDoc, "note created a Note document");
    assert(noteDoc && noteDoc.userId === "target-user-42", "note Note userId === target ID");
  } catch (err) {
    assert(false, `note execute threw: ${err.message}`);
    console.error(err);
  }

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
