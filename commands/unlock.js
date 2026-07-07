"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "unlock",
    description: "Unlock a channel (restore @everyone send permission)",
    options: [
      { type: 7, name: "channel", description: "Channel to unlock (defaults to current)", required: false },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageChannels)) return;

    const target = interaction.options.getChannel("channel") || interaction.channel;

    try {
      await target.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null, // Reset to role default
      });
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to unlock channel: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(`${target} has been **unlocked**. Members can send messages again.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
