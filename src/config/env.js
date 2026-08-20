import dotenv from 'dotenv';

dotenv.config();

/**
 * Loads and validates environment variables required by discord-sync-cli.
 * 
 * @returns {{ botToken: string, guildId: string, backupFile: string }}
 */
export function getEnvConfig() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const backupFile = process.env.BACKUP_FILE || './server.json';

  const missing = [];
  if (!botToken) {
    missing.push('DISCORD_BOT_TOKEN');
  }
  if (!guildId) {
    missing.push('DISCORD_GUILD_ID');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}.\n` +
      `Please ensure you have created a '.env' file or set them in your environment.\n` +
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
