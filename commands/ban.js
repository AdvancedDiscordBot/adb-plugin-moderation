"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");
const { dmActionUser } = require("../lib/dmUser");
const { createCase, postCaseLog } = require("../lib/logCase");

module.exports = {
  data: {
    name: "ban",
    description: "Ban a member from the server",
    options: [
      { type: 6, name: "user", description: "The user to ban", required: true },
      { type: 3, name: "reason", description: "Reason for the ban", required: false },
      {
        type: 4,
        name: "days",
        description: "Days of messages to delete (0-7)",
        required: false,
        min_value: 0,
        max_value: 7,
      },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.BanMembers)) return;

    const targetUser = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";
    const days = interaction.options.getInteger("days") ?? 0;
    const guildId = interaction.guild.id;

    const CaseModel = ctx.models.Case;
    const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

    let member;
    try {
      member = await interaction.guild.members.fetch(targetUser.id);
    } catch {
      // User not in guild — still attempt ban
    }

    if (member && !member.bannable) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setDescription("I cannot ban that member (insufficient role hierarchy).");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (configData.dm_on_action !== false) {
      await dmActionUser(ctx.client, targetUser.id, {
        action: "banned",
        guildName: interaction.guild.name,
        reason,
      });
    }

    try {
      await interaction.guild.members.ban(targetUser.id, {
        reason,
        deleteMessageSeconds: days * 86400,
      });
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to ban: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const caseDoc = await createCase(CaseModel, {
      guildId,
      type: "ban",
      targetId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
    });

    await postCaseLog(ctx, configData, caseDoc, targetUser, interaction.user);

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`Banned — Case #${caseDoc.caseNumber}`)
      .addFields(
        { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: "Reason", value: reason }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
