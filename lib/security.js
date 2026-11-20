const crypto = require('crypto');

function validEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  return typeof entry.site === 'string' && entry.site.trim().length > 0 && entry.site.length <= 253 &&
    typeof entry.username === 'string' && entry.username.length <= 512 &&
    typeof entry.password === 'string' && entry.password.length > 0 && entry.password.length <= 4096;
}

function generatePassword(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
  const limit = Math.floor(256 / chars.length) * chars.length;
  let output = '';
  while (output.length < length) {
    const bytes = crypto.randomBytes(Math.max(16, length - output.length));
    for (const byte of bytes) {
      if (byte < limit) output += chars[byte % chars.length];
      if (output.length === length) break;
    }
  }
  return output;
}

function safeEqual(a, b) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = { validEntry, generatePassword, safeEqual };
