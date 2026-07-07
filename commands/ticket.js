"use strict";

const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { requirePerms } = require("../lib/permissions");

module.exports = {
  data: {
    name: "ticket",
    description: "Ticket system management",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "setup",
        description: "Configure the ticket system",
        options: [
          { type: 7, name: "category", description: "Category for ticket channels", required: true },
          { type: 8, name: "support_role", description: "Role pinged when a ticket opens", required: true },
          { type: 7, name: "log_channel", description: "Channel for ticket transcripts", required: false },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "open",
        description: "Open a support ticket",
        options: [
          { type: 3, name: "reason", description: "Reason for opening a ticket", required: false },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "close",
        description: "Close the current ticket",
        options: [],
      },
      {
        type: 1, // SUB_COMMAND
        name: "add",
        description: "Add a user to this ticket",
        options: [
          { type: 6, name: "user", description: "User to add", required: true },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "remove",
        description: "Remove a user from this ticket",
        options: [
          { type: 6, name: "user", description: "User to remove", required: true },
        ],
      },
    ],
  },

  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const TicketModel = ctx.models.Ticket;

    if (sub === "setup") {
      if (!requirePerms(interaction, PermissionFlagsBits.ManageGuild)) return;

      const category = interaction.options.getChannel("category");
      const supportRole = interaction.options.getRole ? interaction.options.getRole("support_role") : null;
      const logChannel = interaction.options.getChannel("log_channel");

      // For raw option access when getRole isn't available (mock environment)
      const supportRoleId = supportRole
        ? supportRole.id
        : interaction.options.get("support_role")?.value || null;

      await ctx.db.updatePluginConfig(guildId, "adb-plugin-moderation", {
        ticket_category_id: category.id,
        ticket_support_role_id: supportRoleId,
        ticket_log_channel_id: logChannel ? logChannel.id : null,
      });

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Ticket System Configured")
        .addFields(
          { name: "Category", value: `${category}`, inline: true },
          { name: "Support Role", value: supportRoleId ? `<@&${supportRoleId}>` : "None", inline: true },
          { name: "Log Channel", value: logChannel ? `${logChannel}` : "None", inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "open") {
      const reason = interaction.options.getString("reason") || "";
      const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

      if (!configData.ticket_category_id) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setDescription("Ticket system is not configured. Ask an admin to run `/ticket setup` first.");
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Check if user already has an open ticket
      const existing = await TicketModel.findOne({
        guildId,
        userId: interaction.user.id,
        status: "open",
      }).lean();

      if (existing) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setDescription(`You already have an open ticket: <#${existing.channelId}>`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      let ticketChannel;
      try {
        ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: configData.ticket_category_id,
          permissionOverwrites: [
            {
              id: interaction.guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            },
            ...(configData.ticket_support_role_id
              ? [
                  {
                    id: configData.ticket_support_role_id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                  },
                ]
              : []),
          ],
        });
      } catch (err) {
        const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to create ticket channel: ${err.message}`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const ticketDoc = new TicketModel({
        guildId,
        channelId: ticketChannel.id,
        userId: interaction.user.id,
        reason,
        status: "open",
      });
      await ticketDoc.save();

      const openEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("Support Ticket Opened")
        .setDescription(`Hello ${interaction.user}, a staff member will be with you shortly.`)
        .addFields(reason ? [{ name: "Reason", value: reason }] : [])
        .setTimestamp();

      const pingContent = configData.ticket_support_role_id
        ? `<@&${configData.ticket_support_role_id}>`
        : null;

      await ticketChannel.send({
        content: pingContent,
        embeds: [openEmbed],
      });

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`Your ticket has been opened: ${ticketChannel}`);

      return interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
    }

    if (sub === "close") {
      if (!requirePerms(interaction, PermissionFlagsBits.ManageChannels)) return;

      const ticketDoc = await TicketModel.findOne({
        guildId,
        channelId: interaction.channel.id,
        status: "open",
      });

      if (!ticketDoc) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setDescription("This channel is not an open ticket.");
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

      // Post transcript to log channel
      if (configData.ticket_log_channel_id) {
        try {
          const logChannel = await ctx.client.channels.fetch(configData.ticket_log_channel_id);
          if (logChannel && logChannel.isTextBased()) {
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const transcript = [...messages.values()]
              .reverse()
              .map((m) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}`)
              .join("\n");

            const logEmbed = new EmbedBuilder()
              .setColor(0x95a5a6)
              .setTitle("Ticket Closed")
              .addFields(
                { name: "Opened by", value: `<@${ticketDoc.userId}>`, inline: true },
                { name: "Closed by", value: `${interaction.user.tag}`, inline: true },
                { name: "Reason", value: ticketDoc.reason || "No reason" }
              )
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });

            if (transcript.length > 0) {
              const truncated = transcript.length > 1900 ? transcript.slice(-1900) + "\n..." : transcript;
              await logChannel.send({ content: `\`\`\`\n${truncated}\n\`\`\`` });
            }
          }
        } catch (err) {
          ctx.logger.warn(`[moderation] Failed to log ticket transcript: ${err.message}`);
        }
      }

      ticketDoc.status = "closed";
      ticketDoc.closedAt = new Date();
      await ticketDoc.save();

      await interaction.reply({ content: "Ticket closed. Deleting channel in 5 seconds...", ephemeral: false });

      setTimeout(() => {
        interaction.channel.delete("Ticket closed").catch(() => {});
      }, 5000);
    }

    if (sub === "add") {
      if (!requirePerms(interaction, PermissionFlagsBits.ManageChannels)) return;

      const user = interaction.options.getUser("user");
      try {
        await interaction.channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
        });
      } catch (err) {
        const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to add user: ${err.message}`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`Added ${user} to this ticket.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "remove") {
      if (!requirePerms(interaction, PermissionFlagsBits.ManageChannels)) return;

      const user = interaction.options.getUser("user");
      try {
        await interaction.channel.permissionOverwrites.delete(user.id);
      } catch (err) {
        const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to remove user: ${err.message}`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setDescription(`Removed ${user} from this ticket.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
