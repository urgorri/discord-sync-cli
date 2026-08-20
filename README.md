# discord-sync-cli

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](tests/)

A lightweight, native CLI tool to export, manage, and synchronize Discord server structures (roles, categories, channels, permissions, and initial messages) declaratively using local JSON configuration files (`server.json`).

Treat your Discord server structure as **Infrastructure as Code** (IaC).

> [!CAUTION]
> **⚠️ Intended Use & Safety Disclaimer:**
> - This tool is primarily designed for **bootstrapping, provisioning, and setting up the baseline architecture** of fresh, unpopulated Discord servers, template instances, or staging environments.
> - Running `push` synchronizes the server to match your `server.json`. Any channels or custom roles currently on the Discord server that are **NOT defined in your JSON file will be permanently deleted**.
> - If you pass `-c / --clean-messages`, all existing message histories in the affected channels will be purged.
> - **Always run with `-d` / `--dry-run` first** to preview planned diffs before applying changes to an active server with existing members!

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
  - [Option 1: Direct in Project Root (Recommended)](#option-1-direct-in-project-root-recommended)
  - [Option 2: Global CLI Installation (Optional)](#option-2-global-cli-installation-optional)
- [Discord Bot Setup](#discord-bot-setup)
  - [1. Create Application & Bot](#1-create-application--bot)
  - [2. Enable Gateway Intents](#2-enable-gateway-intents)
  - [3. Invite Bot with Administrator Permissions](#3-invite-bot-with-administrator-permissions)
  - [4. Role Hierarchy Warning](#4-role-hierarchy-warning)
- [Environment Configuration](#environment-configuration)
- [CLI Commands & Options](#cli-commands--options)
  - [`pull` — Export Server Configuration](#pull--export-server-configuration)
  - [`push` — Apply Server Configuration](#push--apply-server-configuration)
- [Configuration Schema (`server.json.example`)](#configuration-schema-serverjsonexample)
- [Project Architecture](#project-architecture)
- [Testing](#testing)
- [License](#license)

---

## Features

- **🚀 Native & Ultra-Lightweight:** Zero dependencies on unmaintained third-party backup libraries. Pure modern `discord.js` v14 and Node.js built-ins.
- **📄 Declarative Synchronization:** Export existing server architecture or define a new one from scratch using clean, human-readable JSON files.
- **🛡️ Safe & Interactive UX:** Clear color-coded terminal output (`chalk`), active status spinners (`ora`), and interactive confirmation prompts (`@inquirer/prompts`) before executing destructive changes.
- **💬 Messages & Embeds Support:** Prepopulate channels with initial pinned or regular welcome messages, announcement embeds, and banners with custom webhook identities.
- **🔒 Security-First:** Strict `.gitignore` policy ensuring tokens, guild IDs, and private backups never get committed to source control.
- **⚡ Native Test Suite:** 100% native unit tests powered by Node's built-in `node:test` runner.

---

## Quick Start

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/urgorri/discord-sync-cli.git
cd discord-sync-cli
npm install
```

### 2. Configure Credentials

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Fill in your bot token and target server ID:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=123456789012345678
```

---

### Option 1: Direct in Project Root (Recommended)

Run the predefined npm scripts directly inside the repository without any global installation:

```bash
# Export the current server state to server.json
npm run pull

# Apply and sync server.json to the Discord server
npm run push

# Skip confirmation prompt when pushing
npm run push -- -y

# Alternatively, pass arguments through npm run dev
npm run dev -- pull -o ./my-backup.json
npm run dev -- push -f ./my-backup.json -y
```

---

### Option 2: Global CLI Installation (Optional)

If you prefer to run `discord-sync` from anywhere across your system:

```bash
# Link globally
npm link

# Or install globally from source
npm install -g .
```

Now you can invoke `discord-sync` directly:

```bash
# Pull server structure
discord-sync pull

# Push server structure
discord-sync push
```

---

## Discord Bot Setup

To manage roles, channels, and permissions, your Discord bot requires administrative access.

### 1. Create Application & Bot
1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give it a name, and go to the **Bot** section.
3. Click **Reset Token** and copy the generated token into your `.env` as `DISCORD_BOT_TOKEN`.

### 2. Enable Gateway Intents
On the **Bot** page, scroll down to **Privileged Gateway Intents** and enable:
- **Server Members Intent** (`GUILD_MEMBERS`)

### 3. Invite Bot with Administrator Permissions
1. Navigate to **OAuth2** > **URL Generator**.
2. Under **Scopes**, select `bot`.
3. Under **Bot Permissions**, select **Administrator**.
4. Open the generated invite URL in your browser and select your Discord server.

### 4. Role Hierarchy Warning
> [!IMPORTANT]
> In Discord, a bot can only manage roles and channels that are positioned **BELOW** its highest assigned role.
>
> Go to **Server Settings** > **Roles** and drag your Bot's role to the **top of the role list**. If other custom roles are above the bot's role, Discord API will reject modifications with a `403 Missing Permissions` error.

---

## Environment Configuration

| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `DISCORD_BOT_TOKEN` | Discord Bot Token from Developer Portal | **Yes** | — |
| `DISCORD_GUILD_ID` | Snowflake ID of the target server | **Yes** | — |
| `BACKUP_FILE` | Default path for the configuration file | No | `./server.json` |

---

## CLI Commands & Options

### `pull` — Export Server Configuration

Exports roles, categories, channels, permissions, AFK channel, and widget settings into a local JSON file.

```bash
# Default export to ./server.json
npm run pull

# Custom output destination and guild
npm run dev -- pull -o ./backups/community.json -g 123456789012345678

# Export custom server emojis as well
npm run dev -- pull --include-emojis
```

**Options:**
- `-o, --output <path>`: Destination path for the generated JSON file (default: `./server.json` or `BACKUP_FILE`).
- `-g, --guild <id>`: Target Discord Guild/Server ID (overrides `DISCORD_GUILD_ID`).
- `-t, --token <token>`: Discord Bot Token (overrides `DISCORD_BOT_TOKEN`).
- `--include-emojis`: Include custom server emojis in export.

---

### `push` — Apply Server Configuration

Reads the local JSON file and reconciles/synchronizes the server structure on Discord.

```bash
# 1. Preview changes before applying (Dry-Run mode - highly recommended)
npm run dev -- push -d
# or direct node invocation:
node ./bin/cli.js push -d

# 2. Interactive restore (prompts for confirmation before applying)
npm run push

# 3. Non-interactive force push (ideal for CI/CD or automation)
npm run dev -- push -y
# or:
node ./bin/cli.js push -y

# 4. Specify a custom configuration file and guild ID
node ./bin/cli.js push -f ./backups/community.json -g 123456789012345678 -y

# 5. Purge existing message histories before posting new messages
node ./bin/cli.js push -c -y

# 6. Unpin previous pinned messages when posting new pinned messages
node ./bin/cli.js push -u -y

# 7. Purge messages + unpin previous + skip prompt in one command
node ./bin/cli.js push -c -u -y

# 8. Synchronize custom server emojis as well
node ./bin/cli.js push --include-emojis -y
```

**Options:**
- `-f, --file <path>`: Source configuration file (default: `./server.json` or `BACKUP_FILE`).
- `-d, --dry-run`: Preview planned changes (created, updated, deleted roles & channels) without modifying Discord.
- `-c, --clean-messages`, `--purge-messages`: Purge all existing messages in channels before posting new ones (disabled by default; messages are sent as new messages).
- `-u, --unpin-previous`, `--clear-pins`: Unpin prior pinned messages in channels that have new pinned messages defined in configuration.
- `-g, --guild <id>`: Target Discord Guild/Server ID (overrides `DISCORD_GUILD_ID`).
- `-t, --token <token>`: Discord Bot Token (overrides `DISCORD_BOT_TOKEN`).
- `-y, --yes`, `--force`: Bypasses the interactive confirmation prompt.
- `--include-emojis`: Synchronizes custom emojis if defined in the configuration file.

---

## Configuration Schema (`server.json.example`)

A complete, self-documenting reference template is available in [`server.json.example`](server.json.example). It showcases:

- **Server Info**: Server name, AFK voice room with timeout, and widget configuration.
- **Roles**: `@everyone` base permissions, custom hoisted roles, hex colors (`#3498db`), and permission bitfields.
- **Categories & Channels**:
  - `type: 0` (Text channels)
  - `type: 2` (Voice channels)
  - `type: 5` (Announcement channels, `isNews: true`)
  - Topic descriptions, NSFW flags, and slowmode (`rateLimitPerUser`).
- **Permission Overwrites**: Role-based allows and denies mapped by `roleName`.
- **Predefined Messages & Embeds**: Standard chat text with pinned messages (`pinned: true`), custom author identities via webhooks, and Rich Embed cards with banners (`image.url`).

---

## Project Architecture

```text
discord-sync-cli/
├── bin/
│   └── cli.js                # CLI command definition & argument parser (Commander)
├── src/
│   ├── commands/
│   │   ├── pull.js           # Export command workflow
│   │   └── push.js           # Restore command workflow
│   ├── config/
│   │   └── env.js            # Environment loader & validation
│   ├── services/
│   │   └── syncEngine.js     # Core native sync engine (export & restore)
│   └── utils/
│       ├── client.js         # Discord.js client lifecycle & cache hydration
│       ├── logger.js         # Terminal logging formatting (Chalk)
│       └── validator.js      # Guild ID and JSON schema normalization
├── tests/
│   ├── env.test.js           # Config unit tests
│   ├── syncEngine.test.js    # Permissions and message restore unit tests
│   └── validator.test.js     # Schema and snowflake validation unit tests
├── .env.example              # Environment variables template
├── .gitignore                # Security-first gitignore
├── LICENSE                   # MIT License
├── package.json              # Manifest & dependency configuration
├── README.md                 # Project documentation
└── server.json.example       # Full declarative reference template
```

---

## Testing

Run the native unit test suite:

```bash
npm test
```

All 33 unit tests execute in milliseconds with zero third-party testing bloat.

---

## License

MIT License © 2026 [Gastón Urgorri](https://github.com/urgorri).
