"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");
const { createCase, postCaseLog } = require("../lib/logCase");

module.exports = {
  data: {
    name: "note",
    description: "Add a moderator note to a member",
    options: [
      { type: 6, name: "user", description: "The member to add a note to", required: true },
      { type: 3, name: "text", description: "The note content", required: true },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageMessages)) return;

    const targetUser = interaction.options.getUser("user");
    const text = interaction.options.getString("text");
    const guildId = interaction.guild.id;

    const CaseModel = ctx.models.Case;
    const NoteModel = ctx.models.Note;
    const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

    // Save note document
    const noteDoc = new NoteModel({
      guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      note: text,
    });
    await noteDoc.save();

    const caseDoc = await createCase(CaseModel, {
      guildId,
      type: "note",
      targetId: targetUser.id,
      moderatorId: interaction.user.id,
      reason: text,
    });

    await postCaseLog(ctx, configData, caseDoc, targetUser, interaction.user);

    const embed = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setTitle(`Note Added — Case #${caseDoc.caseNumber}`)
      .addFields(
        { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: "Note", value: text }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
