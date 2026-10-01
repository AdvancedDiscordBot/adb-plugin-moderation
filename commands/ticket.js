"use strict";

const { EmbedBuilder, PermissionFlagsBits, ChannelType, OverwriteType } = require("discord.js");
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
          { type: 7, name: "category", description: "Category for ticket channels", required: true, channel_types: [ChannelType.GuildCategory] },
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
    if (!interaction.guild) return interaction.reply({ content: "Tickets can only be used in a server.", ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const TicketModel = ctx.models.Ticket;

    if (sub === "setup") {
      if (!requirePerms(interaction, PermissionFlagsBits.ManageGuild)) return;

      const category = interaction.options.getChannel("category");
      const supportRole = interaction.options.getRole("support_role");
      const logChannel = interaction.options.getChannel("log_channel");

      if (category.type !== ChannelType.GuildCategory) {
        return interaction.editReply({ content: "Choose a category for ticket channels." });
      }
      if (supportRole.id === guildId) {
        return interaction.editReply({ content: "The support role cannot be @everyone; tickets must remain private." });
      }
      const supportRoleId = supportRole.id;

      const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};
      await ctx.db.updatePluginConfig(guildId, "adb-plugin-moderation", {
        ...configData,
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

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "open") {
      const reason = interaction.options.getString("reason") || "";
      const configData = (await ctx.db.getPluginConfig(guildId, "adb-plugin-moderation"))?.data || {};

      if (!configData.ticket_category_id) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setDescription("Ticket system is not configured. Ask an admin to run `/ticket setup` first.");
        return interaction.editReply({ embeds: [embed] });
      }
      if (configData.ticket_support_role_id === guildId) {
        return interaction.editReply({ content: "The support role cannot be @everyone. Ask an admin to correct `/ticket setup`." });
      }

      // Check if user already has an open ticket
      const existing = await TicketModel.findOne({
        guildId,
        userId: interaction.user.id,
        status: "open",
      });

      if (existing) {
        let channel;
        try {
          channel = await interaction.guild.channels.fetch(existing.channelId, { force: true });
        } catch (err) {
          if (err.code !== 10003) return interaction.editReply({ content: `Could not verify your existing ticket: ${err.message}` });
        }
        if (channel) {
          const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setDescription(`You already have an open ticket: <#${existing.channelId}>`);
          return interaction.editReply({ embeds: [embed] });
        }
        existing.status = "closed";
        existing.closedAt = new Date();
        await existing.save();
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
              type: OverwriteType.Role,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id,
              type: OverwriteType.Member,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            },
            {
              id: ctx.client.user.id,
              type: OverwriteType.Member,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
            ...(configData.ticket_support_role_id
              ? [
                  {
                    id: configData.ticket_support_role_id,
                    type: OverwriteType.Role,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                  },
                ]
              : []),
          ],
        });
      } catch (err) {
        const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to create ticket channel: ${err.message}`);
        return interaction.editReply({ embeds: [embed] });
      }

      const ticketDoc = new TicketModel({
        guildId,
        channelId: ticketChannel.id,
        userId: interaction.user.id,
        reason,
        status: "open",
      });
      try {
        await ticketDoc.save();
      } catch (err) {
        let cleanupFailed = false;
        await ticketChannel.delete("Ticket record could not be saved").catch((cleanupError) => {
          cleanupFailed = true;
          ctx.logger.error(`[moderation] Failed to clean up ticket channel ${ticketChannel.id}: ${cleanupError.message}`);
        });
        return interaction.editReply({ content: `Could not save ticket: ${err.message}.${cleanupFailed ? ` Remove channel <#${ticketChannel.id}> manually.` : " The new channel was removed."}` });
      }

      const openEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("Support Ticket Opened")
        .setDescription(`Hello ${interaction.user}, a staff member will be with you shortly.`)
        .addFields(reason ? [{ name: "Reason", value: reason.slice(0, 1024) }] : [])
        .setTimestamp();

      const pingContent = configData.ticket_support_role_id
        ? `<@&${configData.ticket_support_role_id}>`
        : null;

      let welcomeFailed = false;
      await ticketChannel.send({
        content: pingContent,
        embeds: [openEmbed],
        allowedMentions: { parse: [], roles: configData.ticket_support_role_id ? [configData.ticket_support_role_id] : [] },
      }).catch((err) => {
        welcomeFailed = true;
        ctx.logger.warn(`[moderation] Could not send ticket welcome: ${err.message}`);
      });

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`Your ticket has been opened: ${ticketChannel}${welcomeFailed ? ". The welcome message could not be sent; ask staff to check my channel permissions." : ""}`);

      return interaction.editReply({ embeds: [confirmEmbed] });
    }

    let ticketDoc;
    if (["close", "add", "remove"].includes(sub)) {
      if (!requirePerms(interaction, PermissionFlagsBits.ManageChannels)) return;

      ticketDoc = await TicketModel.findOne({
        guildId,
        channelId: interaction.channel.id,
        status: "open",
      });

      if (!ticketDoc) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setDescription("This channel is not an open ticket.");
        return interaction.editReply({ embeds: [embed] });
      }
    }

    if (sub === "close") {
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
              .setTitle("Ticket Transcript")
              .addFields(
                { name: "Opened by", value: `<@${ticketDoc.userId}>`, inline: true },
                { name: "Closure requested by", value: `${interaction.user.tag}`, inline: true },
                { name: "Reason", value: (ticketDoc.reason || "No reason").slice(0, 1024) }
              )
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });

            if (transcript.length > 0) {
              const truncated = transcript.length > 1900 ? transcript.slice(-1900) + "\n..." : transcript;
              await logChannel.send({ content: `\`\`\`\n${truncated}\n\`\`\``, allowedMentions: { parse: [] } });
            }
          }
        } catch (err) {
          ctx.logger.warn(`[moderation] Failed to log ticket transcript: ${err.message}`);
        }
      }

      await interaction.editReply({ content: "Closing ticket. Deleting channel in 5 seconds..." });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        await interaction.channel.delete("Ticket closed");
      } catch (err) {
        return interaction.editReply({ content: `Failed to delete ticket channel: ${err.message}. The ticket remains open; you can retry closing it.` });
      }
      ticketDoc.status = "closed";
      ticketDoc.closedAt = new Date();
      try {
        await ticketDoc.save();
      } catch (err) {
        ctx.logger.error(`[moderation] Ticket channel ${ticketDoc.channelId} was deleted, but saving its closure failed: ${err.message}`);
        await interaction.editReply({ content: "Channel deleted, but saving the ticket closure failed. Staff should check the ticket record." }).catch(() => {});
      }
    }

    if (sub === "add") {
      const user = interaction.options.getUser("user");
      try {
        await interaction.channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
        }, { type: OverwriteType.Member });
      } catch (err) {
        const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to add user: ${err.message}`);
        return interaction.editReply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`Added ${user} to this ticket.`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "remove") {
      const user = interaction.options.getUser("user");
      if (user.id === ctx.client.user.id) {
        return interaction.editReply({ content: "You cannot remove the bot's access to its ticket channel." });
      }
      try {
        await interaction.channel.permissionOverwrites.edit(user.id, {
          ViewChannel: false,
          SendMessages: false,
        }, { type: OverwriteType.Member });
      } catch (err) {
        const embed = new EmbedBuilder().setColor(0xe74c3c).setDescription(`Failed to remove user: ${err.message}`);
        return interaction.editReply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setDescription(`Removed ${user} from this ticket.`);
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
