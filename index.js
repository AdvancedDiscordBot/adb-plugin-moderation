"use strict";

const CaseSchema = require("./models/case");
const NoteSchema = require("./models/note");
const TicketSchema = require("./models/ticket");

const commands = [
  require("./commands/ban"),
  require("./commands/unban"),
  require("./commands/kick"),
  require("./commands/timeout"),
  require("./commands/untimeout"),
  require("./commands/warn"),
  require("./commands/warnings"),
  require("./commands/clearwarnings"),
  require("./commands/note"),
  require("./commands/purge"),
  require("./commands/slowmode"),
  require("./commands/lock"),
  require("./commands/unlock"),
  require("./commands/case"),
  require("./commands/history"),
  require("./commands/modstats"),
  require("./commands/ticket"),
];

/**
 * Plugin entry point called by the ADB plugin loader.
 * @param {object} ctx — plugin context
 */
async function load(ctx) {
  // Define mongoose models (namespaced internally by ADB)
  const CaseModel = ctx.defineModel("Case", CaseSchema);
  const NoteModel = ctx.defineModel("Note", NoteSchema);
  const TicketModel = ctx.defineModel("Ticket", TicketSchema);

  // ctx is frozen by the core loader — build a local extension carrying the
  // models instead of mutating it. Commands read pctx.models.*
  const pctx = { ...ctx, models: { Case: CaseModel, Note: NoteModel, Ticket: TicketModel } };

  // Register all slash commands
  for (const cmd of commands) {
    ctx.registerCommand({
      data: cmd.data,
      execute: (interaction) => cmd.execute(interaction, pctx),
    });
  }

  // Cleanup hook
  ctx.hooks.on("onPluginUnload", () => {
    ctx.logger.info("[moderation] Plugin unloaded.");
  });

  ctx.logger.info("[moderation] Moderation plugin loaded — registered " + commands.length + " commands.");
}

module.exports = { load };
