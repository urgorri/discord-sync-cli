import path from 'node:path';
import ora from 'ora';
import discordBackup from 'discord-backup';
import { confirm } from '@inquirer/prompts';
import { getEnvConfig } from '../config/env.js';
import { createDiscordClient, getGuild, closeClient } from '../utils/client.js';
import { validateJsonFile } from '../utils/validator.js';
import { logger } from '../utils/logger.js';

/**
 * Handles the 'push' CLI command.
 * Restores/synchronizes local JSON structure to a remote Discord server.
 *
 * @param {object} options
 * @param {string} [options.file] - Input backup file path
 * @param {boolean} [options.yes] - Skip interactive confirmation prompt
 * @param {boolean} [options.force] - Alias for yes
 */
export async function pushCommand(options) {
  let client = null;
  const spinner = ora();

  try {
    const config = getEnvConfig();
    const filePath = path.resolve(options.file || config.backupFile || './server.json');

    // 1. Validate JSON file before opening Discord connection
    logger.info(`Validating configuration file at ${filePath}...`);
    const backupData = validateJsonFile(filePath);

    // 2. Interactive confirmation if not bypassed
    const skipConfirmation = options.yes || options.force;
    if (!skipConfirmation) {
      logger.warn('WARNING: Destructive Operation!');
      logger.warn('This action will clear existing channels and roles before applying the configuration.');
      
      const proceed = await confirm({
        message: 'Are you sure you want to restore and overwrite the server state?',
        default: false,
      });

      if (!proceed) {
        logger.info('Operation cancelled by user.');
        return;
      }
    }

    // 3. Connect to Discord
    spinner.start('Connecting to Discord gateway...');
    client = await createDiscordClient(config.botToken);

    spinner.text = `Fetching guild (${config.guildId})...`;
    const guild = await getGuild(client, config.guildId);

    // 4. Apply backup to Guild
    spinner.text = `Applying server state to "${guild.name}" (destructive mode)...`;
    await discordBackup.load(backupData, guild, {
      clearGuildBeforeRestore: true,
      maxMessagesPerChannel: 0,
    });

    spinner.succeed(`Successfully restored server structure to "${guild.name}".`);
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
