# discord-sync-cli

[![CI](https://github.com/your-username/discord-sync-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/discord-sync-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](package.json)

An ultra-lightweight, modular CLI tool to declaratively synchronize and back up Discord server state, roles, categories, channels, and permissions using local JSON files (`server.json`).

---

## Table of Contents

- [Features](#features)
- [Discord Bot Setup Guide](#discord-bot-setup-guide)
  - [1. Create Application & Bot](#1-create-application--bot)
  - [2. Configure Gateway Intents](#2-configure-gateway-intents)
  - [3. Invite Bot to Server](#3-invite-bot-to-server)
  - [4. Role Hierarchy Warning](#4-role-hierarchy-warning)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Usage & Commands](#usage--commands)
  - [`pull` Command](#pull-command)
  - [`push` Command](#push-command)
- [Project Architecture](#project-architecture)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **ESM Native:** Built on modern ES Modules (`"type": "module"`).
- **Declarative Sync:** Export and restore server structure (roles, categories, channels, permissions) via a readable `server.json` schema.
- **Interactive UX:** Built with `chalk`, `ora` spinners, and `@inquirer/prompts` confirmation dialogs to prevent accidental server wipes.
- **Zero Heavy Test Frameworks:** Uses Node.js native test runner (`node:test` and `node:assert`).
- **Credential Leak Protection:** Strict `.gitignore` policy preventing `.env` and `server.json` from accidentally leaking sensitive data.

---

## Discord Bot Setup Guide

To use `discord-sync-cli`, you need a Discord Bot with administrative permissions added to your server.

### 1. Create Application & Bot
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, enter a name (e.g., `Discord Sync`), and confirm.
3. Navigate to the **Bot** tab on the left menu.
4. Click **Reset Token** to generate a new bot token. Copy and save this token (you will set it as `DISCORD_BOT_TOKEN`).

### 2. Configure Gateway Intents
On the **Bot** tab in the Developer Portal, scroll down to **Privileged Gateway Intents**:
- Enable **Server Members Intent** (`GUILD_MEMBERS`).

### 3. Invite Bot to Server
1. Navigate to **OAuth2** > **URL Generator**.
2. Under **Scopes**, select `bot`.
3. Under **Bot Permissions**, select **Administrator** (or explicitly grant `Manage Roles`, `Manage Channels`, `Manage Webhooks`, `View Channels`).
4. Copy the generated URL at the bottom, paste it into your browser, and invite the bot to your target Discord server.

### 4. Role Hierarchy Warning
> **IMPORTANT:** In Discord, a bot can only manage roles and channels that are **BELOW** its highest assigned role in the server settings.
> 
> Go to **Server Settings** > **Roles** and drag your Bot's role to the **very top of the role list**. If the bot's role is below other roles, `discord-sync push` will fail with permission errors (HTTP 403 / Missing Permissions).

---

## Installation

### Local / Global Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/discord-sync-cli.git
cd discord-sync-cli
npm install
```

To use `discord-sync` globally on your machine:

```bash
npm link
```

Now you can run `discord-sync` from anywhere in your terminal.

---

## Environment Configuration

Create a `.env` file in your working directory (or project root) based on `.env.example`:

```bash
cp .env.example .env
```

Configure the following environment variables:

```env
# Required: Your Discord Bot Token from Developer Portal
DISCORD_BOT_TOKEN=your_bot_token_here

# Required: Target Server (Guild) ID
DISCORD_GUILD_ID=123456789012345678

# Optional: Output/Input file path (defaults to ./server.json)
BACKUP_FILE=./server.json
```

To find your **Guild ID** in Discord:
Enable Developer Mode in Discord settings (**User Settings** > **Advanced** > **Developer Mode**), right-click your server icon, and select **Copy Server ID**.

---

## Usage & Commands

### `pull` Command

Exports roles, channels, categories, permissions, and server settings to a JSON file.

```bash
# Export to default server.json
discord-sync pull

# Export to custom path
discord-sync pull -o ./backups/my-server.json
```

**Options:**
- `-o, --output <path>`: Path where the output JSON will be written (default: `./server.json` or `BACKUP_FILE`).

---

### `push` Command

Loads the local JSON configuration and applies it to the target Discord server.
**Note:** By default, restore mode clears existing channels and roles before re-creating them (`clearGuildBeforeRestore: true`).

```bash
# Push with interactive confirmation
discord-sync push

# Push with custom file
discord-sync push -f ./backups/my-server.json

# Skip interactive confirmation prompt
discord-sync push --yes
# or
discord-sync push --force
```

**Options:**
- `-f, --file <path>`: Input JSON configuration path (default: `./server.json` or `BACKUP_FILE`).
- `-y, --yes`, `--force`: Bypasses interactive confirmation.

---

## Project Architecture

```text
discord-sync-cli/
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI matrix (Node 18, 20, 22)
├── bin/
│   └── cli.js                # Executable CLI entry point (Commander)
├── src/
│   ├── commands/
│   │   ├── pull.js           # Pull command handler
│   │   └── push.js           # Push command handler with error tips
│   ├── config/
│   │   └── env.js            # Environment loader & validator
│   └── utils/
│       ├── client.js         # Discord Client & lifecycle helper
│       ├── logger.js         # Chalk visual logging helper
│       └── validator.js      # Guild ID & JSON file validator
├── tests/
│   ├── env.test.js           # Node native unit tests for env config
│   └── validator.test.js     # Node native unit tests for validators
├── .env.example              # Example environment variable file
├── .gitignore                # Security-first ignore file
├── LICENSE                   # MIT License
├── package.json              # Package manifest (type: module)
└── README.md                 # Project documentation
```

---

## Testing

Run unit tests using the native Node.js test runner (`node:test`):

```bash
npm test
```

All unit tests run without requiring transpilation or heavy extra test frameworks.

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Ensure all tests pass (`npm test`).
4. Commit your changes (`git commit -m 'feat: add amazing feature'`).
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
