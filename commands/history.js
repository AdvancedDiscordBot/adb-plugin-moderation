"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "history",
    description: "View moderation history for a member",
    options: [
      { type: 6, name: "user", description: "The member to look up", required: true },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageMessages)) return;

    const targetUser = interaction.options.getUser("user");
    const guildId = interaction.guild.id;
    const CaseModel = ctx.models.Case;

    const cases = await CaseModel.find({ guildId, targetUserId: targetUser.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const embed = new EmbedBuilder()
      .setColor(0x99aab5)
      .setTitle(`History for ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        cases.length === 0
          ? "No moderation history found."
          : cases
              .map(
                (c) =>
                  `**[#${c.caseNumber}] ${c.type.toUpperCase()}** — <t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:R>\n${c.reason}`
              )
              .join("\n\n")
      )
      .setFooter({ text: `Showing up to 20 most recent cases` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
