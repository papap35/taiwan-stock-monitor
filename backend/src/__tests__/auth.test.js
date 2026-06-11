/**
 * backend/src/__tests__/auth.test.js
 * 測試 resolveUserId middleware 與 getUserIdFromToken
 * 使用 Node.js 內建 test runner（node --test）
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveUserId } = require('../middleware/auth');
const sb = require('../services/supabase');

describe('getUserIdFromToken', () => {
  it('returns null when Supabase is not enabled', async () => {
    // 測試環境未設定 SUPABASE_URL/KEY，getClient() 應為 null
    const userId = await sb.getUserIdFromToken('some-token');
    assert.equal(userId, null);
  });

  it('returns null when token is empty', async () => {
    const userId = await sb.getUserIdFromToken('');
    assert.equal(userId, null);
  });
});

describe('resolveUserId middleware', () => {
  function makeReq(authHeader) {
    return { headers: authHeader ? { authorization: authHeader } : {} };
  }

  it('falls back to DEFAULT_USER_ID when no Authorization header', async () => {
    const req = makeReq();
    await new Promise(resolve => resolveUserId(req, {}, resolve));
    assert.equal(req.userId, sb.DEFAULT_USER_ID);
  });

  it('falls back to DEFAULT_USER_ID when token is invalid (Supabase disabled)', async () => {
    const req = makeReq('Bearer invalid-token');
    await new Promise(resolve => resolveUserId(req, {}, resolve));
    assert.equal(req.userId, sb.DEFAULT_USER_ID);
  });

  it('ignores malformed Authorization header (no Bearer prefix)', async () => {
    const req = makeReq('Basic abc123');
    await new Promise(resolve => resolveUserId(req, {}, resolve));
    assert.equal(req.userId, sb.DEFAULT_USER_ID);
  });
});
