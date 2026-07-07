"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "lock",
    description: "Lock a channel (prevent @everyone from sending messages)",
    options: [
      { type: 7, name: "channel", description: "Channel to lock (defaults to current)", required: false },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageChannels)) return;

    const target = interaction.options.getChannel("channel") || interaction.channel;

    try {
      await target.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
      });
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to lock channel: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setDescription(`${target} has been **locked**. Members can no longer send messages.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
