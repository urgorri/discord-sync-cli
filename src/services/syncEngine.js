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
 * @returns {Promise<object>}
 */
export async function exportServerData(guild) {
  // Ensure caches are fresh
  await Promise.allSettled([
    guild.channels.fetch(),
    guild.roles.fetch(),
  ]);

  // 1. Roles (sorted from lowest position to highest)
  const roles = guild.roles.cache
    .filter((role) => !role.managed)
    .sort((a, b) => a.position - b.position)
    .map((role) => ({
      name: role.name,
      color: role.hexColor === '#000000' ? '#000000' : role.hexColor,
      hoist: role.hoist,
      permissions: role.permissions.bitfield.toString(),
      mentionable: role.mentionable,
      position: role.position,
      isEveryone: role.id === guild.id,
    }));

  // 2. Channels & Categories
  const categoriesData = [];
  const othersData = [];

  const categories = guild.channels.cache
    .filter((ch) => ch.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  for (const [, category] of categories) {
    const catChildren = guild.channels.cache
      .filter((ch) => ch.parentId === category.id)
      .sort((a, b) => a.position - b.position);

    const children = [];
    for (const [, child] of catChildren) {
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

  const orphanChannels = guild.channels.cache
    .filter((ch) => !ch.parentId && ch.type !== ChannelType.GuildCategory && !ch.isThread())
    .sort((a, b) => a.position - b.position);

  for (const [, ch] of orphanChannels) {
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
    emojis: [],
    members: [],
    createdTimestamp: Date.now(),
    guildID: guild.id,
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
 * Restores predefined messages to a text-based channel.
 *
 * @param {import('discord.js').TextChannel|import('discord.js').NewsChannel} channel
 * @param {Array<object>} messages
 */
export async function restoreChannelMessages(channel, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;

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

        try {
          const webhook = await channel.createWebhook({
            name: msg.username.slice(0, 80) || 'SyncBot',
            avatar: resolvedAvatar,
          });

          sentMessage = await webhook.send({
            content: msg.content?.slice(0, 2000) || undefined,
            embeds: Array.isArray(msg.embeds) ? msg.embeds.slice(0, 10) : [],
            username: msg.username.slice(0, 80),
            avatarURL: resolvedAvatar,
          });

          await webhook.delete().catch(() => {});
        } catch {
          // If webhook creation fails, fallback to direct channel message
          sentMessage = await channel.send({
            content: msg.content?.slice(0, 2000) || undefined,
            embeds: Array.isArray(msg.embeds) ? msg.embeds.slice(0, 10) : [],
          });
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
 * Restores a server backup state to a remote Discord guild.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} backupData
 * @param {object} [options]
 * @param {boolean} [options.clearGuildBeforeRestore=true]
 */
export async function restoreServerData(guild, backupData, options = {}) {
  const { clearGuildBeforeRestore = true } = options;
  let leftoverChannels = [];

  if (clearGuildBeforeRestore) {
    leftoverChannels = await clearGuild(guild);
  }

  // 1. Restore guild name if present
  if (backupData.name && backupData.name !== guild.name) {
    try {
      await guild.setName(backupData.name);
    } catch {
      // Ignore if bot lacks permissions to rename server
    }
  }

  // 2. Restore Roles sequentially
  if (Array.isArray(backupData.roles)) {
    // Sort so @everyone comes first, then by ascending position
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
        try {
          const roleCreateOptions = {
            name: roleData.name?.slice(0, 100) || 'new-role',
            hoist: Boolean(roleData.hoist),
            permissions: roleData.permissions ? BigInt(roleData.permissions) : 0n,
            mentionable: Boolean(roleData.mentionable),
          };

          if (roleData.color && roleData.color !== '#000000') {
            roleCreateOptions.colors = {
              primaryColor: roleData.color,
            };
          }

          await guild.roles.create(roleCreateOptions);
          await delay(150);
        } catch {
          // Continue if single role creation fails
        }
      }
    }
    // Refresh roles cache after creation
    await guild.roles.fetch();
  }

  // Helper to map channel types correctly
  const mapType = (type, isNews) => {
    if (type === ChannelType.GuildVoice || type === 2) return ChannelType.GuildVoice;
    if (type === ChannelType.GuildAnnouncement || type === 5 || isNews) return ChannelType.GuildAnnouncement;
    if (type === ChannelType.GuildForum || type === 15) return ChannelType.GuildForum;
    if (type === ChannelType.GuildCategory || type === 4) return ChannelType.GuildCategory;
    return ChannelType.GuildText;
  };

  // 3. Restore Categories and Child Channels
  if (backupData.channels?.categories) {
    for (const catData of backupData.channels.categories) {
      let createdCategory = null;
      try {
        createdCategory = await guild.channels.create({
          name: catData.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: resolvePermissions(catData.permissions, guild),
        });
        await delay(150);
      } catch {
        // Fallback without category
      }

      if (Array.isArray(catData.children)) {
        for (const childData of catData.children) {
          try {
            const chType = mapType(childData.type, childData.isNews);
            const channelOptions = {
              name: childData.name,
              type: chType,
              parent: createdCategory ? createdCategory.id : undefined,
              permissionOverwrites: resolvePermissions(childData.permissions, guild),
            };

            if (chType === ChannelType.GuildText || chType === ChannelType.GuildAnnouncement || chType === ChannelType.GuildForum) {
              if (childData.topic) channelOptions.topic = childData.topic;
              if (typeof childData.nsfw === 'boolean') channelOptions.nsfw = childData.nsfw;
              if (childData.rateLimitPerUser) channelOptions.rateLimitPerUser = childData.rateLimitPerUser;
            }

            const createdChannel = await guild.channels.create(channelOptions);
            
            // Restore messages if present
            if ((chType === ChannelType.GuildText || chType === ChannelType.GuildAnnouncement) && Array.isArray(childData.messages) && childData.messages.length > 0) {
              await restoreChannelMessages(createdChannel, childData.messages);
            }

            await delay(150);
          } catch {
            // Continue with other channels
          }
        }
      }
    }
  }

  // 4. Restore Other Channels (standalone without category)
  if (Array.isArray(backupData.channels?.others)) {
    for (const otherData of backupData.channels.others) {
      try {
        const chType = mapType(otherData.type, otherData.isNews);
        const channelOptions = {
          name: otherData.name,
          type: chType,
          permissionOverwrites: resolvePermissions(otherData.permissions, guild),
        };

        if (chType === ChannelType.GuildText || chType === ChannelType.GuildAnnouncement || chType === ChannelType.GuildForum) {
          if (otherData.topic) channelOptions.topic = otherData.topic;
          if (typeof otherData.nsfw === 'boolean') channelOptions.nsfw = otherData.nsfw;
          if (otherData.rateLimitPerUser) channelOptions.rateLimitPerUser = otherData.rateLimitPerUser;
        }

        const createdChannel = await guild.channels.create(channelOptions);

        // Restore messages if present
        if ((chType === ChannelType.GuildText || chType === ChannelType.GuildAnnouncement) && Array.isArray(otherData.messages) && otherData.messages.length > 0) {
          await restoreChannelMessages(createdChannel, otherData.messages);
        }

        await delay(150);
      } catch {
        // Continue with next channel
      }
    }
  }

  // Refresh channels cache
  await guild.channels.fetch();

  // 5. Restore AFK channel if configured
  if (backupData.afk && backupData.afk.name) {
    try {
      const afkChannel = guild.channels.cache.find(
        (ch) => ch.name === backupData.afk.name && ch.type === ChannelType.GuildVoice
      );
      if (afkChannel) {
        await guild.setAFKChannel(afkChannel.id);
        if (typeof backupData.afk.timeout === 'number') {
          await guild.setAFKTimeout(backupData.afk.timeout);
        }
      }
    } catch {
      // Ignore AFK configuration errors
    }
  }

  // 6. Restore Community & System Channels
  if (backupData.rulesChannel) {
    try {
      const rulesCh = guild.channels.cache.find(
        (ch) => ch.name === backupData.rulesChannel && (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
      );
      if (rulesCh) {
        await guild.setRulesChannel(rulesCh.id);
      }
    } catch {
      // Ignore if community feature is disabled or bot lacks permissions
    }
  }

  if (backupData.publicUpdatesChannel) {
    try {
      const updatesCh = guild.channels.cache.find(
        (ch) => ch.name === backupData.publicUpdatesChannel && (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
      );
      if (updatesCh) {
        await guild.setPublicUpdatesChannel(updatesCh.id);
      }
    } catch {
      // Ignore if community feature is disabled or bot lacks permissions
    }
  }

  if (backupData.systemChannel) {
    try {
      const sysCh = guild.channels.cache.find(
        (ch) => ch.name === backupData.systemChannel && ch.type === ChannelType.GuildText
      );
      if (sysCh) {
        await guild.setSystemChannel(sysCh.id);
      }
    } catch {
      // Ignore if bot lacks permissions
    }
  }

  // 7. Clean up any leftover community channels that could not be deleted prior to re-binding
  if (Array.isArray(leftoverChannels) && leftoverChannels.length > 0) {
    for (const oldChannel of leftoverChannels) {
      try {
        await oldChannel.delete();
        await delay(100);
      } catch {
        // Silently ignore if already removed
      }
    }
    // Final refresh of channels cache
    await guild.channels.fetch();
  }
}
