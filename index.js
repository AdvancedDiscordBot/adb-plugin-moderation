"use strict";

const CaseSchema = require("./models/case");
const NoteSchema = require("./models/note");
const TicketSchema = require("./models/ticket");
const CaseCounterSchema = require("./models/caseCounter");

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
  const CaseCounter = ctx.defineModel("CaseCounter", CaseCounterSchema);

  // ctx is frozen by the core loader — build a local extension carrying the
  // models instead of mutating it. Commands read pctx.models.*
  const pctx = { ...ctx, models: { Case: CaseModel, Note: NoteModel, Ticket: TicketModel, CaseCounter } };
  const pending = new Map();

  // Register all slash commands
  for (const cmd of commands) {
    ctx.registerCommand({
      data: cmd.data,
			execute: async (interaction) => {
				if (!interaction.guild) return cmd.execute(interaction, pctx);
				const guildId = interaction.guildId;
				let key;
				if (guildId && ["warn", "clearwarnings"].includes(cmd.data.name)) {
					key = `${guildId}:warnings:${interaction.options.getUser("user").id}`;
				} else if (guildId && cmd.data.name === "ticket") {
					const sub = interaction.options.getSubcommand();
					let target = "setup";
					if (sub === "open") target = `user:${interaction.user.id}`;
					else if (sub !== "setup") target = `channel:${interaction.channelId}`;
					key = `${guildId}:ticket:${target}`;
				}
				if (!key) return cmd.execute(interaction, pctx);

				await interaction.deferReply({ ephemeral: true });
				// Serialize read/modify/write commands without blocking unrelated members or channels.
				const execution = (pending.get(key) || Promise.resolve()).catch(() => {}).then(() => cmd.execute(interaction, pctx));
				pending.set(key, execution);
				try {
					return await execution;
				} finally {
					if (pending.get(key) === execution) pending.delete(key);
				}
			},
    });
  }

  // Cleanup hook
  ctx.hooks.on("onPluginUnload", () => {
    ctx.logger.info("[moderation] Plugin unloaded.");
  });

  ctx.logger.info("[moderation] Moderation plugin loaded — registered " + commands.length + " commands.");
}

module.exports = { load };
