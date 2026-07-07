"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");
const { dmActionUser } = require("../lib/dmUser");
const { createCase, postCaseLog } = require("../lib/logCase");
const { checkWarnThresholds } = require("../lib/checkThresholds");

module.exports = {
  data: {
    name: "warn",
    description: "Warn a member",
    options: [
      { type: 6, name: "user", description: "The member to warn", required: true },
      { type: 3, name: "reason", description: "Reason for the warning", required: true },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageMessages)) return;

    const targetUser = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const guildId = interaction.guild.id;

    const CaseModel = ctx.models.Case;
    const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

    const caseDoc = await createCase(CaseModel, {
      guildId,
      type: "warn",
      targetId: targetUser.id,
      moderatorId: interaction.user.id,
      reason,
    });

    // Increment warning counter in user profile
    const profile = await ctx.db.getUserProfile(targetUser.id, guildId);
    const newWarnings = (profile.warnings || 0) + 1;
    await ctx.db.updateUserProfile(targetUser.id, guildId, { warnings: newWarnings });

    if (configData.dm_on_action !== false) {
      await dmActionUser(ctx.client, targetUser.id, {
        action: "warned",
        guildName: interaction.guild.name,
        reason,
      });
    }

    await postCaseLog(ctx, configData, caseDoc, targetUser, interaction.user);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`Warned — Case #${caseDoc.caseNumber}`)
      .addFields(
        { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: "Total Warnings", value: String(newWarnings), inline: true },
        { name: "Reason", value: reason }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    // Check thresholds AFTER replying so auto-actions don't block the response
    await checkWarnThresholds(
      ctx,
      interaction,
      CaseModel,
      targetUser.id,
      guildId,
      newWarnings,
      configData.warn_thresholds
    );
  },
};
