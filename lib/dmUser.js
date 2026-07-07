"use strict";

const { EmbedBuilder } = require("discord.js");

/**
 * DM a user about a moderation action. Silently swallows failures.
 * @param {import("discord.js").Client} client
 * @param {string} userId
 * @param {{ action: string, guildName: string, reason?: string, duration?: string }} opts
 */
async function dmActionUser(client, userId, { action, guildName, reason, duration }) {
  try {
    const user = await client.users.fetch(userId);
    const desc = duration
      ? `You have been **${action}** from **${guildName}** for **${duration}**.`
      : `You have been **${action}** from **${guildName}**.`;

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`Moderation Action — ${action.charAt(0).toUpperCase() + action.slice(1)}`)
      .setDescription(desc)
      .addFields({ name: "Reason", value: reason || "No reason provided" })
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch {
    // Silently ignore — user may have DMs closed or bot cannot reach them
  }
}

module.exports = { dmActionUser };
