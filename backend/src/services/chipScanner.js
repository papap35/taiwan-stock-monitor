/**
 * chipScanner.js
 * 籌碼異動掃描服務（P7-34）
 * 對觀察池股票每日收盤後執行籌碼異動偵測，設定為記憶體儲存
 */

const twse = require('./twse');
const { scanWatchPool } = require('../utils/chipScan');

const DEFAULT_POOL = twse.POPULAR_STOCKS.slice(0, 20);

const _settings = {
  enabled: process.env.CHIP_SCAN_ENABLED === 'true',
  pool: DEFAULT_POOL,
};

function getSettings() {
  return { ..._settings };
}

function updateSettings(patch) {
  if (typeof patch.enabled === 'boolean') _settings.enabled = patch.enabled;
  if (Array.isArray(patch.pool)) {
    _settings.pool = patch.pool.map(c => String(c).trim()).filter(Boolean).slice(0, 50);
  }
}

/**
 * 對觀察池執行籌碼異動掃描
 * @param {string[]} pool
 * @returns {Promise<{code:string, reason:string}[]>}
 */
async function runChipScan(pool = _settings.pool) {
  const instDataByCode = {};
  const candlesByCode = {};

  for (const code of pool) {
    try {
      const [inst, hist] = await Promise.all([
        twse.fetchInstitutionalStock(code, 1),
        twse.fetchHistory(code, 1),
      ]);
      instDataByCode[code] = inst;
      candlesByCode[code] = hist;
    } catch (e) {
      console.warn(`[ChipScan] ${code} 資料抓取失敗:`, e.message);
    }
  }

  return scanWatchPool(pool, instDataByCode, candlesByCode);
}

module.exports = {
  getSettings,
  updateSettings,
  runChipScan,
  DEFAULT_POOL,
};
