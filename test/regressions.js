"use strict";

const assert = require("node:assert/strict");
const { Collection, PermissionFlagsBits: P, PermissionsBitField, ChannelType, OverwriteType } = require("discord.js");
const { createMockCtx, buildInteraction, buildOptions } = require("./mock-ctx");
const { load } = require("../index");

const target = { id: "123456789012345678", tag: "Target#0001", username: "target", displayAvatarURL: () => "https://example.com/avatar.png" };

module.exports = async function runRegressions() {
	let passed = 0;
	let failed = 0;
	async function test(name, fn) {
		try {
			await fn();
			passed++;
			console.log(`  PASS  ${name}`);
		} catch (error) {
			failed++;
			console.error(`  FAIL  ${name}`, error);
		}
	}
	async function setup() {
		const ctx = createMockCtx();
		await load(ctx);
		const command = (name) => ctx._commands.findLast((cmd) => cmd.data.name === name);
		const interaction = (options = {}, overrides = {}) => {
			const i = buildInteraction(overrides);
			i.options = buildOptions(options);
			return i;
		};
		const execute = async (name, i) => {
			await command(name).execute(i, ctx.client); // The real second argument is the client, not ctx.
			for (const reply of i.replies) for (const embed of reply?.embeds || []) embed.toJSON();
			return JSON.stringify(i.replies);
		};
		return { ctx, command, interaction, execute };
	}

	async function tickets() {
		const h = await setup();
		const i = h.interaction({ _subcommand: "open", reason: "help" });
		const channels = new Map();
		const created = [];
		const accessEdits = [];
		let creationError = null;
		const category = { id: "category", type: ChannelType.GuildCategory };
		channels.set(category.id, category);
		i.guild.channels = {
			fetch: async (id) => channels.get(id) || null,
			create: async (options) => {
				if (creationError) throw creationError;
				const channel = {
					id: `ticket-${created.length + 1}`, options, deleted: false,
					isTextBased: () => true, toString() { return `<#${this.id}>`; },
					messages: { fetch: async () => new Collection() },
					send: async (payload) => { for (const embed of payload.embeds || []) embed.toJSON(); },
					delete: async () => { channel.deleted = true; channels.delete(channel.id); },
					permissionOverwrites: {
						edit: async (id, patch) => { accessEdits.push({ id, patch }); },
						delete: async (id) => { accessEdits.push({ id, deleted: true }); },
					},
				};
				created.push(channel);
				channels.set(channel.id, channel);
				return channel;
			},
		};
		await h.ctx.db.updatePluginConfig(i.guild.id, "adb-plugin-moderation", {
			ticket_category_id: category.id, ticket_support_role_id: "support-role", dm_on_action: false,
		});
		const inChannel = (sub, channel = created[0], user = target) => {
			const result = h.interaction({ _subcommand: sub, user });
			result.guild = i.guild;
			result.channel = channel;
			result.channelId = channel?.id;
			return result;
		};
		return { ...h, i, channels, created, accessEdits, inChannel, category,
			failCreation: (error) => { creationError = error; } };
	}

	async function immediateTimers(fn) {
		const original = global.setTimeout;
		global.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
		try { return await fn(); } finally { global.setTimeout = original; }
	}

	await test("permission checks use resolved channel permissions and deny missing guild context", async () => {
		const h = await setup();
		const denied = h.interaction({ user: target, reason: "reason" }, { memberPermissions: new PermissionsBitField() });
		assert.match(await h.execute("warn", denied), /Missing Permissions/);
		assert.equal(h.ctx._models.Case._docs.length, 0);
		const dm = h.interaction({ user: target, reason: "reason" }, { guild: null, guildId: null, member: null, memberPermissions: null });
		assert.match(await h.execute("warn", dm), /server|guild|permission/i);
	});

	await test("uncached API members with string permissions can use resolved interaction permissions", async () => {
		const h = await setup();
		const i = h.interaction({ id: 99 }, { member: { permissions: "8192", roles: [] }, memberPermissions: new PermissionsBitField(P.ManageMessages) });
		assert.match(await h.execute("case", i), /not found/);
	});

	await test("ban, kick, timeout, untimeout and warn respect the invoking moderator's hierarchy", async () => {
		for (const name of ["ban", "kick", "timeout", "untimeout", "warn"]) {
			for (const position of [50, 60]) {
				const h = await setup();
				const i = h.interaction({ user: target, reason: "reason", duration: "1h" });
				const member = await i.guild.members.fetch(target.id);
				member.roles.highest.position = position;
				i.guild.members.fetch = async () => member;
				assert.match(await h.execute(name, i), /hierarchy|higher|equal/i, name);
				assert.equal(h.ctx._models.Case._docs.length, 0, `${name} must not create a case`);
			}
		}
	});

	await test("self and owner moderation is rejected even when the bot could act", async () => {
		for (const whom of ["mod-user-id", "owner-id"]) {
			const h = await setup();
			const i = h.interaction({ user: { ...target, id: whom }, reason: "reason" });
			assert.match(await h.execute("ban", i), /yourself|owner/i);
			assert.equal(h.ctx._models.Case._docs.length, 0);
		}
	});

	await test("guild owner bypasses caller hierarchy but never the bot's hierarchy", async () => {
		const h = await setup();
		for (const kickable of [true, false]) {
			const i = h.interaction({ user: target, reason: "reason" }, { user: { id: "owner-id", tag: "Owner#0001" } });
			const member = await i.guild.members.fetch(target.id);
			member.roles.highest.position = 60;
			member.kickable = kickable;
			i.guild.members.fetch = async () => member;
			const reply = await h.execute("kick", i);
			assert.match(reply, kickable ? /Kicked/ : /cannot kick/);
		}
		assert.equal(h.ctx._models.Case._docs.length, 1);
	});

	await test("transient member lookup failure never becomes a hierarchy-bypassing ban", async () => {
		const h = await setup();
		const i = h.interaction({ user: target, reason: "reason" });
		let banned = false;
		i.guild.members.fetch = async () => { throw new Error("Discord unavailable"); };
		i.guild.members.ban = async () => { banned = true; };
		assert.match(await h.execute("ban", i), /failed|could not|unable/i);
		assert.equal(banned, false);
	});

	await test("confirmed non-members can still be banned", async () => {
		const h = await setup();
		const i = h.interaction({ user: target, reason: "reason" });
		i.guild.members.fetch = async () => { throw Object.assign(new Error("Unknown Member"), { code: 10007 }); };
		assert.match(await h.execute("ban", i), /Banned/);
		assert.equal(h.ctx._models.Case._docs[0].targetUserId, target.id);
	});

	await test("case allocation is unique under concurrent registered commands and seeds existing records", async () => {
		const h = await setup();
		const guildId = h.interaction().guild.id;
		await h.ctx._models.Case.create({ guildId, caseNumber: 40, type: "note", targetUserId: target.id, moderatorId: "old-mod" });
		await Promise.all(Array.from({ length: 12 }, (_, index) => h.execute("note", h.interaction({ user: target, text: `note ${index}` }))));
		assert.deepEqual(h.ctx._models.Case._docs.map((doc) => doc.caseNumber).sort((a, b) => a - b), Array.from({ length: 13 }, (_, index) => index + 40));
		const other = h.interaction({ user: target, text: "other guild" }, { guildId: "another-guild" });
		await h.execute("note", other);
		assert.equal(h.ctx._models.Case._docs.find((doc) => doc.guildId === "another-guild").caseNumber, 1);
	});

	await test("clearing the last warning never reuses its case number, including after reload", async () => {
		const h = await setup();
		await h.execute("warn", h.interaction({ user: target, reason: "reason" }));
		const first = h.ctx._models.Case._docs[0].caseNumber;
		await h.execute("clearwarnings", h.interaction({ user: target }));
		await load(h.ctx);
		await h.execute("note", h.interaction({ user: target, text: "next" }));
		assert.equal(h.ctx._models.Case._docs[0].caseNumber, first + 1);
	});

	await test("clearing legacy warnings seeds the counter before deleting the old high-water mark", async () => {
		const h = await setup();
		const guildId = h.interaction().guild.id;
		await h.ctx._models.Case.create({ guildId, caseNumber: 40, type: "warn", targetUserId: target.id, moderatorId: "old-mod" });
		await h.execute("clearwarnings", h.interaction({ user: target }));
		await h.execute("note", h.interaction({ user: target, text: "next" }));
		assert.equal(h.ctx._models.Case._docs[0].caseNumber, 41);
	});

	await test("concurrent warning writes keep the numeric core counter and fire each threshold once", async () => {
		const h = await setup();
		const guildId = h.interaction().guild.id;
		await h.ctx.db.updatePluginConfig(guildId, "adb-plugin-moderation", { dm_on_action: false, warn_thresholds: { "2": { action: "timeout", duration: "1m" } } });
		const timeouts = [];
		const dms = [];
		h.ctx.client.users.fetch = async (id) => ({ id, tag: "User#0001", send: async (payload) => dms.push(payload) });
		await Promise.all(Array.from({ length: 4 }, () => {
			const i = h.interaction({ user: target, reason: "reason" });
			const originalFetch = i.guild.members.fetch;
			i.guild.members.fetch = async (id) => ({ ...await originalFetch(id), timeout: async (ms) => timeouts.push(ms) });
			return h.execute("warn", i);
		}));
		assert.equal((await h.ctx.db.getUserProfile(target.id, guildId)).warnings, 4);
		assert.deepEqual(timeouts, [60000]);
		assert.equal(dms.length, 0, "dm_on_action=false also applies to threshold actions");
	});

	await test("a rejected write does not poison the per-member command queue", async () => {
		const h = await setup();
		const save = h.ctx._models.Case.prototype.save;
		let reject = true;
		h.ctx._models.Case.prototype.save = async function () {
			if (reject) { reject = false; throw new Error("DB write failed"); }
			return save.call(this);
		};
		await assert.rejects(h.execute("warn", h.interaction({ user: target, reason: "first" })), /DB write failed/);
		await h.execute("warn", h.interaction({ user: target, reason: "second" }));
		assert.equal(h.ctx._models.Case._docs.length, 1);
		assert.equal((await h.ctx.db.getUserProfile(target.id, h.interaction().guild.id)).warnings, 1);
	});

	await test("unban tolerates an unresolvable user but never logs a rejected Discord deletion", async () => {
		const h = await setup();
		h.ctx.client.users.fetch = async () => { throw new Error("Unknown User"); };
		const valid = h.interaction({ user_id: target.id });
		valid.guild.bans.remove = async () => null;
		assert.match(await h.execute("unban", valid), /Unbanned/);
		const failed = h.interaction({ user_id: "123456789012345679" });
		failed.guild.bans.remove = async () => { throw Object.assign(new Error("Unknown Ban"), { code: 10026 }); };
		assert.match(await h.execute("unban", failed), /Failed to unban/);
		assert.equal(h.ctx._models.Case._docs.length, 1);
		const lookup = h.interaction({ id: h.ctx._models.Case._docs[0].caseNumber });
		assert.match(await h.execute("case", lookup), new RegExp(target.id));
		assert.match(await h.execute("case", h.interaction({ id: 1 }, { guildId: "another-guild" })), /not found/);
	});

	await test("invalid unban IDs are rejected before any Discord or case writes", async () => {
		const h = await setup();
		const i = h.interaction({ user_id: "not-a-user-id" });
		let requested = false;
		i.guild.bans.remove = async () => { requested = true; };
		assert.match(await h.execute("unban", i), /valid.*ID/i);
		assert.equal(requested, false);
		assert.equal(h.ctx._models.Case._docs.length, 0);
	});

	await test("case lookup can render old long reasons without exceeding embed field limits", async () => {
		const h = await setup();
		const i = h.interaction({ id: 1 });
		await h.ctx._models.Case.create({ guildId: i.guild.id, caseNumber: 1, type: "warn", targetUserId: target.id, moderatorId: "mod", reason: "x".repeat(2000) });
		await h.execute("case", i);
		assert.ok(i.replies[0].embeds[0].data.fields.find((field) => field.name === "Reason").value.length <= 1024);
	});

	await test("long warnings and notes remain stored but fit Discord response and history limits", async () => {
		const h = await setup();
		const text = "x".repeat(2000);
		for (const name of ["warn", "note", "note"]) {
			await h.execute(name, h.interaction({ user: target, reason: text, text }));
		}
		assert.ok(h.ctx._models.Case._docs.every((doc) => doc.reason === text));
		await h.execute("history", h.interaction({ user: target }));
		for (let n = 0; n < 2; n++) await h.execute("warn", h.interaction({ user: target, reason: text }));
		await h.execute("warnings", h.interaction({ user: target }));
	});

	await test("timeout, untimeout and record queries use the models injected by load", async () => {
		const h = await setup();
		const applied = [];
		for (const name of ["timeout", "untimeout"]) {
			const i = h.interaction({ user: target, duration: "1h", reason: "reason" });
			const fetch = i.guild.members.fetch;
			i.guild.members.fetch = async (id) => ({ ...await fetch(id), timeout: async (duration) => applied.push(duration) });
			await h.execute(name, i);
		}
		assert.deepEqual(applied, [3600000, null]);
		assert.deepEqual(h.ctx._models.Case._docs.map((doc) => doc.type), ["timeout", "untimeout"]);
		await h.execute("history", h.interaction({ user: target }));
		const stats = h.interaction({ mod: { ...target, id: "mod-user-id" } });
		await h.execute("modstats", stats);
		assert.equal(stats.replies[0].embeds[0].data.fields.find((field) => field.name === "Total (this month)").value, "2");
	});

	await test("authorized channel commands retain their existing lock, unlock and slowmode operations", async () => {
		const h = await setup();
		const edits = [];
		for (const name of ["lock", "unlock", "slowmode"]) {
			const i = h.interaction({ seconds: 30 });
			i.channel.permissionsFor = () => new PermissionsBitField(P.ManageChannels);
			i.channel.permissionOverwrites.edit = async (_, patch) => edits.push(patch);
			i.channel.setRateLimitPerUser = async (seconds) => edits.push(seconds);
			await h.execute(name, i);
		}
		assert.deepEqual(edits, [{ SendMessages: false }, { SendMessages: null }, 30]);
	});

	await test("purge filters by author, skips old messages, and reports deletion failures truthfully", async () => {
		const h = await setup();
		const i = h.interaction({ amount: 2, user: target });
		const messages = new Collection([
			["1", { id: "1", author: target, createdTimestamp: Date.now() }],
			["2", { id: "2", author: { id: "other" }, createdTimestamp: Date.now() }],
			["3", { id: "3", author: target, createdTimestamp: 0 }],
		]);
		i.channel.messages.fetch = async () => messages;
		i.channel.bulkDelete = async (selected, filterOld) => {
			assert.equal(filterOld, true);
			assert.deepEqual(selected.map((m) => m.id), ["1", "3"]);
			return new Collection(selected.filter((m) => m.createdTimestamp > 0).map((m) => [m.id, m]));
		};
		assert.match(await h.execute("purge", i), /Deleted \*\*1\*\*/);
		const fail = h.interaction({ amount: 2 });
		fail.channel.messages.fetch = async () => messages;
		fail.channel.bulkDelete = async () => { throw new Error("Missing Permissions"); };
		assert.match(await h.execute("purge", fail), /Failed to delete messages/);
	});

	await test("lock and unlock check permissions in the selected channel, not just the command channel", async () => {
		const h = await setup();
		for (const name of ["lock", "unlock"]) {
			let edited = false;
			const channel = { id: "private", permissionsFor: () => new PermissionsBitField(), permissionOverwrites: { edit: async () => { edited = true; } } };
			assert.match(await h.execute(name, h.interaction({ channel })), /permission/i);
			assert.equal(edited, false);
		}
	});

	await test("ticket setup preserves unrelated config and rejects non-categories and @everyone access", async () => {
		const h = await tickets();
		const setupOptions = { _subcommand: "setup", category: h.category, support_role: { id: "support-role" } };
		await h.ctx.db.updatePluginConfig(h.i.guild.id, "adb-plugin-moderation", { dm_on_action: false, log_channel_id: "moderation-log", warn_thresholds: { "4": { action: "kick" } } });
		await h.execute("ticket", h.interaction(setupOptions));
		const config = (await h.ctx.db.getPluginConfig(h.i.guild.id, "adb-plugin-moderation")).data;
		assert.equal(config.dm_on_action, false);
		assert.equal(config.log_channel_id, "moderation-log");
		assert.deepEqual(config.warn_thresholds, { "4": { action: "kick" } });
		assert.match(await h.execute("ticket", h.interaction({ ...setupOptions, category: { id: "chat", type: ChannelType.GuildText } })), /category/i);
		assert.equal((await h.ctx.db.getPluginConfig(h.i.guild.id, "adb-plugin-moderation")).data.ticket_category_id, h.category.id);
		assert.match(await h.execute("ticket", h.interaction({ ...setupOptions, support_role: { id: h.i.guild.id } })), /everyone|private/i);
		assert.equal((await h.ctx.db.getPluginConfig(h.i.guild.id, "adb-plugin-moderation")).data.ticket_support_role_id, "support-role");
	});

	await test("uncached guild tickets return a server-context error without double acknowledging", async () => {
		const h = await setup();
		const i = h.interaction({ _subcommand: "open" }, { guild: null });
		assert.match(await h.execute("ticket", i), /server/);
	});

	await test("new tickets are private but explicitly accessible by the non-admin bot", async () => {
		const h = await tickets();
		assert.match(await h.execute("ticket", h.i), /opened/);
		const overwrites = h.created[0].options.permissionOverwrites;
		const bot = overwrites.find((overwrite) => overwrite.id === h.ctx.client.user.id);
		assert.ok(bot, "the bot needs its own View Channel allow");
		assert.equal(bot.type, OverwriteType.Member);
		assert.ok(new PermissionsBitField(bot.allow).has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory]));
		assert.ok(new PermissionsBitField(overwrites[0].deny).has(P.ViewChannel));
		assert.equal(h.ctx._models.Ticket._docs.length, 1);
		assert.equal(h.i.deferred, true, "channel creation needs an early interaction acknowledgement");
	});

	await test("concurrent ticket opens create only one channel and one record", async () => {
		const h = await tickets();
		const second = h.interaction({ _subcommand: "open" });
		second.guild = h.i.guild;
		await Promise.all([h.execute("ticket", h.i), h.execute("ticket", second)]);
		assert.equal(h.created.length, 1);
		assert.equal(h.ctx._models.Ticket._docs.length, 1);
		assert.match(JSON.stringify([h.i.replies, second.replies]), /already have an open ticket/);
	});

	await test("ticket creation and persistence failures do not leave untracked live channels", async () => {
		const h = await tickets();
		h.failCreation(new Error("Missing Permissions"));
		assert.match(await h.execute("ticket", h.i), /Failed to create/);
		assert.equal(h.ctx._models.Ticket._docs.length, 0);
		h.failCreation(null);
		h.ctx._models.Ticket.prototype.save = async () => { throw new Error("DB write failed"); };
		const retry = h.inChannel("open");
		assert.match(await h.execute("ticket", retry), /failed|could not/i);
		assert.equal(h.created[0].deleted, true);
		assert.equal(h.ctx._models.Ticket._docs.length, 0);
	});

	await test("stale tickets whose channels were deleted can be reopened", async () => {
		const h = await tickets();
		await h.ctx._models.Ticket.create({ guildId: h.i.guild.id, userId: h.i.user.id, channelId: "deleted-channel" });
		assert.match(await h.execute("ticket", h.i), /opened/);
		assert.equal(h.created.length, 1);
		assert.equal(h.ctx._models.Ticket._docs.filter((doc) => doc.status === "open").length, 1);
	});

	await test("ticket add and remove never edit ordinary channels or another guild's tickets", async () => {
		const h = await tickets();
		await h.ctx._models.Ticket.create({ guildId: "other-guild", userId: "other", channelId: h.i.channel.id });
		for (const sub of ["add", "remove"]) {
			let edited = false;
			const i = h.inChannel(sub, h.i.channel);
			i.channel.permissionOverwrites.edit = i.channel.permissionOverwrites.delete = async () => { edited = true; };
			assert.match(await h.execute("ticket", i), /not an open ticket/);
			assert.equal(edited, false);
		}
	});

	await test("removing ticket access denies inherited role access rather than deleting the overwrite", async () => {
		const h = await tickets();
		await h.execute("ticket", h.i);
		await h.execute("ticket", h.inChannel("add"));
		await h.execute("ticket", h.inChannel("remove"));
		assert.deepEqual(h.accessEdits.at(-1), { id: target.id, patch: { ViewChannel: false, SendMessages: false } });
		const count = h.accessEdits.length;
		assert.match(await h.execute("ticket", h.inChannel("remove", h.created[0], h.ctx.client.user)), /cannot|bot/i);
		assert.equal(h.accessEdits.length, count);
	});

	await test("ticket close persists only after successful channel deletion and allows failed deletion retry", async () => {
		const h = await tickets();
		await h.execute("ticket", h.i);
		const channel = h.created[0];
		const remove = channel.delete;
		channel.delete = async () => { throw new Error("Missing Permissions"); };
		const fail = h.inChannel("close");
		assert.match(await immediateTimers(() => h.execute("ticket", fail)), /Failed to delete|could not delete/i);
		assert.equal(h.ctx._models.Ticket._docs[0].status, "open");
		assert.equal(h.ctx._models.Ticket._docs[0].closedAt, null);
		channel.delete = async () => {
			assert.equal(h.ctx._models.Ticket._docs[0].status, "open", "record must remain open until Discord confirms deletion");
			await remove();
		};
		await immediateTimers(() => h.execute("ticket", h.inChannel("close")));
		assert.equal(channel.deleted, true);
		assert.equal(h.ctx._models.Ticket._docs[0].status, "closed");
		assert.ok(h.ctx._models.Ticket._docs[0].closedAt instanceof Date);
	});

	await test("manifest discloses permission overwrite edits, message history and shared profile access", async () => {
		const manifest = require("../plugin.json");
		for (const name of ["ManageRoles", "ReadMessageHistory", "ViewChannel", "SendMessages", "EmbedLinks"]) {
			assert.ok(manifest.permissions.discord.includes(name), name);
			assert.ok(manifest.capabilities.discord.includes(name), name);
			assert.ok(manifest.discordPermissions.includes(name), name);
		}
		for (const name of ["read-profiles", "write-profiles"]) {
			assert.ok(manifest.permissions.storage.includes(name), name);
			assert.ok(manifest.capabilities.storage.includes(name), name);
		}
	});

	console.log(`Moderation regressions: ${passed} passed, ${failed} failed`);
	return { passed, failed };
};
