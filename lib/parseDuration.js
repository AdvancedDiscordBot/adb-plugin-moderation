"use strict";

const MAX_MS = 2419200000; // 28 days

const UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse a human-readable duration string to milliseconds.
 * Accepts: 30s, 1m, 30m, 1h, 12h, 1d, 7d, 28d
 * Returns null if invalid or exceeds 28 days.
 * @param {string} str
 * @returns {number|null}
 */
function parseDuration(str) {
  if (typeof str !== "string") return null;
  const match = str.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (!UNITS[unit]) return null;
  const ms = amount * UNITS[unit];
  if (ms <= 0 || ms > MAX_MS) return null;
  return ms;
}

module.exports = { parseDuration };
