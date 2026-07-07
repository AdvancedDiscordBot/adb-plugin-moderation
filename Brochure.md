# Basic Moderation

Core moderation commands: ban, kick, timeout, warn, purge, tickets, and case logging.

## Features

- Full moderation action suite with persistent case tracking
- Automated escalation via configurable warn thresholds
- Built-in ticket system with dedicated categories and support roles
- Optional DM notifications to actioned members
- Dedicated moderation log channel

## Commands

| Command | Description |
|---------|-------------|
| `/ban @user [reason]` | Permanently ban a member |
| `/kick @user [reason]` | Kick a member from the server |
| `/timeout @user <duration>` | Temporarily mute a member |
| `/warn @user <reason>` | Issue a formal warning with case log |
| `/case <id>` | View a moderation case |
| `/purge <count>` | Bulk-delete recent messages |
| `/ticket` | Open a support ticket |

## Configuration

| Setting | Description |
|---------|-------------|
| `log_channel_id` | Channel for moderation logs |
| `ticket_category_id` | Category for ticket channels |
| `ticket_support_role_id` | Role that can view and respond to tickets |
| `ticket_log_channel_id` | Channel for ticket transcripts |
| `warn_thresholds` | Auto-action rules triggered at warn counts |
| `dm_on_action` | Notify the member via DM when actioned |

> **Note:** This plugin requires a bot restart after installation.
