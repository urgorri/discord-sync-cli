import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractChannelPermissions,
  resolvePermissions,
  restoreChannelMessages,
  extractChannelInitialMessages,
  clearChannelMessages,
  diffServerData,
  exportServerData,
} from '../src/services/syncEngine.js';

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

  test('does not purge messages by default (cleanMessages: false)', async () => {
    let bulkDeleteCalled = false;
    const channel = {
      isTextBased: () => true,
      client: { user: { username: 'MyBot' } },
      messages: {
        fetch: async () => new Map([['1', { id: '1', deletable: true }]]),
      },
      bulkDelete: async () => {
        bulkDeleteCalled = true;
      },
      send: async () => ({ id: 'new_msg' }),
    };

    await restoreChannelMessages(channel, [{ content: 'New message' }]);
    assert.strictEqual(bulkDeleteCalled, false);
  });

  test('purges messages when cleanMessages is true', async () => {
    let bulkDeleteCalled = false;
    const messages = new Map([['1', { id: '1', deletable: true }]]);
    const channel = {
      isTextBased: () => true,
      client: { user: { username: 'MyBot' } },
      messages: {
        fetch: async () => messages,
      },
      bulkDelete: async () => {
        bulkDeleteCalled = true;
        return messages;
      },
      send: async () => ({ id: 'new_msg' }),
    };

    await restoreChannelMessages(channel, [{ content: 'New message' }], { cleanMessages: true });
    assert.strictEqual(bulkDeleteCalled, true);
  });
});

describe('syncEngine - extractChannelInitialMessages', () => {
  test('returns empty array if channel is not text based', async () => {
    const channel = { isTextBased: () => false };
    const result = await extractChannelInitialMessages(channel);
    assert.deepStrictEqual(result, []);
  });

  test('extracts and deduplicates pinned and oldest messages', async () => {
    const pinnedMessage = {
      id: 'msg_pinned_1',
      createdTimestamp: 1000,
      author: { username: 'Admin', displayAvatarURL: () => 'https://example.com/avatar.png' },
      pinned: true,
      content: 'Pinned Announcement',
      embeds: [],
    };

    const firstMessage = {
      id: 'msg_first_1',
      createdTimestamp: 500,
      author: { username: 'Founder', displayAvatarURL: () => 'https://example.com/founder.png' },
      pinned: false,
      content: 'First Message Ever',
      embeds: [{ toJSON: () => ({ title: 'Welcome' }) }],
    };

    const channel = {
      isTextBased: () => true,
      messages: {
        fetchPinned: async () => new Map([['msg_pinned_1', pinnedMessage]]),
        fetch: async () => new Map([['msg_first_1', firstMessage]]),
      },
    };

    const result = await extractChannelInitialMessages(channel);
    assert.strictEqual(result.length, 2);
    // Chronologically sorted: firstMessage (500) before pinnedMessage (1000)
    assert.strictEqual(result[0].username, 'Founder');
    assert.strictEqual(result[0].content, 'First Message Ever');
    assert.strictEqual(result[0].pinned, false);
    assert.deepStrictEqual(result[0].embeds, [{ title: 'Welcome' }]);

    assert.strictEqual(result[1].username, 'Admin');
    assert.strictEqual(result[1].content, 'Pinned Announcement');
    assert.strictEqual(result[1].pinned, true);
  });
});

describe('syncEngine - clearChannelMessages', () => {
  test('bulk deletes messages when channel supports bulkDelete', async () => {
    let bulkDeleted = false;
    const messages = new Map([
      ['1', { id: '1', deletable: true }],
      ['2', { id: '2', deletable: true }],
    ]);

    const channel = {
      isTextBased: () => true,
      messages: {
        fetch: async () => messages,
      },
      bulkDelete: async () => {
        bulkDeleted = true;
        return messages;
      },
    };

    await clearChannelMessages(channel);
    assert.strictEqual(bulkDeleted, true);
  });
});

describe('syncEngine - diffServerData', () => {
  test('correctly identifies created, updated, and deleted entities for dry-run', async () => {
    const mockGuild = {
      name: 'Old Name',
      id: '123456789',
      channels: {
        fetch: async () => {},
        cache: new Map([
          ['ch_1', { id: 'ch_1', name: 'general', type: 0, deletable: true }],
          ['ch_2', { id: 'ch_2', name: 'obsolete-channel', type: 0, deletable: true }],
        ]),
      },
      roles: {
        fetch: async () => {},
        cache: new Map([
          ['123456789', { id: '123456789', name: '@everyone', managed: false }],
          ['r_1', { id: 'r_1', name: 'Admin', managed: false }],
          ['r_2', { id: 'r_2', name: 'OldRole', managed: false }],
        ]),
      },
      members: {
        fetchMe: async () => ({
          roles: {
            highest: {
              comparePositionTo: () => 1,
            },
          },
        }),
      },
    };

    const backupData = {
      name: 'New Name',
      roles: [
        { name: '@everyone' },
        { name: 'Admin' },
        { name: 'Moderator' },
      ],
      channels: {
        categories: [],
        others: [
          { name: 'general', type: 0 },
          { name: 'welcome', type: 0 },
        ],
      },
      rulesChannel: 'general',
      publicUpdatesChannel: null,
      systemChannel: 'welcome',
      afk: { name: 'AFK', timeout: 300 },
    };

    const diff = await diffServerData(mockGuild, backupData);

    assert.strictEqual(diff.guildName.changed, true);
    assert.strictEqual(diff.guildName.target, 'New Name');

    // Roles: Moderator created, Admin updated, OldRole deleted
    assert.deepStrictEqual(diff.roles.create, ['Moderator']);
    assert.deepStrictEqual(diff.roles.update, ['Admin']);
    assert.deepStrictEqual(diff.roles.delete, ['OldRole']);

    // Channels: welcome created, general updated, obsolete-channel deleted
    assert.deepStrictEqual(diff.channels.create, ['welcome']);
    assert.deepStrictEqual(diff.channels.update, ['general']);
    assert.deepStrictEqual(diff.channels.delete, ['obsolete-channel']);

    // Community
    assert.strictEqual(diff.community.rules, 'general');
    assert.strictEqual(diff.community.system, 'welcome');
  });
});

describe('syncEngine - exportServerData', () => {
  test('exports emojis when includeEmojis is true', async () => {
    const mockGuild = {
      id: '123456789',
      name: 'Emoji Guild',
      channels: { fetch: async () => {}, cache: new Map() },
      roles: { fetch: async () => {}, cache: new Map() },
      emojis: {
        fetch: async () => {},
        cache: new Map([
          ['e_1', { name: 'pepe', imageURL: () => 'https://cdn.discordapp.com/emojis/pepe.png' }],
        ]),
      },
      afkChannel: null,
      widgetEnabled: false,
    };

    const data = await exportServerData(mockGuild, { includeEmojis: true });
    assert.strictEqual(data.emojis.length, 1);
    assert.strictEqual(data.emojis[0].name, 'pepe');
    assert.strictEqual(data.emojis[0].url, 'https://cdn.discordapp.com/emojis/pepe.png');
  });
});
