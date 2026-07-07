"use strict";

const { Schema } = require("mongoose");

const CaseSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  caseNumber: { type: Number, required: true },
  type: {
    type: String,
    enum: ["ban", "unban", "kick", "timeout", "untimeout", "warn", "note"],
    required: true,
  },
  targetUserId: { type: String, required: true },
  moderatorId: { type: String, required: true },
  reason: { type: String, default: "No reason provided" },
  duration: { type: String, default: null },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = CaseSchema;
