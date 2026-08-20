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
