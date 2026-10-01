"use strict";

const { Schema } = require("mongoose");

module.exports = new Schema({
	_id: { type: String, required: true }, // Guild ID; MongoDB's unique _id index serializes allocation.
	value: { type: Number, required: true, default: 0 },
});
