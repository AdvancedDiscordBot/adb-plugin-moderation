"use strict";

const { EmbedBuilder } = require("discord.js");

const TYPE_COLORS = {
  ban: 0xe74c3c,
  unban: 0x2ecc71,
  kick: 0xe67e22,
  timeout: 0xf39c12,
  untimeout: 0x3498db,
  warn: 0xf1c40f,
  note: 0x95a5a6,
};

/**
 * Create a new moderation case document and save it.
 * Case numbers are per-guild, starting from 1.
 *
 * @param {import("mongoose").Model} CaseModel
 * @param {{ guildId: string, type: string, targetId: string, moderatorId: string, reason?: string, duration?: string }} opts
 * @returns {Promise<object>} Saved case document
 */
async function createCase(CaseModel, { guildId, type, targetId, moderatorId, reason, duration }) {
  const last = await CaseModel.findOne({ guildId }).sort({ caseNumber: -1 }).select("caseNumber").lean();
  const caseNumber = last ? last.caseNumber + 1 : 1;

  const doc = new CaseModel({
    guildId,
    caseNumber,
    type,
    targetUserId: targetId,
    moderatorId,
    reason: reason || "No reason provided",
    duration: duration || null,
  });

  await doc.save();
  return doc;
}

/**
 * Post a case embed to the configured log channel.
 *
 * @param {object} ctx — plugin context
 * @param {object} configData — guild plugin config data
 * @param {object} caseDoc — saved case document
 * @param {import("discord.js").User|null} targetUser
 * @param {import("discord.js").User|null} moderator
 */
async function postCaseLog(ctx, configData, caseDoc, targetUser, moderator) {
  const logChannelId = configData && configData.log_channel_id;
  if (!logChannelId) return;

  try {
    const channel = await ctx.client.channels.fetch(logChannelId);
    if (!channel || !channel.isTextBased()) return;

    const color = TYPE_COLORS[caseDoc.type] || 0x99aab5;
    const targetName = targetUser ? `${targetUser.tag} (${targetUser.id})` : caseDoc.targetUserId;
    const modName = moderator ? `${moderator.tag} (${moderator.id})` : caseDoc.moderatorId;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`Case #${caseDoc.caseNumber} — ${caseDoc.type.toUpperCase()}`)
      .addFields(
        { name: "Target", value: targetName, inline: true },
        { name: "Moderator", value: modName, inline: true },
        { name: "Reason", value: caseDoc.reason || "No reason provided" }
      )
      .setTimestamp(caseDoc.createdAt);

    if (caseDoc.duration) {
      embed.addFields({ name: "Duration", value: caseDoc.duration, inline: true });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    ctx.logger.warn(`[moderation] Failed to post case log: ${err.message}`);
  }
}

module.exports = { createCase, postCaseLog };
