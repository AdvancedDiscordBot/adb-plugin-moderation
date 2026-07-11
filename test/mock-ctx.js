"use strict";

/**
 * Mock plugin context for local testing.
 * Mirrors the ADB ctx API contract without requiring a running bot or DB.
 */

const { Schema } = require("mongoose");
const mongoose = require("mongoose");

// Minimal in-memory model factory — wraps a mongoose schema with array-backed persistence
function createInMemoryModel(name, schema) {
  const docs = [];
  let idCounter = 1;

  class FakeDoc {
    constructor(data) {
      Object.assign(this, data);
      if (!this._id) this._id = String(idCounter++);
    }
    async save() {
      const existing = docs.findIndex((d) => d._id === this._id);
      if (existing >= 0) {
        docs[existing] = this;
      } else {
        docs.push(this);
      }
      return this;
    }
    toObject() {
      return { ...this };
    }
  }

  FakeDoc.find = function (query = {}) {
    let results = docs.filter((d) => matchQuery(d, query));
    const chain = {
      sort(by) {
        const [key, dir] = Object.entries(by)[0];
        results.sort((a, b) => {
          const av = new Date(a[key]).getTime();
          const bv = new Date(b[key]).getTime();
          return dir === -1 ? bv - av : av - bv;
        });
        return chain;
      },
      limit(n) {
        results = results.slice(0, n);
        return chain;
      },
      select() { return chain; },
      lean() { return Promise.resolve(results.map((d) => ({ ...d }))); },
      then(resolve) { return Promise.resolve(results.map((d) => ({ ...d }))).then(resolve); },
    };
    return chain;
  };

  FakeDoc.findOne = function (query = {}) {
    const result = docs.find((d) => matchQuery(d, query));
    const chain = {
      sort(by) {
        const matched = docs.filter((d) => matchQuery(d, query));
        const [key, dir] = Object.entries(by)[0];
        matched.sort((a, b) => {
          const av = typeof a[key] === "number" ? a[key] : new Date(a[key]).getTime();
          const bv = typeof b[key] === "number" ? b[key] : new Date(b[key]).getTime();
          return dir === -1 ? bv - av : av - bv;
        });
        const found = matched[0] || null;
        return {
          select() { return { lean: () => Promise.resolve(found ? { ...found } : null) }; },
          lean() { return Promise.resolve(found ? { ...found } : null); },
          then(resolve) { return Promise.resolve(found ? { ...found } : null).then(resolve); },
        };
      },
      select() { return { lean: () => Promise.resolve(result ? { ...result } : null) }; },
      lean() { return Promise.resolve(result ? { ...result } : null); },
      then(resolve) { return Promise.resolve(result ? { ...result } : null).then(resolve); },
    };
    return chain;
  };

  FakeDoc.findOneAndUpdate = async function (query, update, opts) {
    const doc = docs.find((d) => matchQuery(d, query));
    if (doc) {
      Object.assign(doc, update.$set || update);
      return { ...doc };
    }
    if (opts && opts.upsert) {
      const newDoc = new FakeDoc({ ...query, ...(update.$set || update) });
      await newDoc.save();
      return { ...newDoc };
    }
    return null;
  };

  FakeDoc.deleteMany = async function (query) {
    const before = docs.length;
    const toRemove = docs.filter((d) => matchQuery(d, query));
    for (const d of toRemove) {
      const idx = docs.indexOf(d);
      if (idx >= 0) docs.splice(idx, 1);
    }
    return { deletedCount: before - docs.length };
  };

  FakeDoc.countDocuments = async function (query) {
    return docs.filter((d) => matchQuery(d, query)).length;
  };

  FakeDoc._docs = docs; // For test inspection

  return FakeDoc;
}

function matchQuery(doc, query) {
  for (const [key, val] of Object.entries(query)) {
    if (val && typeof val === "object" && ("$gte" in val || "$lte" in val || "$in" in val)) {
      if ("$gte" in val && doc[key] < val.$gte) return false;
      if ("$lte" in val && doc[key] > val.$lte) return false;
      if ("$in" in val && !val.$in.includes(doc[key])) return false;
    } else if (doc[key] !== val) {
      return false;
    }
  }
  return true;
}

// Fake interaction options builder
function buildOptions(data = {}) {
  return {
    getUser(name) { return data[name] || null; },
    getString(name) { return data[name] !== undefined ? data[name] : null; },
    getInteger(name) { return data[name] !== undefined ? parseInt(data[name], 10) : null; },
    getBoolean(name) { return data[name] !== undefined ? Boolean(data[name]) : null; },
    getChannel(name) { return data[name] || null; },
    getMember(name) { return data[name] ? { ...data[name], kickable: true, bannable: true, moderatable: true, timeout: async () => {}, kick: async () => {} } : null; },
    getRole(name) { return data[name] || null; },
    get(name) { return data[name] !== undefined ? { value: data[name] } : null; },
    getSubcommand() { return data._subcommand || null; },
    getSubcommandGroup() { return data._subcommandGroup || null; },
  };
}

// Fake interaction
function buildInteraction(overrides = {}) {
  const guildId = overrides.guildId || "test-guild-123";
  return {
    guild: {
      id: guildId,
      name: "Test Server",
      roles: { everyone: { id: "everyone-role" } },
      members: {
        fetch: async (id) => ({
          id,
          kickable: true,
          bannable: true,
          moderatable: true,
          kick: async () => {},
          timeout: async () => {},
          ban: async () => {},
          permissions: { has: () => true },
        }),
        ban: async () => {},
      },
      bans: { remove: async () => {} },
      channels: { create: async (opts) => ({ id: "new-channel-id", ...opts, send: async () => {}, permissionOverwrites: { edit: async () => {}, delete: async () => {} } }) },
    },
    channel: {
      id: "test-channel-id",
      send: async () => {},
      delete: async () => {},
      bulkDelete: async (msgs) => ({ size: Array.isArray(msgs) ? msgs.length : msgs.size }),
      messages: { fetch: async () => new Map() },
      setRateLimitPerUser: async () => {},
      permissionOverwrites: { edit: async () => {}, delete: async () => {} },
    },
    user: { id: "mod-user-id", tag: "Moderator#0001", displayAvatarURL: () => "" },
    member: { permissions: { has: () => true } },
    options: buildOptions(overrides.options || {}),
    reply: async (data) => { /* no-op */ },
    ...overrides,
  };
}

function createMockCtx() {
  // Inspection collectors — populated by ctx methods, read by the harness.
  // Prefixed `_` and created up-front so they survive the shallow Object.freeze
  // below (freeze blocks reassigning/adding props, but pushing into an existing
  // array / writing into a nested object is still allowed).
  const _models = {};
  const _commands = [];
  const _events = [];

  const ctx = {
    _models,
    _commands,
    _events,

    client: {
      user: { id: "bot-id", tag: "Bot#0000" },
      users: {
        fetch: async (id) => ({ id, tag: `User-${id}#0000`, displayAvatarURL: () => "" }),
      },
      channels: {
        fetch: async (id) => ({
          id,
          isTextBased: () => true,
          send: async () => {},
        }),
      },
    },

    defineModel(name, schema) {
      const model = createInMemoryModel(name, schema);
      _models[name] = model;
      return model;
    },

    registerCommand(cmd) {
      _commands.push(cmd);
    },

    registerEvent(eventName, handler) {
      _events.push({ eventName, handler });
    },

    db: {
      pluginConfigs: new Map(),
      userProfiles: new Map(),

      async getPluginConfig(guildId, pluginName) {
        const key = `${guildId}:${pluginName}`;
        if (!this.pluginConfigs.has(key)) this.pluginConfigs.set(key, { data: {} });
        return this.pluginConfigs.get(key);
      },

      async updatePluginConfig(guildId, pluginName, data) {
        const key = `${guildId}:${pluginName}`;
        const cfg = this.pluginConfigs.get(key) || { data: {} };
        Object.assign(cfg.data, data);
        this.pluginConfigs.set(key, cfg);
      },

      async getUserProfile(userId, guildId) {
        const key = `${userId}:${guildId}`;
        if (!this.userProfiles.has(key)) this.userProfiles.set(key, { warnings: 0, bans: 0, kicks: 0 });
        return this.userProfiles.get(key);
      },

      async updateUserProfile(userId, guildId, data) {
        const key = `${userId}:${guildId}`;
        const profile = this.userProfiles.get(key) || { warnings: 0, bans: 0, kicks: 0 };
        Object.assign(profile, data);
        this.userProfiles.set(key, profile);
      },
    },

    hooks: {
      _handlers: {},
      on(event, handler) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(handler);
      },
    },

    config: { env: "test" },

    logger: {
      info: (...args) => console.log("[INFO]", ...args),
      warn: (...args) => console.warn("[WARN]", ...args),
      error: (...args) => console.error("[ERROR]", ...args),
    },
  };

  // Core (PluginContext.build) freezes the ctx it hands plugins. Mirror that so
  // the harness catches any plugin that tries to mutate ctx (e.g. `ctx.models = …`).
  return Object.freeze(ctx);
}

module.exports = { createMockCtx, buildInteraction, buildOptions };
