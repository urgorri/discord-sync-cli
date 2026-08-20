import fs from 'node:fs';

/**
 * Validates whether a given Guild ID is a valid Discord Snowflake string.
 *
 * @param {string|number} guildId 
 * @returns {boolean}
 */
export function validateGuildId(guildId) {
  if (guildId === null || guildId === undefined) {
    return false;
  }
  const strId = String(guildId).trim();
  return /^\d{17,20}$/.test(strId);
}

/**
 * Validates a JSON file path. Checks if the file exists, is non-empty, and contains valid JSON.
 *
 * @param {string} filePath 
 * @returns {object} Parsed JSON data if valid.
 * @throws {Error} If file does not exist, is empty, or contains invalid JSON.
 */
export function validateJsonFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string.');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error(`File is empty: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.trim()) {
    throw new Error(`File is empty: ${filePath}`);
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON syntax in file "${filePath}": ${err.message}`);
  }
}

/**
 * Sanitizes and normalizes backup data to match the declarative sync schema.
 *
 * @param {object} raw - Parsed JSON backup data
 * @returns {object} Normalized backup data
 */
export function normalizeBackupData(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Backup data must be a valid JSON object.');
  }

  const data = { ...raw };

  // 1. Normalize AFK configuration
  if (typeof data.afk === 'string') {
    data.afk = {
      name: data.afk,
      timeout: 300,
    };
  } else if (data.afk && typeof data.afk === 'object') {
    data.afk = {
      name: data.afk.name || null,
      timeout: typeof data.afk.timeout === 'number' ? data.afk.timeout : 300,
    };
  } else {
    data.afk = null;
  }

  // 2. Normalize Widget configuration
  if (!data.widget || typeof data.widget !== 'object') {
    data.widget = {
      enabled: false,
      channel: null,
    };
  } else {
    data.widget = {
      enabled: Boolean(data.widget.enabled),
      channel: data.widget.channel || null,
    };
  }

  // 3. Normalize Collections
  data.roles = Array.isArray(data.roles) ? data.roles : [];
  data.bans = Array.isArray(data.bans) ? data.bans : [];
  data.emojis = Array.isArray(data.emojis) ? data.emojis : [];
  data.members = Array.isArray(data.members) ? data.members : [];

  // 4. Normalize Channels structure
  if (!data.channels || typeof data.channels !== 'object') {
    data.channels = { categories: [], others: [] };
  } else {
    data.channels.categories = Array.isArray(data.channels.categories) ? data.channels.categories : [];
    data.channels.others = Array.isArray(data.channels.others) ? data.channels.others : [];
  }

  // 5. Ensure channel types are supported (0 = GuildText, 2 = GuildVoice, 5 = GuildAnnouncement, 15 = GuildForum)
  const sanitizeChannel = (ch) => {
    if (!ch || typeof ch !== 'object') return ch;
    if (ch.type === undefined || ch.type === null || ![0, 2, 5, 15].includes(ch.type)) {
      ch.type = ch.isNews ? 5 : 0;
    }
    if (!Array.isArray(ch.permissions)) ch.permissions = [];
    if (!Array.isArray(ch.messages)) ch.messages = [];
    if (!Array.isArray(ch.threads)) ch.threads = [];
    return ch;
  };

  data.channels.categories.forEach((cat) => {
    if (Array.isArray(cat.children)) {
      cat.children.forEach(sanitizeChannel);
    } else {
      cat.children = [];
    }
  });

  data.channels.others.forEach(sanitizeChannel);

  return data;
}
