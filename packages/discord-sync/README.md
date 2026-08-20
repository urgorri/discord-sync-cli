# discord-sync

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![NPM Version](https://img.shields.io/badge/npm-v1.0.1-blue.svg)](https://www.npmjs.com/package/discord-sync)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](package.json)

Declarative Discord server state engine to export, manage, and reconcile server structures (roles, categories, channels, permissions, and initial messages) programmatically in Node.js applications.

Treat your Discord server structure as **Infrastructure as Code** (IaC).

---

## Installation

```bash
npm install discord-sync discord.js
```

---

## Programmatic Usage

### 1. Export Server Configuration

```javascript
import { createDiscordClient, getGuild, exportServerData, closeClient } from 'discord-sync';

const client = await createDiscordClient('YOUR_BOT_TOKEN');
const guild = await getGuild(client, '123456789012345678');

// Export complete guild structure to a JSON-serializable object
const backupData = await exportServerData(guild, { includeEmojis: true });

console.log(JSON.stringify(backupData, null, 2));

closeClient(client);
```

---

### 2. Preview Planned Diffs (Dry-Run Mode)

```javascript
import { createDiscordClient, getGuild, diffServerData, closeClient } from 'discord-sync';

const client = await createDiscordClient('YOUR_BOT_TOKEN');
const guild = await getGuild(client, '123456789012345678');

const backupData = { /* your server.json structure */ };

// Analyze planned changes without modifying Discord
const diff = await diffServerData(guild, backupData);

console.log('Roles to create:', diff.roles.create);
console.log('Roles to update:', diff.roles.update);
console.log('Channels to delete:', diff.channels.delete);

closeClient(client);
```

---

### 3. Reconcile & Synchronize Server State

```javascript
import { createDiscordClient, getGuild, restoreServerData, closeClient } from 'discord-sync';

const client = await createDiscordClient('YOUR_BOT_TOKEN');
const guild = await getGuild(client, '123456789012345678');

const backupData = { /* your server.json structure */ };

// Synchronize server state declaratively
await restoreServerData(guild, backupData, {
  cleanMessages: false,   // Set to true to purge existing channel messages
  unpinPrevious: true,    // Unpin old pinned messages when posting new pinned ones
  includeEmojis: true,    // Restore custom server emojis
});

closeClient(client);
```

---

## API Reference

### `createDiscordClient(token)`
Creates and logs in a modern `discord.js` Client with required gateway intents.

### `getGuild(client, guildId)`
Fetches and populates the cache for a target Discord Guild by snowflake ID.

### `exportServerData(guild, [options])`
Exports roles, categories, channels, topic, permissions, initial messages, AFK settings, widget, and optional emojis.

### `diffServerData(guild, backupData, [options])`
Computes created, updated, and deleted entities without altering Discord.

### `restoreServerData(guild, backupData, [options])`
Edits existing channels in-place, creates missing ones, restores permissions & messages, and purges undeclared channels.

### `closeClient(client)`
Cleanly destroys the client session.

---

## License

MIT © 2026 [Gastón Urgorri](https://github.com/urgorri).
