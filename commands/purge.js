"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "purge",
    description: "Bulk-delete messages from this channel",
    options: [
      {
        type: 4,
        name: "amount",
        description: "Number of messages to delete (1-100)",
        required: true,
        min_value: 1,
        max_value: 100,
      },
      { type: 6, name: "user", description: "Only delete messages from this user", required: false },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageMessages)) return;

    const amount = interaction.options.getInteger("amount");
    const filterUser = interaction.options.getUser("user");
    const channel = interaction.channel;

    let messages;
    try {
      messages = await channel.messages.fetch({ limit: 100 });
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to fetch messages: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let filtered = [...messages.values()];

    if (filterUser) {
      filtered = filtered.filter((m) => m.author.id === filterUser.id);
    }

    // Take only the requested amount
    filtered = filtered.slice(0, amount);

    if (filtered.length === 0) {
      const embed = new EmbedBuilder().setColor(0xf39c12).setDescription("No messages to delete.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let deleted;
    try {
      // bulkDelete passes true to filter out messages older than 14 days
      deleted = await channel.bulkDelete(filtered, true);
    } catch (err) {
      const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to delete messages: ${err.message}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setDescription(`Deleted **${deleted.size}** message(s).${filterUser ? ` (filtered to ${filterUser.tag})` : ""}`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
