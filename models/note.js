"use strict";

const { Schema } = require("mongoose");

const NoteSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  moderatorId: { type: String, required: true },
  note: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = NoteSchema;
