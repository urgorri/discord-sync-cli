import path from 'node:path';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { getEnvConfig } from '../config/env.js';
import { createDiscordClient, getGuild, closeClient } from '../utils/client.js';
import { validateJsonFile, normalizeBackupData } from '../utils/validator.js';
import { restoreServerData, diffServerData } from '../services/syncEngine.js';
import { logger } from '../utils/logger.js';

/**
 * Handles the 'push' CLI command.
 * Restores/synchronizes local JSON structure to a remote Discord server.
 *
 * @param {object} options
 * @param {string} [options.file] - Input backup file path
 * @param {string} [options.guild] - Target Guild ID override
 * @param {string} [options.token] - Bot Token override
 * @param {boolean} [options.dryRun] - Preview changes without applying
 * @param {boolean} [options.yes] - Skip interactive confirmation prompt
 * @param {boolean} [options.force] - Alias for yes
 * @param {boolean} [options.includeEmojis] - Sync custom emojis
 */
export async function pushCommand(options = {}) {
  let client = null;
  const spinner = ora();

  try {
    const config = getEnvConfig({
      token: options.token,
      guild: options.guild,
      file: options.file,
    });
    const filePath = path.resolve(options.file || config.backupFile || './server.json');

    // 1. Validate JSON file before opening Discord connection
    logger.info(`Validating configuration file at ${filePath}...`);
    const rawData = validateJsonFile(filePath);
    const backupData = normalizeBackupData(rawData);

    // 2. Connect to Discord
    spinner.start('Connecting to Discord gateway...');
    client = await createDiscordClient(config.botToken);

    spinner.text = `Fetching guild (${config.guildId})...`;
    const guild = await getGuild(client, config.guildId);

    // 3. Handle Dry-Run mode
    if (options.dryRun) {
      spinner.stop();
      logger.info(`🔍 DRY-RUN MODE: Analyzing planned changes for "${guild.name}"...`);
      const diff = await diffServerData(guild, backupData, {
        includeEmojis: Boolean(options.includeEmojis),
      });

      console.log('\n--- Planned Changes Summary ---');
      if (diff.guildName.changed) {
        logger.info(`Server Name: "${diff.guildName.current}" -> "${diff.guildName.target}"`);
      }
      logger.info(`Roles: +${diff.roles.create.length} to create, ~${diff.roles.update.length} to update, -${diff.roles.delete.length} to delete`);
      if (diff.roles.create.length > 0) console.log(`  + Create roles: ${diff.roles.create.join(', ')}`);
      if (diff.roles.update.length > 0) console.log(`  ~ Update roles: ${diff.roles.update.join(', ')}`);
      if (diff.roles.delete.length > 0) console.log(`  - Delete roles: ${diff.roles.delete.join(', ')}`);

      logger.info(`Categories: +${diff.categories.create.length} to create, ~${diff.categories.update.length} to update, -${diff.categories.delete.length} to delete`);
      logger.info(`Channels: +${diff.channels.create.length} to create, ~${diff.channels.update.length} to update, -${diff.channels.delete.length} to delete`);
      if (diff.channels.create.length > 0) console.log(`  + Create channels: ${diff.channels.create.join(', ')}`);
      if (diff.channels.update.length > 0) console.log(`  ~ Update channels: ${diff.channels.update.join(', ')}`);
      if (diff.channels.delete.length > 0) console.log(`  - Delete channels: ${diff.channels.delete.join(', ')}`);

      if (diff.community.rules || diff.community.publicUpdates || diff.community.system || diff.community.afk) {
        logger.info('Community & System Channel bindings:');
        if (diff.community.rules) console.log(`  - Rules Channel: #${diff.community.rules}`);
        if (diff.community.publicUpdates) console.log(`  - Public Updates Channel: #${diff.community.publicUpdates}`);
        if (diff.community.system) console.log(`  - System Channel: #${diff.community.system}`);
        if (diff.community.afk) console.log(`  - AFK Channel: 🔊 ${diff.community.afk}`);
      }
      console.log('-------------------------------\n');
      logger.success('Dry-run completed. No changes were made to Discord.');
      return;
    }

    // 4. Interactive confirmation if not bypassed
    const skipConfirmation = options.yes || options.force;
    if (!skipConfirmation) {
      spinner.stop();
      logger.warn('WARNING: Destructive Operation!');
      logger.warn('This action will synchronize channels and roles with your local configuration.');
      
      const proceed = await confirm({
        message: 'Are you sure you want to apply this configuration to the server?',
        default: false,
      });

      if (!proceed) {
        logger.info('Operation cancelled by user.');
        return;
      }
      spinner.start();
    }

    // 5. Apply backup to Guild
    spinner.text = `Applying server state to "${guild.name}"...`;
    await restoreServerData(guild, backupData, {
      clearGuildBeforeRestore: true,
      cleanMessages: Boolean(options.cleanMessages || options.purgeMessages),
      unpinPrevious: Boolean(options.unpinPrevious || options.clearPins),
      includeEmojis: Boolean(options.includeEmojis),
    });

    spinner.succeed(`Successfully synchronized server structure with "${guild.name}".`);
    logger.success('Discord server state synchronization completed.');
  } catch (err) {
    if (spinner.isSpinning) {
      spinner.fail('Failed to push server configuration');
    }

    logger.error(`Push Error: ${err.message}`);

    // Provide actionable troubleshooting tips based on common Discord API errors
    if (err.code === 50013 || (err.message && err.message.includes('Missing Permissions'))) {
      logger.warn('Troubleshooting Tip [403 / Missing Permissions]:');
      logger.warn('  - Ensure the Bot has the "Administrator" permission in server settings.');
      logger.warn('  - Ensure the Bot\'s primary role is placed ABOVE the roles/channels it tries to modify in the role hierarchy.');
    } else if (err.code === 50001 || (err.message && err.message.includes('Missing Access'))) {
      logger.warn('Troubleshooting Tip [Missing Access]:');
      logger.warn('  - Verify the Bot is invited to the target server with proper OAuth2 scopes ("bot").');
    }

    process.exitCode = 1;
  } finally {
    if (client) {
      closeClient(client);
    }
  }
}
