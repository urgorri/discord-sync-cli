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
  .action(async (options) => {
    await pullCommand(options);
  });

program
  .command('push')
  .description('Apply local JSON configuration to the remote Discord server (destructive restore)')
  .option('-f, --file <path>', 'Path to input server.json file')
  .option('-y, --yes', 'Skip confirmation prompt and force push')
  .option('--force', 'Alias for --yes')
  .action(async (options) => {
    await pushCommand(options);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error('CLI Error:', err.message);
  process.exit(1);
});
