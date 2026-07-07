"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");
const { parseDuration } = require("../lib/parseDuration");
const { dmActionUser } = require("../lib/dmUser");
const { createCase, postCaseLog } = require("../lib/logCase");

module.exports = {
  data: {
    name: "timeout",
    description: "Timeout a member (e.g. 1h, 30m, 7d)",
    options: [
      { type: 6, name: "user", description: "The member to timeout", required: true },
      { type: 3, name: "duration", description: "Duration (e.g. 30m, 1h, 7d — max 28d)", required: true },
      { type: 3, name: "reason", description: "Reason for the timeout", required: false },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ModerateMembers)) return;

    const targetUser = interaction.options.getUser("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") || "No reason provided";
    const guildId = interaction.guild.id;

    const ms = parseDuration(durationStr);
    if (!ms) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setDescription("Invalid duration. Use formats like `30m`, `1h`, `7d`. Maximum is 28 days.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const CaseModel = ctx.models.Case;
    const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

    let member;
    try {
      member = await interaction.guild.members.fetch(targetUser.id);
    } catch {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription("That user is not in this server.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!member.moderatable) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setDescription("I cannot timeout that member (insufficient role hierarchy).");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (configData.dm_on_action !== false) {
      await dmActionUser(ctx.client, targetUser.id, {
        action: "timed out",
        guildName: interaction.guild.name,
        reason,
        duration: durationStr,
      });
    }

    try {
      await member.timeout(ms, reason);
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to timeout: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const caseDoc = await createCase(CaseModel, {
      guildId,
      type: "timeout",
      targetId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
      duration: durationStr,
    });

    await postCaseLog(ctx, configData, caseDoc, targetUser, interaction.user);

    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle(`Timed Out — Case #${caseDoc.caseNumber}`)
      .addFields(
        { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: "Duration", value: durationStr, inline: true },
        { name: "Reason", value: reason }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
