"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "warnings",
    description: "View warnings for a member",
    options: [
      { type: 6, name: "user", description: "The member to check", required: true },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageMessages)) return;

    const targetUser = interaction.options.getUser("user");
    const guildId = interaction.guild.id;
    const CaseModel = ctx.models.Case;

    const warns = await CaseModel.find({ guildId, targetUserId: targetUser.id, type: "warn" })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean();

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`Warnings for ${targetUser.tag}`)
      .setDescription(
        warns.length === 0
          ? "No warnings on record."
          : warns
              .map(
                (w) =>
                  `**Case #${w.caseNumber}** — <t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R>\n${w.reason}`
              )
              .join("\n\n")
      )
      .setFooter({ text: `Total: ${warns.length} warning(s)` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
