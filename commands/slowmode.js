"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "slowmode",
    description: "Set slowmode for this channel (0 to disable)",
    options: [
      {
        type: 4,
        name: "seconds",
        description: "Slowmode in seconds (0-21600)",
        required: true,
        min_value: 0,
        max_value: 21600,
      },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageChannels)) return;

    const seconds = interaction.options.getInteger("seconds");
    const channel = interaction.channel;

    try {
      await channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to set slowmode: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setDescription(
        seconds === 0
          ? "Slowmode **disabled** for this channel."
          : `Slowmode set to **${seconds} second(s)** for this channel.`
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
