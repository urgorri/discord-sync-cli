import { ChannelType, OverwriteType } from 'discord.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Maps permissions overwrites of a channel to backup format with role names.
 *
 * @param {import('discord.js').GuildChannel} channel
 * @returns {Array<{ roleName: string, allow: string, deny: string }>}
 */
export function extractChannelPermissions(channel) {
  const permissions = [];
  const cache = channel.permissionOverwrites?.cache;
  if (!cache) return permissions;

  const entries = typeof cache.values === 'function' ? [...cache.values()] : [...cache];

  for (const perm of entries) {
    if (perm.type === OverwriteType.Role || perm.type === 0) {
      const role = channel.guild?.roles?.cache?.get
        ? channel.guild.roles.cache.get(perm.id)
        : (Array.isArray(channel.guild?.roles?.cache) ? channel.guild.roles.cache.find(r => r.id === perm.id) : null);
      if (role) {
        permissions.push({
          roleName: role.name,
          allow: (perm.allow?.bitfield !== undefined ? perm.allow.bitfield : perm.allow).toString(),
          deny: (perm.deny?.bitfield !== undefined ? perm.deny.bitfield : perm.deny).toString(),
        });
      }
    }
  }

  return permissions;
}

/**
 * Resolves a list of backup permission objects to Discord permission overwrites using current guild roles.
 *
 * @param {Array<{ roleName: string, allow: string, deny: string }>} permissionsList
 * @param {import('discord.js').Guild} guild
 * @returns {Array<{ id: string, allow: bigint, deny: bigint }>}
 */
export function resolvePermissions(permissionsList, guild) {
  const overwrites = [];
  const rolesCache = guild?.roles?.cache;
  if (!rolesCache) return overwrites;

  for (const perm of permissionsList || []) {
    let role = null;
    if (typeof rolesCache.find === 'function') {
      role = rolesCache.find((r) => r.name === perm.roleName);
    } else if (Array.isArray(rolesCache)) {
      role = rolesCache.find((r) => r.name === perm.roleName);
    } else if (typeof rolesCache.values === 'function') {
      role = [...rolesCache.values()].find((r) => r.name === perm.roleName);
    }

    if (role) {
      overwrites.push({
        id: role.id,
        allow: BigInt(perm.allow || '0'),
        deny: BigInt(perm.deny || '0'),
      });
    }
  }
  return overwrites;
}

/**
 * Fetches the first message and any pinned messages of a text-based channel for declarative backup.
 *
 * @param {import('discord.js').GuildChannel} channel
 * @returns {Promise<Array<object>>}
 */
export async function extractChannelInitialMessages(channel) {
  if (!channel.isTextBased?.() || typeof channel.messages?.fetch !== 'function') {
    return [];
  }

  const collectedMessages = new Map();

  try {
    // 1. Fetch pinned messages
    const pinnedMessages = await channel.messages.fetchPinned().catch(() => null);
    if (pinnedMessages) {
      for (const [, msg] of pinnedMessages) {
        if (!msg.system) {
          collectedMessages.set(msg.id, msg);
        }
      }
    }

    // 2. Fetch the very first message of the channel (oldest message)
    const oldestMessages = await channel.messages.fetch({ after: '0', limit: 1 }).catch(() => null);
    if (oldestMessages) {
      for (const [, msg] of oldestMessages) {
        if (!msg.system) {
          collectedMessages.set(msg.id, msg);
        }
      }
    }
  } catch {
    // Ignore fetch errors if bot lacks ViewChannel or ReadMessageHistory permissions
  }

  if (collectedMessages.size === 0) {
    return [];
  }

  // Sort chronologically (oldest first)
  const sorted = [...collectedMessages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  return sorted.map((msg) => {
    const embeds = Array.isArray(msg.embeds)
      ? msg.embeds.map((embed) => (typeof embed.toJSON === 'function' ? embed.toJSON() : embed))
      : [];

    const item = {
      username: msg.author?.username || 'System',
      pinned: Boolean(msg.pinned),
      content: msg.content || '',
      embeds,
    };

    const avatar = msg.author?.displayAvatarURL?.({ extension: 'png' });
    if (avatar) {
      item.avatar = avatar;
    }

    return item;
  });
}

/**
 * Exports the complete structure of a Discord guild to a JSON-serializable object.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} [options]
 * @param {boolean} [options.includeEmojis=false]
 * @returns {Promise<object>}
 */
export async function exportServerData(guild, options = {}) {
  // Ensure caches are fresh
  await Promise.allSettled([
    guild.channels.fetch(),
    guild.roles.fetch(),
    options.includeEmojis ? guild.emojis?.fetch().catch(() => null) : Promise.resolve(),
  ]);

  // 1. Roles (sorted from lowest position to highest)
  const rolesCache = typeof guild.roles?.cache?.values === 'function' ? [...guild.roles.cache.values()] : Array.isArray(guild.roles?.cache) ? guild.roles.cache : [];
  const roles = rolesCache
    .filter((role) => role && !role.managed)
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((role) => ({
      name: role.name,
      color: role.hexColor === '#000000' || !role.hexColor ? '#000000' : role.hexColor,
      hoist: Boolean(role.hoist),
      permissions: role.permissions?.bitfield !== undefined ? role.permissions.bitfield.toString() : (role.permissions || '0').toString(),
      mentionable: Boolean(role.mentionable),
      position: role.position || 0,
      isEveryone: role.id === guild.id,
    }));

  // 2. Channels & Categories
  const categoriesData = [];
  const othersData = [];

  const allChannels = typeof guild.channels?.cache?.values === 'function' ? [...guild.channels.cache.values()] : Array.isArray(guild.channels?.cache) ? guild.channels.cache : [];

  const categories = allChannels
    .filter((ch) => ch && ch.type === ChannelType.GuildCategory)
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  for (const category of categories) {
    const catChildren = allChannels
      .filter((ch) => ch && ch.parentId === category.id)
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    const children = [];
    for (const child of catChildren) {
      const messages = await extractChannelInitialMessages(child);
      children.push({
        type: child.type,
        name: child.name,
        nsfw: Boolean(child.nsfw),
        rateLimitPerUser: child.rateLimitPerUser || 0,
        parent: category.name,
        topic: child.topic || null,
        permissions: extractChannelPermissions(child),
        messages,
        isNews: child.type === ChannelType.GuildAnnouncement,
        threads: [],
      });
    }

    categoriesData.push({
      name: category.name,
      permissions: extractChannelPermissions(category),
      children,
    });
  }

  const orphanChannels = allChannels
    .filter((ch) => ch && !ch.parentId && ch.type !== ChannelType.GuildCategory && (!ch.isThread || !ch.isThread()))
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  for (const ch of orphanChannels) {
    const messages = await extractChannelInitialMessages(ch);
    othersData.push({
      type: ch.type,
      name: ch.name,
      nsfw: Boolean(ch.nsfw),
      rateLimitPerUser: ch.rateLimitPerUser || 0,
      parent: null,
      topic: ch.topic || null,
      permissions: extractChannelPermissions(ch),
      messages,
      isNews: ch.type === ChannelType.GuildAnnouncement,
      threads: [],
    });
  }

  // 3. AFK Channel
  const afk = guild.afkChannel
    ? {
        name: guild.afkChannel.name,
        timeout: guild.afkTimeout || 300,
      }
    : null;

  // 4. Widget
  const widget = {
    enabled: Boolean(guild.widgetEnabled),
    channel: guild.widgetChannel ? guild.widgetChannel.name : null,
  };

  // 5. Community & System Channels
  const rulesChannel = guild.rulesChannel?.name || null;
  const publicUpdatesChannel = guild.publicUpdatesChannel?.name || null;
  const systemChannel = guild.systemChannel?.name || null;

  // 6. Emojis (if requested)
  const emojis = options.includeEmojis && guild.emojis?.cache
    ? [...guild.emojis.cache.values()].map((emoji) => ({
        name: emoji.name,
        url: typeof emoji.imageURL === 'function' ? emoji.imageURL({ extension: 'png' }) : emoji.url || null,
      }))
    : [];

  return {
    name: guild.name,
    afk,
    widget,
    rulesChannel,
    publicUpdatesChannel,
    systemChannel,
    channels: {
      categories: categoriesData,
      others: othersData,
    },
    roles,
    bans: [],
    emojis,
    members: [],
    createdTimestamp: Date.now(),
    guildID: guild.id,
  };
}

/**
 * Computes the planned declarative differences between the remote Guild and the local backupData without applying any changes.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} backupData
 * @param {object} [options]
 * @returns {Promise<{
 *   guildName: { current: string, target: string, changed: boolean },
 *   roles: { create: string[], update: string[], delete: string[] },
 *   categories: { create: string[], update: string[], delete: string[] },
 *   channels: { create: string[], update: string[], delete: string[] },
 *   community: { rules: string|null, publicUpdates: string|null, system: string|null, afk: string|null }
 * }>}
 */
export async function diffServerData(guild, backupData, options = {}) {
  await Promise.allSettled([
    guild.channels.fetch(),
    guild.roles.fetch(),
    guild.members.fetchMe(),
  ]);

  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const botHighestRole = botMember?.roles?.highest;

  // 1. Guild Name
  const guildName = {
    current: guild.name,
    target: backupData.name || guild.name,
    changed: Boolean(backupData.name && backupData.name !== guild.name),
  };

  // 2. Roles diff
  const rolesDiff = { create: [], update: [], delete: [] };
  const matchedRoleIds = new Set([guild.id]);
  const rolesList = typeof guild.roles?.cache?.values === 'function' ? [...guild.roles.cache.values()] : Array.isArray(guild.roles?.cache) ? guild.roles.cache : [];

  if (Array.isArray(backupData.roles)) {
    for (const roleData of backupData.roles) {
      if (roleData.isEveryone || roleData.name === '@everyone') continue;
      const existing = rolesList.find(
        (r) => r && !r.managed && r.id !== guild.id && r.name.toLowerCase() === roleData.name.toLowerCase()
      );
      if (existing) {
        matchedRoleIds.add(existing.id);
        rolesDiff.update.push(roleData.name);
      } else {
        rolesDiff.create.push(roleData.name);
      }
    }
  }

  for (const role of rolesList) {
    if (role && !matchedRoleIds.has(role.id) && !role.managed && role.id !== guild.id) {
      if (botHighestRole && botHighestRole.comparePositionTo(role) > 0) {
        rolesDiff.delete.push(role.name);
      }
    }
  }

  // 3. Categories & Channels diff
  const categoriesDiff = { create: [], update: [], delete: [] };
  const channelsDiff = { create: [], update: [], delete: [] };
  const matchedChannelIds = new Set();
  const channelsList = typeof guild.channels?.cache?.values === 'function' ? [...guild.channels.cache.values()] : Array.isArray(guild.channels?.cache) ? guild.channels.cache : [];

  if (Array.isArray(backupData.channels?.categories)) {
    for (const catData of backupData.channels.categories) {
      const existingCat = channelsList.find(
        (ch) => ch && ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === catData.name.toLowerCase()
      );
      if (existingCat) {
        matchedChannelIds.add(existingCat.id);
        categoriesDiff.update.push(catData.name);
      } else {
        categoriesDiff.create.push(catData.name);
      }

      if (Array.isArray(catData.children)) {
        for (const child of catData.children) {
          const existingChild = channelsList.find(
            (ch) => ch && !matchedChannelIds.has(ch.id) && ch.name.toLowerCase() === child.name.toLowerCase()
          );
          if (existingChild) {
            matchedChannelIds.add(existingChild.id);
            channelsDiff.update.push(child.name);
          } else {
            channelsDiff.create.push(child.name);
          }
        }
      }
    }
  }

  if (Array.isArray(backupData.channels?.others)) {
    for (const other of backupData.channels.others) {
      const existingOther = channelsList.find(
        (ch) => ch && !matchedChannelIds.has(ch.id) && ch.name.toLowerCase() === other.name.toLowerCase()
      );
      if (existingOther) {
        matchedChannelIds.add(existingOther.id);
        channelsDiff.update.push(other.name);
      } else {
        channelsDiff.create.push(other.name);
      }
    }
  }

  for (const ch of channelsList) {
    if (ch && !matchedChannelIds.has(ch.id)) {
      if (ch.type === ChannelType.GuildCategory) {
        categoriesDiff.delete.push(ch.name);
      } else {
        channelsDiff.delete.push(ch.name);
      }
    }
  }

  return {
    guildName,
    roles: rolesDiff,
    categories: categoriesDiff,
    channels: channelsDiff,
    community: {
      rules: backupData.rulesChannel || null,
      publicUpdates: backupData.publicUpdatesChannel || null,
      system: backupData.systemChannel || null,
      afk: backupData.afk?.name || null,
    },
  };
}

/**
 * Clears existing channels and custom roles from the guild.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<Array<import('discord.js').GuildChannel>>} Leftover channels that couldn't be deleted initially due to community bindings
 */
export async function clearGuild(guild) {
  // 1. Unbind system, AFK, and community channels before deletion
  await guild.setAFKChannel(null).catch(() => {});
  await guild.setSystemChannel(null).catch(() => {});
  if (typeof guild.setWidgetSettings === 'function') {
    await guild.setWidgetSettings({ enabled: false, channel: null }).catch(() => {});
  }
  if (typeof guild.edit === 'function') {
    await guild.edit({
      rulesChannel: null,
      publicUpdatesChannel: null,
      systemChannel: null,
      afkChannel: null,
    }).catch(() => {});
  }

  // 2. Delete all non-managed custom roles
  await guild.roles.fetch();
  const botMember = await guild.members.fetchMe().catch(() => null);
  const botHighestRole = botMember?.roles?.highest;

  for (const [, role] of guild.roles.cache) {
    if (role.id === guild.id || role.managed) continue;
    try {
      // Check if bot can edit/delete this role
      if (botHighestRole && botHighestRole.comparePositionTo(role) > 0) {
        await role.delete();
        await delay(100);
      }
    } catch {
      // Continue if deletion fails
    }
  }

  // 3. Delete all channels
  await guild.channels.fetch();
  const leftoverChannels = [];

  for (const [, channel] of guild.channels.cache) {
    try {
      if (channel.deletable) {
        await channel.delete();
        await delay(100);
      } else {
        leftoverChannels.push(channel);
      }
    } catch {
      leftoverChannels.push(channel);
    }
  }

  return leftoverChannels;
}

/**
 * Purges all existing messages from a text-based channel so it starts clean before restoring messages.
 *
 * @param {import('discord.js').TextChannel|import('discord.js').NewsChannel} channel
 */
export async function clearChannelMessages(channel) {
  if (!channel.isTextBased?.() || typeof channel.messages?.fetch !== 'function') return;

  try {
    let fetched;
    do {
      fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (!fetched || (fetched.size === 0 && fetched.length === 0)) break;

      const entries = typeof fetched.values === 'function' ? [...fetched.values()] : Array.isArray(fetched) ? fetched : [];
      const deletableMessages = entries.filter((m) => m && m.deletable !== false);
      if (deletableMessages.length === 0) break;

      if (typeof channel.bulkDelete === 'function') {
        try {
          const deleted = await channel.bulkDelete(deletableMessages, true);
          const deletedSet = deleted instanceof Map || deleted?.has ? deleted : new Set(Array.isArray(deleted) ? deleted.map(d => d.id) : []);
          const remaining = deletableMessages.filter((m) => !deletedSet.has(m.id));
          for (const msg of remaining) {
            await msg.delete?.().catch(() => {});
            await delay(50);
          }
        } catch {
          for (const msg of deletableMessages) {
            await msg.delete?.().catch(() => {});
            await delay(50);
          }
        }
      } else {
        for (const msg of deletableMessages) {
          await msg.delete?.().catch(() => {});
          await delay(50);
        }
      }
    } while (fetched && (fetched.size >= 100 || fetched.length >= 100));
  } catch {
    // Ignore purge errors
  }
}

/**
 * Restores predefined messages to a text-based channel.
 *
 * @param {import('discord.js').TextChannel|import('discord.js').NewsChannel} channel
 * @param {Array<object>} messages
 * @param {object} [options]
 * @param {boolean} [options.cleanMessages=false]
 * @param {boolean} [options.unpinPrevious=false]
 */
export async function restoreChannelMessages(channel, messages, options = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return;

  // Clear existing messages only if explicitly requested
  if (options.cleanMessages) {
    await clearChannelMessages(channel);
  } else if (options.unpinPrevious && messages.some((m) => m && m.pinned)) {
    // Unpin existing pinned messages before posting new pinned ones
    try {
      const pinned = await channel.messages?.fetchPinned?.().catch(() => null);
      if (pinned) {
        const entries = typeof pinned.values === 'function' ? [...pinned.values()] : Array.isArray(pinned) ? pinned : [];
        for (const msg of entries) {
          await msg.unpin?.().catch(() => {});
          await delay(100);
        }
      }
    } catch {
      // Ignore unpin errors
    }
  }

  for (const msg of messages) {
    if (!msg || (!msg.content && (!Array.isArray(msg.embeds) || msg.embeds.length === 0))) {
      continue;
    }

    try {
      let sentMessage = null;

      if (msg.username && msg.username !== channel.client?.user?.username) {
        const resolvedAvatar =
          msg.avatar ||
          msg.avatarURL ||
          (typeof channel.guild?.iconURL === 'function' ? channel.guild.iconURL({ extension: 'png', size: 256 }) : null) ||
          (typeof channel.client?.user?.displayAvatarURL === 'function' ? channel.client.user.displayAvatarURL({ extension: 'png', size: 256 }) : null) ||
          undefined;

        let webhook = null;
        try {
          webhook = await channel.createWebhook({
            name: msg.username.slice(0, 80) || 'SyncBot',
            avatar: resolvedAvatar,
          });

          sentMessage = await webhook.send({
            content: msg.content?.slice(0, 2000) || undefined,
            embeds: Array.isArray(msg.embeds) ? msg.embeds.slice(0, 10) : [],
            username: msg.username.slice(0, 80),
            avatarURL: resolvedAvatar,
          });
        } catch {
          // If webhook creation/send fails, fallback to direct channel message
          sentMessage = await channel.send({
            content: msg.content?.slice(0, 2000) || undefined,
            embeds: Array.isArray(msg.embeds) ? msg.embeds.slice(0, 10) : [],
          });
        } finally {
          if (webhook) {
            await webhook.delete().catch(() => {});
          }
        }
      } else {
        sentMessage = await channel.send({
          content: msg.content?.slice(0, 2000) || undefined,
          embeds: Array.isArray(msg.embeds) ? msg.embeds.slice(0, 10) : [],
        });
      }

      if (msg.pinned && sentMessage?.pin) {
        await sentMessage.pin().catch(() => {});
      }

      await delay(250);
    } catch {
      // Continue if a single message fails to post
    }
  }
}

/**
 * Restores / Synchronizes a server backup state to a remote Discord guild declaratively.
 * Reuses and edits existing channels and roles to avoid duplication or Discord Community deletion locks.
 * Only deletes channels and roles that are NOT present in the backup configuration.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} backupData
 * @param {object} [options]
 * @param {boolean} [options.clearGuildBeforeRestore=true]
 * @param {boolean} [options.cleanMessages=false]
 * @param {boolean} [options.includeEmojis=false]
 */
export async function restoreServerData(guild, backupData, options = {}) {
  // 1. Restore guild name if present
  if (backupData.name && backupData.name !== guild.name) {
    try {
      await guild.setName(backupData.name);
    } catch {
      // Ignore if bot lacks permissions to rename server
    }
  }

  // 2. Fetch fresh roles, channels, and member cache
  await Promise.allSettled([
    guild.roles.fetch(),
    guild.channels.fetch(),
    guild.members.fetchMe(),
  ]);

  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const botHighestRole = botMember?.roles?.highest;

  // 3. Sync Roles (Reconcile / In-place update + Create + Delete obsolete)
  const matchedRoleIds = new Set([guild.id]); // Keep @everyone

  if (Array.isArray(backupData.roles)) {
    const sortedRoles = [...backupData.roles].sort((a, b) => {
      if (a.isEveryone || a.name === '@everyone') return -1;
      if (b.isEveryone || b.name === '@everyone') return 1;
      return (a.position || 0) - (b.position || 0);
    });

    for (const roleData of sortedRoles) {
      if (roleData.isEveryone || roleData.name === '@everyone') {
        const everyoneRole = guild.roles.everyone;
        if (everyoneRole && roleData.permissions) {
          try {
            await everyoneRole.setPermissions(BigInt(roleData.permissions));
          } catch {
            // Ignore permission edit errors on everyone
          }
        }
      } else {
        // Look for existing role by name
        const existingRole = guild.roles.cache.find(
          (r) => !r.managed && r.id !== guild.id && r.name.toLowerCase() === roleData.name.toLowerCase()
        );

        if (existingRole) {
          matchedRoleIds.add(existingRole.id);
          try {
            const roleEditOptions = {
              name: roleData.name.slice(0, 100),
              hoist: Boolean(roleData.hoist),
              permissions: roleData.permissions ? BigInt(roleData.permissions) : 0n,
              mentionable: Boolean(roleData.mentionable),
            };
            if (roleData.color && roleData.color !== '#000000') {
              roleEditOptions.colors = { primaryColor: roleData.color };
            }
            await existingRole.edit(roleEditOptions);
            await delay(100);
          } catch {
            // Continue if edit fails
          }
        } else {
          try {
            const roleCreateOptions = {
              name: roleData.name.slice(0, 100),
              hoist: Boolean(roleData.hoist),
              permissions: roleData.permissions ? BigInt(roleData.permissions) : 0n,
              mentionable: Boolean(roleData.mentionable),
            };
            if (roleData.color && roleData.color !== '#000000') {
              roleCreateOptions.colors = { primaryColor: roleData.color };
            }
            const createdRole = await guild.roles.create(roleCreateOptions);
            matchedRoleIds.add(createdRole.id);
            await delay(150);
          } catch {
            // Continue if create fails
          }
        }
      }
    }
  }

  // Delete obsolete custom roles (if clearGuildBeforeRestore is enabled)
  if (options.clearGuildBeforeRestore !== false) {
    for (const [, role] of guild.roles.cache) {
      if (!matchedRoleIds.has(role.id) && !role.managed && role.id !== guild.id) {
        try {
          if (botHighestRole && botHighestRole.comparePositionTo(role) > 0) {
            await role.delete();
            await delay(100);
          }
        } catch {
          // Ignore deletion error
        }
      }
    }
  }

  // Refresh roles cache
  await guild.roles.fetch();

  // Helper to map channel types correctly
  const mapType = (type, isNews) => {
    if (type === ChannelType.GuildVoice || type === 2) return ChannelType.GuildVoice;
    if (type === ChannelType.GuildAnnouncement || type === 5 || isNews) return ChannelType.GuildAnnouncement;
    if (type === ChannelType.GuildForum || type === 15) return ChannelType.GuildForum;
    if (type === ChannelType.GuildCategory || type === 4) return ChannelType.GuildCategory;
    return ChannelType.GuildText;
  };

  // 4. Sync Categories & Channels (Reconcile / In-place update + Create)
  const matchedChannelIds = new Set();

  // Process categories
  if (Array.isArray(backupData.channels?.categories)) {
    for (const catData of backupData.channels.categories) {
      let category = guild.channels.cache.find(
        (ch) => ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === catData.name.toLowerCase()
      );

      if (category) {
        matchedChannelIds.add(category.id);
        try {
          await category.edit({
            name: catData.name,
            permissionOverwrites: resolvePermissions(catData.permissions, guild),
          });
          await delay(100);
        } catch {
          // Ignore edit error
        }
      } else {
        try {
          category = await guild.channels.create({
            name: catData.name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: resolvePermissions(catData.permissions, guild),
          });
          matchedChannelIds.add(category.id);
          await delay(150);
        } catch {
          // Ignore category create error
        }
      }

      // Process children of category
      if (Array.isArray(catData.children)) {
        for (const childData of catData.children) {
          const chType = mapType(childData.type, childData.isNews);
          let channel = guild.channels.cache.find(
            (ch) =>
              !matchedChannelIds.has(ch.id) &&
              (ch.type === chType || (chType === ChannelType.GuildAnnouncement && ch.type === ChannelType.GuildText) || (chType === ChannelType.GuildText && ch.type === ChannelType.GuildAnnouncement)) &&
              ch.name.toLowerCase() === childData.name.toLowerCase()
          );

          if (channel) {
            matchedChannelIds.add(channel.id);
            try {
              const editOptions = {
                name: childData.name,
                parent: category ? category.id : undefined,
                permissionOverwrites: resolvePermissions(childData.permissions, guild),
              };
              if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildForum) {
                editOptions.topic = childData.topic || null;
                editOptions.nsfw = Boolean(childData.nsfw);
                editOptions.rateLimitPerUser = childData.rateLimitPerUser || 0;
              }
              await channel.edit(editOptions);
              await delay(100);
            } catch {
              // Ignore edit error
            }

            const hasChildMessages = Array.isArray(childData.messages) && childData.messages.length > 0;
            if ((channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) && (hasChildMessages || options.cleanMessages)) {
              await restoreChannelMessages(channel, childData.messages || [], {
                cleanMessages: Boolean(options.cleanMessages),
                unpinPrevious: Boolean(options.unpinPrevious),
              });
            }
          } else {
            try {
              const createOptions = {
                name: childData.name,
                type: chType,
                parent: category ? category.id : undefined,
                permissionOverwrites: resolvePermissions(childData.permissions, guild),
              };
              if (chType === ChannelType.GuildText || chType === ChannelType.GuildAnnouncement || chType === ChannelType.GuildForum) {
                if (childData.topic) createOptions.topic = childData.topic;
                if (typeof childData.nsfw === 'boolean') createOptions.nsfw = childData.nsfw;
                if (childData.rateLimitPerUser) createOptions.rateLimitPerUser = childData.rateLimitPerUser;
              }

              const createdChannel = await guild.channels.create(createOptions);
              matchedChannelIds.add(createdChannel.id);

              if ((chType === ChannelType.GuildText || chType === ChannelType.GuildAnnouncement) && Array.isArray(childData.messages) && childData.messages.length > 0) {
                await restoreChannelMessages(createdChannel, childData.messages);
              }
              await delay(150);
            } catch {
              // Ignore create error
            }
          }
        }
      }
    }
  }

  // Process other standalone channels
  if (Array.isArray(backupData.channels?.others)) {
    for (const otherData of backupData.channels.others) {
      const chType = mapType(otherData.type, otherData.isNews);
      let channel = guild.channels.cache.find(
        (ch) =>
          !matchedChannelIds.has(ch.id) &&
          (ch.type === chType || (chType === ChannelType.GuildAnnouncement && ch.type === ChannelType.GuildText) || (chType === ChannelType.GuildText && ch.type === ChannelType.GuildAnnouncement)) &&
          ch.name.toLowerCase() === otherData.name.toLowerCase()
      );

      if (channel) {
        matchedChannelIds.add(channel.id);
        try {
          const editOptions = {
            name: otherData.name,
            parent: null,
            permissionOverwrites: resolvePermissions(otherData.permissions, guild),
          };
          if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildForum) {
            editOptions.topic = otherData.topic || null;
            editOptions.nsfw = Boolean(otherData.nsfw);
            editOptions.rateLimitPerUser = otherData.rateLimitPerUser || 0;
          }
          await channel.edit(editOptions);
          await delay(100);
        } catch {
          // Ignore edit error
        }

        const hasOtherMessages = Array.isArray(otherData.messages) && otherData.messages.length > 0;
        if ((channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) && (hasOtherMessages || options.cleanMessages)) {
          await restoreChannelMessages(channel, otherData.messages || [], {
            cleanMessages: Boolean(options.cleanMessages),
            unpinPrevious: Boolean(options.unpinPrevious),
          });
        }
      } else {
        try {
          const createOptions = {
            name: otherData.name,
            type: chType,
            permissionOverwrites: resolvePermissions(otherData.permissions, guild),
          };
          if (chType === ChannelType.GuildText || chType === ChannelType.GuildAnnouncement || chType === ChannelType.GuildForum) {
            if (otherData.topic) createOptions.topic = otherData.topic;
            if (typeof otherData.nsfw === 'boolean') createOptions.nsfw = otherData.nsfw;
            if (otherData.rateLimitPerUser) createOptions.rateLimitPerUser = otherData.rateLimitPerUser;
          }

          const createdChannel = await guild.channels.create(createOptions);
          matchedChannelIds.add(createdChannel.id);

          if ((chType === ChannelType.GuildText || chType === ChannelType.GuildAnnouncement) && Array.isArray(otherData.messages) && otherData.messages.length > 0) {
            await restoreChannelMessages(createdChannel, otherData.messages);
          }
          await delay(150);
        } catch {
          // Ignore create error
        }
      }
    }
  }

  // 5. Delete obsolete channels not present in backup
  if (options.clearGuildBeforeRestore !== false) {
    for (const [, ch] of guild.channels.cache) {
      if (!matchedChannelIds.has(ch.id) && ch.deletable) {
        try {
          await ch.delete();
          await delay(100);
        } catch {
          // Ignore deletion error (e.g. active community channels)
        }
      }
    }
  }

  // 6. Restore AFK channel
  if (backupData.afk?.name) {
    const afkChannel = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === backupData.afk.name.toLowerCase()
    );
    if (afkChannel) {
      try {
        await guild.setAFKChannel(afkChannel.id);
        if (backupData.afk.timeout) {
          await guild.setAFKTimeout(backupData.afk.timeout);
        }
      } catch {
        // Ignore AFK set error
      }
    }
  }

  // 7. Restore Community channel bindings
  try {
    const editOptions = {};

    if (backupData.rulesChannel) {
      const rulesCh = guild.channels.cache.find(
        (c) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.name.toLowerCase() === backupData.rulesChannel.toLowerCase()
      );
      if (rulesCh) editOptions.rulesChannel = rulesCh.id;
    }

    if (backupData.publicUpdatesChannel) {
      const updatesCh = guild.channels.cache.find(
        (c) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.name.toLowerCase() === backupData.publicUpdatesChannel.toLowerCase()
      );
      if (updatesCh) editOptions.publicUpdatesChannel = updatesCh.id;
    }

    if (backupData.systemChannel) {
      const systemCh = guild.channels.cache.find(
        (c) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.name.toLowerCase() === backupData.systemChannel.toLowerCase()
      );
      if (systemCh) editOptions.systemChannel = systemCh.id;
    }

    if (Object.keys(editOptions).length > 0 && typeof guild.edit === 'function') {
      await guild.edit(editOptions);
    }
  } catch {
    // Ignore community channel binding errors
  }

  // 8. Restore Widget channel
  if (backupData.widget && typeof guild.setWidgetSettings === 'function') {
    try {
      const widgetCh = backupData.widget.channel
        ? guild.channels.cache.find((c) => c.name.toLowerCase() === backupData.widget.channel.toLowerCase())
        : null;
      await guild.setWidgetSettings({
        enabled: Boolean(backupData.widget.enabled),
        channel: widgetCh ? widgetCh.id : null,
      });
    } catch {
      // Ignore widget set error
    }
  }

  // 9. Restore Custom Emojis (if provided)
  if (options.includeEmojis && Array.isArray(backupData.emojis) && backupData.emojis.length > 0 && guild.emojis?.create) {
    for (const emojiData of backupData.emojis) {
      if (!emojiData.name || !emojiData.url) continue;
      const existingEmoji = guild.emojis.cache.find((e) => e.name.toLowerCase() === emojiData.name.toLowerCase());
      if (!existingEmoji) {
        try {
          await guild.emojis.create({
            attachment: emojiData.url,
            name: emojiData.name.slice(0, 32),
          });
          await delay(200);
        } catch {
          // Ignore emoji creation errors
        }
      }
    }
  }
}
