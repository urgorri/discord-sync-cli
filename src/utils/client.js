import { Client, GatewayIntentBits } from 'discord.js';
import { validateGuildId } from './validator.js';

/**
 * Creates and logs in a Discord Client instance.
 * 
 * @param {string} token - Discord Bot Token
 * @returns {Promise<Client>} Logged-in Discord Client
 */
export async function createDiscordClient(token) {
  if (!token) {
    throw new Error('Bot token is required to create a Discord client.');
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  await client.login(token);
  return client;
}

/**
 * Fetches a Guild by ID from the client instance.
 * 
 * @param {Client} client - Logged-in Discord Client
 * @param {string} guildId - Discord Guild Snowflake ID
 * @returns {Promise<import('discord.js').Guild>} Discord Guild
 */
export async function getGuild(client, guildId) {
  if (!client) {
    throw new Error('Discord client instance is required.');
  }

  if (!validateGuildId(guildId)) {
    throw new Error(`Invalid Guild ID format: "${guildId}". Must be a valid Discord Snowflake.`);
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error(`Guild with ID ${guildId} was not found.`);
    }
    return guild;
  } catch (err) {
    if (err.code === 10004) {
      throw new Error(`Guild with ID "${guildId}" was not found or the bot is not in this server.`);
    }
    throw err;
  }
}

/**
 * Destroys the Discord Client session cleanly to prevent CLI process hanging.
 * 
 * @param {Client} client - Discord Client
 */
export function closeClient(client) {
  if (client) {
    try {
      client.destroy();
    } catch {
      // Ignore errors on destroy if already disconnected
    }
  }
}
