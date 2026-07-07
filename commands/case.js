"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

const TYPE_COLORS = {
  ban: 0xe74c3c,
  unban: 0x2ecc71,
  kick: 0xe67e22,
  timeout: 0xf39c12,
  untimeout: 0x3498db,
  warn: 0xf1c40f,
  note: 0x95a5a6,
};

module.exports = {
  data: {
    name: "case",
    description: "Look up a moderation case by number",
    options: [
      { type: 4, name: "id", description: "Case number", required: true, min_value: 1 },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageMessages)) return;

    const caseNumber = interaction.options.getInteger("id");
    const guildId = interaction.guild.id;
    const CaseModel = ctx.models.Case;

    const caseDoc = await CaseModel.findOne({ guildId, caseNumber }).lean();

    if (!caseDoc) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setDescription(`Case #${caseNumber} not found.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let targetUser = null;
    let moderator = null;
    try { targetUser = await ctx.client.users.fetch(caseDoc.targetUserId); } catch {}
    try { moderator = await ctx.client.users.fetch(caseDoc.moderatorId); } catch {}

    const color = TYPE_COLORS[caseDoc.type] || 0x99aab5;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`Case #${caseDoc.caseNumber} — ${caseDoc.type.toUpperCase()}`)
      .addFields(
        { name: "Target", value: targetUser ? `${targetUser.tag} (${caseDoc.targetUserId})` : caseDoc.targetUserId, inline: true },
        { name: "Moderator", value: moderator ? `${moderator.tag} (${caseDoc.moderatorId})` : caseDoc.moderatorId, inline: true },
        { name: "Reason", value: caseDoc.reason || "No reason provided" }
      )
      .setTimestamp(caseDoc.createdAt);

    if (caseDoc.duration) {
      embed.addFields({ name: "Duration", value: caseDoc.duration, inline: true });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
