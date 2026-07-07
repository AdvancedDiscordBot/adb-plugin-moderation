"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "clearwarnings",
    description: "Clear all warnings for a member",
    options: [
      { type: 6, name: "user", description: "The member to clear warnings for", required: true },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageGuild)) return;

    const targetUser = interaction.options.getUser("user");
    const guildId = interaction.guild.id;
    const CaseModel = ctx.models.Case;

    const result = await CaseModel.deleteMany({ guildId, targetUserId: targetUser.id, type: "warn" });
    await ctx.db.updateUserProfile(targetUser.id, guildId, { warnings: 0 });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("Warnings Cleared")
      .setDescription(
        `Cleared **${result.deletedCount}** warning(s) for **${targetUser.tag}**.`
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
