# adb-plugin-moderation

Core moderation commands for [Advanced Discord Bot](https://github.com/dead/Advanced-Discord-Bot).

## What it does

- **Actions**: ban, unban, kick, timeout, untimeout, warn
- **Records**: case log, per-member warning history, moderator notes
- **Queries**: case lookup, user history, modstats (monthly breakdown)
- **Utilities**: purge messages, slowmode, lock/unlock channels
- **Tickets**: setup category/role, open/close/add/remove users

All actions create a numbered case and optionally post an embed to a log channel. Warnings can trigger automatic escalation (timeout → kick → ban) at configurable thresholds.

## Requirements

- Node.js 18+
- Advanced Discord Bot with plugin loader
- MongoDB (via ADB's mongoose connection)
- Discord bot with these permissions:
  - Ban Members
  - Kick Members
  - Moderate Members (timeout)
  - Manage Messages (warn, purge, note)
  - Manage Channels (slowmode, lock, ticket channels)
  - Manage Guild (clearwarnings, modstats, ticket setup)

## Installation

Inside your bot directory:

```bash
npm install adb-plugin-moderation
```

Then add the plugin to your ADB config:

```json
{
  "plugins": ["adb-plugin-moderation"]
}
```

Restart the bot. The plugin registers slash commands on load — deploy them to Discord:

```bash
node deploy-commands.js
```

## Configuration

Run `/ticket setup` in your server to configure tickets. All other settings go in the ADB plugin config UI or directly via the database.

| Key | Default | Description |
|---|---|---|
| `log_channel_id` | null | Channel to post case embeds |
| `ticket_category_id` | null | Category for ticket channels |
| `ticket_support_role_id` | null | Role pinged when a ticket opens |
| `ticket_log_channel_id` | null | Channel for ticket transcripts on close |
| `dm_on_action` | true | DM users when actioned |
| `warn_thresholds` | see below | Auto-escalation on warning count |

### Default warn thresholds

```json
{
  "3":  { "action": "timeout", "duration": "1h" },
  "5":  { "action": "timeout", "duration": "24h" },
  "7":  { "action": "kick" },
  "10": { "action": "ban" }
}
```

## Commands

| Command | Permission | Description |
|---|---|---|
| `/ban` | Ban Members | Ban a user |
| `/unban` | Ban Members | Unban by user ID |
| `/kick` | Kick Members | Kick a member |
| `/timeout` | Moderate Members | Timeout (1m–28d) |
| `/untimeout` | Moderate Members | Remove timeout |
| `/warn` | Manage Messages | Issue a warning |
| `/warnings` | Manage Messages | View warnings for a user |
| `/clearwarnings` | Manage Guild | Clear all warnings |
| `/note` | Manage Messages | Add a private mod note |
| `/purge` | Manage Messages | Bulk-delete messages |
| `/slowmode` | Manage Channels | Set channel slowmode |
| `/lock` | Manage Channels | Prevent @everyone from sending |
| `/unlock` | Manage Channels | Restore @everyone send permission |
| `/case` | Manage Messages | Look up a case by number |
| `/history` | Manage Messages | View a user's case history |
| `/modstats` | Manage Guild | View a moderator's monthly stats |
| `/ticket setup` | Manage Guild | Configure the ticket system |
| `/ticket open` | Everyone | Open a support ticket |
| `/ticket close` | Manage Channels | Close and archive a ticket |
| `/ticket add` | Manage Channels | Add a user to a ticket |
| `/ticket remove` | Manage Channels | Remove a user from a ticket |

## Testing

```bash
npm test
```

Runs the local harness — no Discord or MongoDB connection required.

## License

MIT
