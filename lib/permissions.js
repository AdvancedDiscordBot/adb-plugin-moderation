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
  if (!interaction.guild) {
    interaction[interaction.deferred ? "editReply" : "reply"]({ content: "This command can only be used in a server.", ephemeral: true }).catch(() => {});
    return false;
  }
  const missing = perms.filter((p) => !interaction.memberPermissions?.has(p));
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

  interaction[interaction.deferred ? "editReply" : "reply"]({ embeds: [embed], ephemeral: true }).catch(() => {});
  return false;
}

async function requireHierarchy(interaction, target) {
	let error;
	if (target.id === interaction.user.id) error = "You cannot moderate yourself.";
	else if (target.id === interaction.guild.ownerId) error = "You cannot moderate the server owner.";
	else if (target.roles && interaction.user.id !== interaction.guild.ownerId) {
		const moderator = interaction.member?.roles?.highest ? interaction.member
			: await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
		if (!moderator?.roles?.highest || !target.roles.highest) error = "Could not verify role hierarchy.";
		else if (moderator.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
			error = "You cannot moderate a member with an equal or higher role than yours.";
		}
	}
	if (!error) return true;
	await interaction[interaction.deferred ? "editReply" : "reply"]({
		embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(error)], ephemeral: true,
	});
	return false;
}

module.exports = { requirePerms, requireHierarchy };
