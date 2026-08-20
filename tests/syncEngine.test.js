import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractChannelPermissions, resolvePermissions, restoreChannelMessages } from '../src/services/syncEngine.js';

describe('syncEngine - extractChannelPermissions', () => {
  test('returns empty array when channel has no permissionOverwrites cache', () => {
    const channel = {};
    const result = extractChannelPermissions(channel);
    assert.deepStrictEqual(result, []);
  });

  test('extracts role-based permission overwrites correctly', () => {
    const mockRole = { name: 'Admin' };
    const channel = {
      guild: {
        roles: {
          cache: new Map([['role_123', mockRole]]),
        },
      },
      permissionOverwrites: {
        cache: new Map([
          [
            'perm_1',
            {
              id: 'role_123',
              type: 0, // OverwriteType.Role
              allow: { bitfield: 8n },
              deny: { bitfield: 0n },
            },
          ],
        ]),
      },
    };

    const result = extractChannelPermissions(channel);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].roleName, 'Admin');
    assert.strictEqual(result[0].allow, '8');
    assert.strictEqual(result[0].deny, '0');
  });
});

describe('syncEngine - resolvePermissions', () => {
  test('resolves role names to Discord snowflake IDs with BigInt permissions', () => {
    const guild = {
      roles: {
        cache: [
          { id: '111222333', name: '@everyone' },
          { id: '444555666', name: 'Moderador' },
        ],
      },
    };

    const permissionsList = [
      { roleName: '@everyone', allow: '0', deny: '2048' },
      { roleName: 'Moderador', allow: '8', deny: '0' },
      { roleName: 'NonExistent', allow: '8', deny: '0' },
    ];

    const result = resolvePermissions(permissionsList, guild);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], {
      id: '111222333',
      allow: 0n,
      deny: 2048n,
    });
    assert.deepStrictEqual(result[1], {
      id: '444555666',
      allow: 8n,
      deny: 0n,
    });
  });

  test('handles null or empty permissions list gracefully', () => {
    const guild = { roles: { cache: [] } };
    assert.deepStrictEqual(resolvePermissions(null, guild), []);
    assert.deepStrictEqual(resolvePermissions([], guild), []);
  });
});

describe('syncEngine - restoreChannelMessages', () => {
  test('sends message directly when author is bot user', async () => {
    const sentMessages = [];
    const channel = {
      client: { user: { username: 'MyBot' } },
      send: async (payload) => {
        sentMessages.push(payload);
        return { id: 'msg_1' };
      },
    };

    const messages = [
      { username: 'MyBot', content: 'Hello World' },
    ];

    await restoreChannelMessages(channel, messages);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].content, 'Hello World');
  });

  test('creates and uses webhook when username differs from bot', async () => {
    const webhookMessages = [];
    let webhookDeleted = false;

    const channel = {
      client: { user: { username: 'MyBot' } },
      createWebhook: async (options) => ({
        send: async (payload) => {
          webhookMessages.push({ ...payload, webhookName: options.name });
          return { id: 'msg_webhook' };
        },
        delete: async () => {
          webhookDeleted = true;
        },
      }),
    };

    const messages = [
      { username: 'Reglas', content: '📜 Reglas del servidor' },
    ];

    await restoreChannelMessages(channel, messages);
    assert.strictEqual(webhookMessages.length, 1);
    assert.strictEqual(webhookMessages[0].content, '📜 Reglas del servidor');
    assert.strictEqual(webhookMessages[0].webhookName, 'Reglas');
    assert.strictEqual(webhookDeleted, true);
  });
});
