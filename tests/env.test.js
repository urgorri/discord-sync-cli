import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getEnvConfig } from '../src/config/env.js';

describe('getEnvConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_GUILD_ID;
    delete process.env.BACKUP_FILE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('returns environment configuration when required variables are provided', () => {
    process.env.DISCORD_BOT_TOKEN = 'test_token_123';
    process.env.DISCORD_GUILD_ID = '987654321098765432';

    const config = getEnvConfig();

    assert.strictEqual(config.botToken, 'test_token_123');
    assert.strictEqual(config.guildId, '987654321098765432');
    assert.strictEqual(config.backupFile, './server.json'); // Default value
  });

  test('uses custom BACKUP_FILE when specified in environment', () => {
    process.env.DISCORD_BOT_TOKEN = 'test_token_123';
    process.env.DISCORD_GUILD_ID = '987654321098765432';
    process.env.BACKUP_FILE = './custom-backup.json';

    const config = getEnvConfig();

    assert.strictEqual(config.backupFile, './custom-backup.json');
  });

  test('throws descriptive error when DISCORD_BOT_TOKEN is missing', () => {
    process.env.DISCORD_GUILD_ID = '987654321098765432';

    assert.throws(
      () => getEnvConfig(),
      /Missing required environment variable\(s\): DISCORD_BOT_TOKEN/
    );
  });

  test('throws descriptive error when DISCORD_GUILD_ID is missing', () => {
    process.env.DISCORD_BOT_TOKEN = 'test_token_123';

    assert.throws(
      () => getEnvConfig(),
      /Missing required environment variable\(s\): DISCORD_GUILD_ID/
    );
  });

  test('throws descriptive error listing both missing variables when both are absent', () => {
    assert.throws(
      () => getEnvConfig(),
      /Missing required environment variable\(s\): DISCORD_BOT_TOKEN, DISCORD_GUILD_ID/
    );
  });
});
