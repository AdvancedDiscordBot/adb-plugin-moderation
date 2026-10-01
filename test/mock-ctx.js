"use strict";

/**
 * Mock plugin context for local testing.
 * Mirrors the ADB ctx API contract without requiring a running bot or DB.
 */

const mongoose = require("mongoose");
const { PermissionsBitField } = require("discord.js");

// Minimal in-memory model factory — wraps a mongoose schema with array-backed persistence
function createInMemoryModel(name, schema) {
  const docs = [];
  const FakeDoc = new mongoose.Mongoose().model(name, schema);

  function persist(doc) {
    const error = doc.validateSync();
    if (error) throw error;
    for (const [keys, options] of schema.indexes()) {
      if (options.unique && docs.some((other) => String(other._id) !== String(doc._id) &&
        Object.keys(keys).every((key) => other[key] === doc[key]))) {
        throw Object.assign(new Error("Duplicate key"), { code: 11000 });
      }
    }
    const existing = docs.findIndex((d) => String(d._id) === String(doc._id));
    const data = doc.toObject();
    if (existing >= 0) docs[existing] = data;
    else docs.push(data);
  }
  FakeDoc.prototype.save = async function () {
    await this.validate();
    persist(this);
    return this;
  };

  function queryBuilder(query, single = false) {
    let sort = null;
    let limit = null;
    let lean = false;
    const chain = {
      sort(by) { sort = by; return chain; },
      limit(n) { limit = n; return chain; },
      select() { return chain; },
      lean() { lean = true; return chain; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          let results = docs.filter((d) => matchQuery(d, query));
          if (sort) {
            const [key, direction] = Object.entries(sort)[0];
            results.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * direction);
          }
          if (limit !== null) results = results.slice(0, limit);
          results = results.map((d) => lean ? new FakeDoc(d).toObject() : new FakeDoc(d));
          return single ? results[0] || null : results;
        }).then(resolve, reject);
      },
      catch(reject) { return chain.then((value) => value, reject); },
    };
    return chain;
  }
  FakeDoc.find = (query = {}) => queryBuilder(query);
  FakeDoc.findOne = (query = {}) => queryBuilder(query, true);

  FakeDoc.findOneAndUpdate = async function (query, update, opts = {}) {
    const previous = docs.find((d) => matchQuery(d, query));
    if (!previous && !opts.upsert) return null;
    const doc = new FakeDoc(previous || { ...query, ...update.$setOnInsert });
    if (update.$set) doc.set(update.$set);
    if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) doc[key] = (doc[key] || 0) + value;
    for (const [key, value] of Object.entries(update)) if (!key.startsWith("$")) doc[key] = value;
    persist(doc); // An atomic update does not yield between reading and writing.
    return opts.new ? doc : previous ? new FakeDoc(previous) : null;
  };
  FakeDoc.updateOne = async (query, update, opts = {}) => {
    const doc = await FakeDoc.findOneAndUpdate(query, update, { ...opts, new: true });
    return { acknowledged: true, matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
  };
  FakeDoc.create = async (data) => new FakeDoc(data).save();

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
    } else if (key === "_id" ? String(doc[key]) !== String(val) : doc[key] !== val) {
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
  const replies = [];
  const role = (position) => ({ position, comparePositionTo(other) { return position - other.position; } });
  const interaction = {
    guildId,
    channelId: "test-channel-id",
    guild: {
      id: guildId,
      name: "Test Server",
      ownerId: "owner-id",
      roles: { everyone: { id: "everyone-role" } },
      members: {
        me: { id: "bot-id", permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: role(100) } },
        fetch: async (id) => ({
          id,
          roles: { highest: role(10) },
          kickable: true,
          bannable: true,
          moderatable: true,
          kick: async () => {},
          timeout: async () => {},
          ban: async () => {},
          permissions: new PermissionsBitField(),
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
    member: { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: role(50) } },
    memberPermissions: new PermissionsBitField(PermissionsBitField.All),
    options: buildOptions(overrides.options || {}),
    deferred: false,
    replied: false,
    replies,
    reply: async (data) => {
      if (interaction.deferred || interaction.replied) throw new Error("Interaction already acknowledged");
      interaction.replied = true;
      replies.push(data);
    },
    deferReply: async () => {
      if (interaction.deferred || interaction.replied) throw new Error("Interaction already acknowledged");
      interaction.deferred = true;
    },
    editReply: async (data) => {
      if (!interaction.deferred && !interaction.replied) throw new Error("Interaction not acknowledged");
      replies.push(data);
    },
    ...overrides,
  };
  return interaction;
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
    models: null,

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
      if (_models[name]) return _models[name];
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
        return structuredClone(this.pluginConfigs.get(key));
      },

      async updatePluginConfig(guildId, pluginName, data) {
        const key = `${guildId}:${pluginName}`;
        const cfg = structuredClone({ guildId, pluginName, data });
        this.pluginConfigs.set(key, cfg);
        return cfg;
      },

      async getUserProfile(userId, guildId) {
        const key = `${userId}:${guildId}`;
        if (!this.userProfiles.has(key)) this.userProfiles.set(key, { warnings: 0, bans: 0, kicks: 0 });
        return structuredClone(this.userProfiles.get(key));
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

  for (const key of Object.keys(ctx)) {
    Object.defineProperty(ctx, key, { writable: key === "models", configurable: false });
  }
  return Object.preventExtensions(ctx);
}

module.exports = { createMockCtx, buildInteraction, buildOptions };
