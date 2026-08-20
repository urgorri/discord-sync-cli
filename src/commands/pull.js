import fs from 'node:fs/promises';
import path from 'node:path';
import ora from 'ora';
import { getEnvConfig } from '../config/env.js';
import { createDiscordClient, getGuild, closeClient } from '../utils/client.js';
import { exportServerData } from '../services/syncEngine.js';
import { logger } from '../utils/logger.js';

/**
 * Handles the 'pull' CLI command.
 * Exports roles, channels, categories, permissions, and server settings to a JSON file.
 *
 * @param {object} options
 * @param {string} [options.output] - Target file path
 */
export async function pullCommand(options = {}) {
  let client = null;
  const spinner = ora();

  try {
    const config = getEnvConfig({
      token: options.token,
      guild: options.guild,
      file: options.output,
    });
    const outputPath = path.resolve(options.output || config.backupFile || './server.json');

    spinner.start('Connecting to Discord gateway...');
    client = await createDiscordClient(config.botToken);

    spinner.text = `Fetching guild (${config.guildId})...`;
    const guild = await getGuild(client, config.guildId);

    spinner.text = `Exporting backup data for guild "${guild.name}"...`;
    const backupData = await exportServerData(guild, {
      includeEmojis: Boolean(options.includeEmojis),
    });

    spinner.text = `Writing server configuration to ${outputPath}...`;
    const jsonContent = JSON.stringify(backupData, null, 2);
    await fs.writeFile(outputPath, jsonContent, 'utf-8');

    spinner.succeed(`Successfully exported server configuration to ${outputPath}`);
    logger.success(`Exported ${backupData.roles?.length || 0} roles and ${backupData.channels?.categories?.length || 0} categories/channels.`);
  } catch (err) {
    if (spinner.isSpinning) {
      spinner.fail('Failed to pull server configuration');
    }
    logger.error(`Pull Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (client) {
      closeClient(client);
    }
  }
}
