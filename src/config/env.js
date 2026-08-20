import dotenv from 'dotenv';

dotenv.config();

/**
 * Loads and validates environment variables and CLI overrides required by discord-sync-cli.
 * 
 * @param {object} [overrides]
 * @param {string} [overrides.token] - CLI token override
 * @param {string} [overrides.guild] - CLI guild ID override
 * @param {string} [overrides.file] - CLI file path override
 * @returns {{ botToken: string, guildId: string, backupFile: string }}
 */
export function getEnvConfig(overrides = {}) {
  const botToken = overrides.token || process.env.DISCORD_BOT_TOKEN;
  const guildId = overrides.guild || process.env.DISCORD_GUILD_ID;
  const backupFile = overrides.file || process.env.BACKUP_FILE || './server.json';

  const missing = [];
  if (!botToken) {
    missing.push('DISCORD_BOT_TOKEN (--token)');
  }
  if (!guildId) {
    missing.push('DISCORD_GUILD_ID (--guild)');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(', ')}.\n` +
      `Please provide them via CLI options or create a '.env' file.\n` +
      `Example .env setup:\n` +
      `  DISCORD_BOT_TOKEN=your_bot_token_here\n` +
      `  DISCORD_GUILD_ID=123456789012345678\n` +
      `  BACKUP_FILE=./server.json (optional)`
    );
  }

  return {
    botToken,
    guildId,
    backupFile,
  };
}
