/**
 * backend/src/middleware/auth.js
 * 解析前端帶來的 Supabase access token，將 user id 寫入 req.userId。
 * 未登入或 token 無效時，fallback 為 DEFAULT_USER_ID（向下相容單用戶模式）。
 */
const sb = require('../services/supabase');

async function resolveUserId(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  req.userId = token ? (await sb.getUserIdFromToken(token)) || sb.DEFAULT_USER_ID : sb.DEFAULT_USER_ID;
  next();
}

module.exports = { resolveUserId };
