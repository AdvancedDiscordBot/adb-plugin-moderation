"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");
const { createCase, postCaseLog } = require("../lib/logCase");

module.exports = {
  data: {
    name: "unban",
    description: "Unban a user by ID",
    options: [
      { type: 3, name: "user_id", description: "The user ID to unban", required: true },
      { type: 3, name: "reason", description: "Reason for the unban", required: false },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.BanMembers)) return;

    const userId = interaction.options.getString("user_id");
    const reason = interaction.options.getString("reason") || "No reason provided";
    const guildId = interaction.guild.id;

    const CaseModel = ctx.models.Case;
    const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

    let targetUser = null;
    try {
      targetUser = await ctx.client.users.fetch(userId);
    } catch {
      // May not be resolvable — continue
    }

    try {
      await interaction.guild.bans.remove(userId, reason);
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to unban: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const caseDoc = await createCase(CaseModel, {
      guildId,
      type: "unban",
      targetId: userId,
      moderatorId: interaction.user.id,
      reason,
    });

    await postCaseLog(ctx, configData, caseDoc, targetUser, interaction.user);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`Unbanned — Case #${caseDoc.caseNumber}`)
      .addFields(
        { name: "User", value: targetUser ? `${targetUser.tag} (${userId})` : userId, inline: true },
        { name: "Reason", value: reason }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
