import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateGuildId, validateJsonFile, normalizeBackupData } from '../src/utils/validator.js';

describe('validateGuildId', () => {
  test('returns true for valid Discord snowflakes (17 to 20 digits)', () => {
    assert.strictEqual(validateGuildId('12345678901234567'), true); // 17 digits
    assert.strictEqual(validateGuildId('123456789012345678'), true); // 18 digits
    assert.strictEqual(validateGuildId('1234567890123456789'), true); // 19 digits
    assert.strictEqual(validateGuildId('12345678901234567890'), true); // 20 digits
    assert.strictEqual(validateGuildId(123456789012345678n), true); // BigInt or numeric coerced
  });

  test('returns false for invalid inputs', () => {
    assert.strictEqual(validateGuildId(''), false);
    assert.strictEqual(validateGuildId('abc'), false);
    assert.strictEqual(validateGuildId('12345'), false); // Too short
    assert.strictEqual(validateGuildId('123456789012345678901'), false); // Too long (21 digits)
    assert.strictEqual(validateGuildId(null), false);
    assert.strictEqual(validateGuildId(undefined), false);
    assert.strictEqual(validateGuildId('12345678901234567a'), false); // Non-digit characters
  });
});

describe('validateJsonFile', () => {
  let tmpDir;

  test('setup temp directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-sync-test-'));
  });

  test('successfully reads and parses a valid JSON file', () => {
    const validFile = path.join(tmpDir, 'valid.json');
    const data = { name: 'Test Guild', roles: [] };
    fs.writeFileSync(validFile, JSON.stringify(data), 'utf-8');

    const result = validateJsonFile(validFile);
    assert.deepStrictEqual(result, data);
  });

  test('throws error if file path is missing or invalid type', () => {
    assert.throws(() => validateJsonFile(''), /non-empty string/);
    assert.throws(() => validateJsonFile(null), /non-empty string/);
  });

  test('throws error if file does not exist', () => {
    const nonExistent = path.join(tmpDir, 'non-existent.json');
    assert.throws(() => validateJsonFile(nonExistent), /does not exist/);
  });

  test('throws error if file is empty', () => {
    const emptyFile = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(emptyFile, '', 'utf-8');

    assert.throws(() => validateJsonFile(emptyFile), /is empty/);
  });

  test('throws error if file contains invalid JSON syntax', () => {
    const invalidFile = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(invalidFile, '{ bad json: 123 ', 'utf-8');

    assert.throws(() => validateJsonFile(invalidFile), /Invalid JSON syntax/);
  });

  test('cleanup temp directory', () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('normalizeBackupData', () => {
  test('normalizes string AFK channel to object with default timeout', () => {
    const input = { afk: 'AFK Room' };
    const normalized = normalizeBackupData(input);
    assert.deepStrictEqual(normalized.afk, { name: 'AFK Room', timeout: 300 });
  });

  test('normalizes missing widget configuration to default structure', () => {
    const input = {};
    const normalized = normalizeBackupData(input);
    assert.deepStrictEqual(normalized.widget, { enabled: false, channel: null });
  });

  test('ensures roles, bans, emojis, members, and channels arrays exist', () => {
    const input = {};
    const normalized = normalizeBackupData(input);
    assert.deepStrictEqual(normalized.roles, []);
    assert.deepStrictEqual(normalized.bans, []);
    assert.deepStrictEqual(normalized.emojis, []);
    assert.deepStrictEqual(normalized.members, []);
    assert.deepStrictEqual(normalized.channels, { categories: [], others: [] });
  });

  test('sanitizes unsupported channel types to 0 (GuildText)', () => {
    const input = {
      channels: {
        categories: [
          {
            name: 'Cat',
            children: [{ name: 'forum', type: 15 }],
          },
        ],
        others: [{ name: 'custom', type: null }],
      },
    };
    const normalized = normalizeBackupData(input);
    assert.strictEqual(normalized.channels.categories[0].children[0].type, 0);
    assert.strictEqual(normalized.channels.others[0].type, 0);
  });
});
