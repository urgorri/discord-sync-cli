#!/usr/bin/env node

import { Command } from 'commander';
import { pullCommand } from '../src/commands/pull.js';
import { pushCommand } from '../src/commands/push.js';

const program = new Command();

program
  .name('discord-sync')
  .description('Ultra-lightweight CLI to declaratively manage and synchronize Discord server state')
  .version('1.0.0');

program
  .command('pull')
  .description('Export roles, channels, categories, permissions, and server configuration to a JSON file')
  .option('-o, --output <path>', 'Output JSON file path (default: server.json)')
  .option('-g, --guild <id>', 'Target Discord Guild/Server ID (overrides DISCORD_GUILD_ID)')
  .option('-t, --token <token>', 'Discord Bot Token (overrides DISCORD_BOT_TOKEN)')
  .option('--include-emojis', 'Include server custom emojis in export')
  .action(async (options) => {
    await pullCommand(options);
  });

program
  .command('push')
  .description('Apply local JSON configuration to the remote Discord server')
  .option('-f, --file <path>', 'Path to input server.json file')
  .option('-g, --guild <id>', 'Target Discord Guild/Server ID (overrides DISCORD_GUILD_ID)')
  .option('-t, --token <token>', 'Discord Bot Token (overrides DISCORD_BOT_TOKEN)')
  .option('-d, --dry-run', 'Preview changes without modifying the Discord server')
  .option('-c, --clean-messages', 'Purge existing channel messages before posting new ones')
  .option('--purge-messages', 'Alias for --clean-messages')
  .option('-u, --unpin-previous', 'Unpin prior pinned messages in channels that have new pinned messages')
  .option('--clear-pins', 'Alias for --unpin-previous')
  .option('-y, --yes', 'Skip confirmation prompt and force push')
  .option('--force', 'Alias for --yes')
  .option('--include-emojis', 'Synchronize custom emojis if present in configuration')
  .action(async (options) => {
    await pushCommand(options);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error('CLI Error:', err.message);
  process.exit(1);
});
