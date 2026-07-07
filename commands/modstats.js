"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "modstats",
    description: "View moderation statistics for a moderator",
    options: [
      { type: 6, name: "mod", description: "Moderator to check (defaults to yourself)", required: false },
    ],
  },

  async execute(interaction, ctx) {
    if (!requirePerms(interaction, PermissionFlagsBits.ManageGuild)) return;

    const modUser = interaction.options.getUser("mod") || interaction.user;
    const guildId = interaction.guild.id;
    const CaseModel = ctx.models.Case;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const types = ["ban", "unban", "kick", "timeout", "untimeout", "warn", "note"];

    const counts = await Promise.all(
      types.map((type) =>
        CaseModel.countDocuments({
          guildId,
          moderatorId: modUser.id,
          type,
          createdAt: { $gte: startOfMonth },
        })
      )
    );

    const total = counts.reduce((a, b) => a + b, 0);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`Mod Stats — ${modUser.tag}`)
      .setThumbnail(modUser.displayAvatarURL())
      .setDescription(`Actions taken since **<t:${Math.floor(startOfMonth.getTime() / 1000)}:D>**`)
      .addFields(
        types.map((type, i) => ({ name: type.toUpperCase(), value: String(counts[i]), inline: true }))
      )
      .addFields({ name: "Total (this month)", value: String(total), inline: false })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
