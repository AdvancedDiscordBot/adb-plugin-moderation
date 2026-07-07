"use strict";

const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");

/**
 * Check that interaction.member has all listed permissions.
 * Replies with an ephemeral error embed if not. Returns true/false.
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {...bigint} perms — PermissionFlagsBits values
 * @returns {boolean}
 */
function requirePerms(interaction, ...perms) {
  const member = interaction.member;
  const missing = perms.filter((p) => !member.permissions.has(p));
  if (missing.length === 0) return true;

  const names = missing
    .map((p) => {
      const entry = Object.entries(PermissionFlagsBits).find(([, v]) => v === p);
      return entry ? entry[0] : String(p);
    })
    .join(", ");

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("Missing Permissions")
    .setDescription(`You need the following permissions: **${names}**`);

  interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
  return false;
}

module.exports = { requirePerms };
