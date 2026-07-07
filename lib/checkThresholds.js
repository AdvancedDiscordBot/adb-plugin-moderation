"use strict";

const { parseDuration } = require("./parseDuration");
const { dmActionUser } = require("./dmUser");
const { createCase, postCaseLog } = require("./logCase");

/**
 * Apply an automatic action if the warning count hits a configured threshold.
 *
 * @param {object} ctx
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {import("mongoose").Model} CaseModel
 * @param {string} userId
 * @param {string} guildId
 * @param {number} warningCount
 * @param {object} thresholds — map of "N": { action, duration? }
 */
async function checkWarnThresholds(ctx, interaction, CaseModel, userId, guildId, warningCount, thresholds) {
  if (!thresholds) return;

  const threshold = thresholds[String(warningCount)];
  if (!threshold) return;

  const { action, duration: durationStr } = threshold;
  const guild = interaction.guild;
  const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    return; // Member may have left
  }

  const reason = `Auto-action: ${warningCount} warnings reached`;

  try {
    if (action === "ban") {
      await dmActionUser(ctx.client, userId, { action: "banned", guildName: guild.name, reason });
      await member.ban({ reason });
      const caseDoc = await createCase(CaseModel, {
        guildId,
        type: "ban",
        targetId: userId,
        moderatorId: ctx.client.user.id,
        reason,
      });
      await postCaseLog(ctx, configData, caseDoc, await ctx.client.users.fetch(userId).catch(() => null), ctx.client.user);
    } else if (action === "kick") {
      await dmActionUser(ctx.client, userId, { action: "kicked", guildName: guild.name, reason });
      await member.kick(reason);
      const caseDoc = await createCase(CaseModel, {
        guildId,
        type: "kick",
        targetId: userId,
        moderatorId: ctx.client.user.id,
        reason,
      });
      await postCaseLog(ctx, configData, caseDoc, await ctx.client.users.fetch(userId).catch(() => null), ctx.client.user);
    } else if (action === "timeout") {
      const ms = durationStr ? parseDuration(durationStr) : 3600000;
      if (!ms) return;
      await member.timeout(ms, reason);
      await dmActionUser(ctx.client, userId, { action: "timed out", guildName: guild.name, reason, duration: durationStr });
      const caseDoc = await createCase(CaseModel, {
        guildId,
        type: "timeout",
        targetId: userId,
        moderatorId: ctx.client.user.id,
        reason,
        duration: durationStr,
      });
      await postCaseLog(ctx, configData, caseDoc, await ctx.client.users.fetch(userId).catch(() => null), ctx.client.user);
    }
  } catch (err) {
    ctx.logger.warn(`[moderation] Auto-threshold action failed: ${err.message}`);
  }
}

module.exports = { checkWarnThresholds };
