"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");
const { dmActionUser } = require("../lib/dmUser");
const { createCase, postCaseLog } = require("../lib/logCase");

module.exports = {
  data: {
    name: "kick",
    description: "Kick a member from the server",
    options: [
      { type: 6, name: "user", description: "The member to kick", required: true },
      { type: 3, name: "reason", description: "Reason for the kick", required: false },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.KickMembers)) return;

    const targetUser = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "No reason provided";
    const guildId = interaction.guild.id;

    const CaseModel = ctx.models.Case;
    const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

    let member;
    try {
      member = await interaction.guild.members.fetch(targetUser.id);
    } catch {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription("That user is not in this server.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!member.kickable) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setDescription("I cannot kick that member (insufficient role hierarchy).");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (configData.dm_on_action !== false) {
      await dmActionUser(ctx.client, targetUser.id, {
        action: "kicked",
        guildName: interaction.guild.name,
        reason,
      });
    }

    try {
      await member.kick(reason);
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to kick: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const caseDoc = await createCase(CaseModel, {
      guildId,
      type: "kick",
      targetId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
    });

    await postCaseLog(ctx, configData, caseDoc, targetUser, interaction.user);

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`Kicked — Case #${caseDoc.caseNumber}`)
      .addFields(
        { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: "Reason", value: reason }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
