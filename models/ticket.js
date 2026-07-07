"use strict";

const { Schema } = require("mongoose");

const TicketSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  reason: { type: String, default: "" },
  status: { type: String, enum: ["open", "closed"], default: "open" },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
});

module.exports = TicketSchema;
