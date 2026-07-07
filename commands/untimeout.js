"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");
const { createCase, postCaseLog } = require("../lib/logCase");

module.exports = {
  data: {
    name: "untimeout",
    description: "Remove a timeout from a member",
    options: [
      { type: 6, name: "user", description: "The member to untimeout", required: true },
      { type: 3, name: "reason", description: "Reason", required: false },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ModerateMembers)) return;

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

    try {
      await member.timeout(null, reason);
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to remove timeout: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const caseDoc = await createCase(CaseModel, {
      guildId,
      type: "untimeout",
      targetId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
    });

    await postCaseLog(ctx, configData, caseDoc, targetUser, interaction.user);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`Timeout Removed — Case #${caseDoc.caseNumber}`)
      .addFields(
        { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: "Reason", value: reason }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
