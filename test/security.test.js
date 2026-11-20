const test = require('node:test');
const assert = require('node:assert/strict');
const { validEntry, generatePassword, safeEqual } = require('../lib/security');

test('validates credential records and rejects oversized or incomplete records', () => {
  assert.equal(validEntry({ site: 'example.com', username: 'mika', password: 'secret' }), true);
  assert.equal(validEntry({ site: '', username: 'mika', password: 'secret' }), false);
  assert.equal(validEntry({ site: 'example.com', username: 'mika', password: '' }), false);
  assert.equal(validEntry({ site: 'example.com', username: 'x'.repeat(513), password: 'secret' }), false);
  assert.equal(validEntry(null), false);
  assert.equal(validEntry([]), false);
});

test('generates passwords of requested length from the configured alphabet', () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
  for (const length of [12, 20, 64, 128]) {
    const password = generatePassword(length);
    assert.equal(password.length, length);
    assert.ok([...password].every((character) => alphabet.includes(character)));
  }
});

test('compares tokens safely and rejects different lengths or values', () => {
  assert.equal(safeEqual('same-token', 'same-token'), true);
  assert.equal(safeEqual('same-token', 'other-token'), false);
  assert.equal(safeEqual('a', 'aa'), false);
});
