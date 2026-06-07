const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const twse = require('../services/twse');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `你是一位專業的台股投資分析師，擁有豐富的技術分析和基本面分析經驗。
請用繁體中文回覆，語氣專業但易懂。
分析時請包含：
1. 當前盤勢解讀
2. 技術指標觀察（如有數據）
3. 操作建議（明確說明買入/持有/減碼/賣出/觀望）
4. 停損/停利建議價位
5. 風險提示

重要聲明：以下分析僅供參考，不構成投資建議，投資人應自行判斷風險。`;

/**
 * 設定 SSE 必要的 headers 並立即 flush
 * 缺少 flushHeaders() 會讓 chunk 卡在 Express 緩衝區直到連線結束
 * X-Accel-Buffering: no 告訴 Railway / Nginx 不要緩衝這個回應
 */
function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 關閉 Nginx 緩衝（Railway 需要）
  res.flushHeaders();                        // 立即把 headers 推出去，建立 SSE 通道
}

function writeChunk(res, text) {
  res.write(`data: ${JSON.stringify({ text })}\n\n`);
  // 確保每個 chunk 立即推送，不等緩衝區滿
  if (typeof res.flush === 'function') res.flush();
}

function writeError(res, message) {
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  if (typeof res.flush === 'function') res.flush();
  res.end();
}

// POST /api/ai/analyze — 個股 AI 分析
router.post('/analyze', async (req, res) => {
  const { code, name, analysisType = 'full' } = req.body;
  if (!code) return res.status(400).json({ error: '請提供股票代號' });

  // 先抓最新報價
  let quote = null;
  try {
    const quotes = await twse.fetchRealtimeQuotes([code]);
    quote = quotes[code];
  } catch {/* 繼續，無即時資料 */}

  const typePrompts = {
    full: '進行全面投資分析，包含技術面、基本面觀察與操作建議',
    buy: '評估目前是否為適合的買入時機，分析支撐位和進場點位',
    sell: '評估目前是否應賣出或減碼，分析壓力位和出場時機',
    risk: '進行風險評估，包含下跌風險、流動性風險、產業風險',
    technical: '進行技術分析，分析趨勢、均線、成交量、型態',
  };

  const quoteContext = quote
    ? `\n目前即時報價：
   - 現價：${quote.price} 元（${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent}%）
   - 開盤：${quote.open}，最高：${quote.high}，最低：${quote.low}
   - 成交量：${(quote.volume / 1000).toFixed(0)} 千張`
    : '\n（目前無即時報價，請依據最新收盤資料分析）';

  const prompt = `請對台股「${name || code}（${code}）」${typePrompts[analysisType] || typePrompts.full}。${quoteContext}

請以條列格式，分項說明各分析重點，最後給出一句清晰的操作結論。`;

  initSSE(res);

  try {
    const stream = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        writeChunk(res, chunk.delta.text);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[AI] /analyze error:', err.message, err.status ?? '');
    writeError(res, `AI 分析失敗：${err.message}`);
  }
});

// POST /api/ai/market — 大盤 AI 解讀
router.post('/market', async (req, res) => {
  const { taiex, breadth } = req.body;

  let marketData = '（前端未傳入大盤資料）';
  if (taiex) {
    marketData = `
加權指數：${taiex.value?.toLocaleString()} 點
今日漲跌：${taiex.changePercent >= 0 ? '+' : ''}${taiex.changePercent}%（${taiex.change >= 0 ? '+' : ''}${taiex.change} 點）
開盤：${taiex.open?.toLocaleString()}，最高：${taiex.high?.toLocaleString()}，最低：${taiex.low?.toLocaleString()}
成交量：約 ${taiex.volume ? (taiex.volume / 100).toFixed(0) : '?'} 億`;
  }
  if (breadth) {
    marketData += `\n上漲：${breadth.up} 家，下跌：${breadth.down} 家，平盤：${breadth.flat} 家`;
  }

  const prompt = `請解讀今日台灣股市盤勢：
${marketData}

請提供：
1. 盤面整體解讀（多空力道）
2. 類股輪動觀察
3. 今日操作建議（積極/保守/觀望）
4. 明日盤勢展望

請簡潔有力，每點不超過 2 句。`;

  initSSE(res);

  try {
    const stream = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        writeChunk(res, chunk.delta.text);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[AI] /market error:', err.message, err.status ?? '');
    writeError(res, `AI 分析失敗：${err.message}`);
  }
});

// POST /api/ai/portfolio — 投資組合每日簡報（開盤前 / 收盤後）
router.post('/portfolio', async (req, res) => {
  const { holdings = [], type = 'open' } = req.body;
  if (!holdings.length) return res.status(400).json({ error: '持股清單為空' });

  initSSE(res);

  try {
    // 並行抓取所有需要的市場資料
    const codes = [...new Set(holdings.map(h => h.code))];
    const [quotesRes, taiexRes, breadthRes, valuationRes] = await Promise.allSettled([
      twse.fetchRealtimeQuotes(codes),
      twse.fetchTaiex(),
      twse.fetchMarketBreadth(),
      twse.fetchValuation(),
    ]);

    const quotes     = quotesRes.status     === 'fulfilled' ? quotesRes.value     : {};
    const taiex      = taiexRes.status      === 'fulfilled' ? taiexRes.value      : null;
    const breadth    = breadthRes.status    === 'fulfilled' ? breadthRes.value    : null;
    const valuation  = valuationRes.status  === 'fulfilled' ? valuationRes.value  : {};

    // ── 大盤摘要文字 ──────────────────────────────
    const now = new Date();
    const twTime = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    let marketCtx = `報告時間：${twTime}\n`;

    if (taiex) {
      const dir = taiex.changePercent > 0 ? '上漲' : taiex.changePercent < 0 ? '下跌' : '平盤';
      marketCtx += `加權指數：${taiex.value?.toLocaleString()} 點，${dir} ${Math.abs(taiex.changePercent)}%（${taiex.change >= 0 ? '+' : ''}${taiex.change} 點）\n`;
      marketCtx += `今日開盤：${taiex.open?.toLocaleString()}，最高：${taiex.high?.toLocaleString()}，最低：${taiex.low?.toLocaleString()}\n`;
    }
    if (breadth) {
      const total = breadth.up + breadth.down + breadth.flat;
      const upPct = total ? (breadth.up / total * 100).toFixed(0) : 0;
      marketCtx += `市場廣度：上漲 ${breadth.up} 家（${upPct}%），下跌 ${breadth.down} 家，平盤 ${breadth.flat} 家\n`;
      const mood = breadth.up > breadth.down * 1.5 ? '多方強勢'
        : breadth.down > breadth.up * 1.5 ? '空方主導'
        : '多空拉鋸';
      marketCtx += `市場氣氛：${mood}\n`;
    }

    // ── 逐一建構每檔持股的分析素材 ───────────────
    const strategyLabel = { swing: '波段操作', long: '長期持有', trade: '短線交易' };

    const holdingsCtx = holdings.map((h, idx) => {
      const q = quotes[h.code];
      const v = valuation[h.code];

      const price    = q?.price ?? 0;
      const prevClose = q?.prevClose ?? 0;
      const cost       = parseFloat(h.cost) || 0;
      // 總股數 = 整張 × 1000 + 零股
      const totalShares = (parseInt(h.shares) || 0) * 1000 + (parseInt(h.oddLotShares) || 0);
      const pnlPct   = cost && price ? +((price / cost - 1) * 100).toFixed(2) : null;
      const pnlAmt   = totalShares && cost && price ? Math.round((price - cost) * totalShares) : null;
      const mktVal   = totalShares && price ? Math.round(price * totalShares) : null;
      const strategy = strategyLabel[h.strategy] || h.strategy || '未設定';

      let block = `\n── ${idx + 1}. ${h.name}（${h.code}）──\n`;

      // 現價與損益
      if (price) {
        block += `現價：${price} 元`;
        if (q?.changePercent !== undefined) {
          const dir = q.changePercent > 0 ? '▲' : q.changePercent < 0 ? '▼' : '—';
          block += `（今日 ${dir}${Math.abs(q.changePercent)}%）`;
        }
        block += '\n';
      }

      if (cost && totalShares) {
        const lotsLabel = h.shares    ? `${h.shares}張`    : '';
        const oddLabel  = h.oddLotShares ? `${h.oddLotShares}股` : '';
        const holdLabel = [lotsLabel, oddLabel].filter(Boolean).join('+') || `${totalShares}股`;
        block += `持有：${holdLabel}（${totalShares.toLocaleString()}股），成本 ${cost} 元`;
      } else if (cost) {
        block += `持有成本：${cost} 元`;
      }
      if (mktVal) block += `，市值約 ${mktVal.toLocaleString()} 元`;
      block += '\n';

      if (pnlPct !== null) {
        const pnlDir = pnlPct >= 0 ? '獲利' : '虧損';
        block += `持股損益：${pnlDir} ${Math.abs(pnlPct)}%`;
        if (pnlAmt !== null) block += `（${pnlAmt >= 0 ? '+' : ''}${pnlAmt.toLocaleString()} 元）`;
        block += '\n';
      }

      block += `操作策略：${strategy}\n`;
      if (h.target)   block += `目標價：${h.target} 元（距現價 ${price ? ((h.target / price - 1) * 100).toFixed(1) : '?'}%）\n`;
      if (h.stopLoss) block += `停損價：${h.stopLoss} 元（距現價 ${price ? ((h.stopLoss / price - 1) * 100).toFixed(1) : '?'}%）\n`;

      // 今日盤中資訊
      if (q?.high && q?.low) {
        block += `今日區間：${q.low}~${q.high} 元\n`;
        if (price && q.high !== q.low) {
          const pos = ((price - q.low) / (q.high - q.low) * 100).toFixed(0);
          block += `現價位於今日區間第 ${pos}% 位置\n`;
        }
      }

      // 基本面
      if (v?.pe)    block += `本益比：${v.pe} 倍（${v.pe < 15 ? '偏低' : v.pe > 30 ? '偏高' : '正常'}）\n`;
      if (v?.yield) block += `殖利率：${v.yield}%（${v.yield >= 5 ? '高殖利率' : v.yield >= 3 ? '中等' : '偏低'}）\n`;
      if (v?.pb)    block += `股價淨值比：${v.pb} 倍\n`;
      if (v?.period) block += `財報：${v.period}\n`;

      if (h.notes) block += `備註：${h.notes}\n`;

      return block;
    }).join('');

    // ── 計算整體持倉狀況 ─────────────────────────
    let portfolioSummary = '';
    const totalSharesFn = h => (parseInt(h.shares) || 0) * 1000 + (parseInt(h.oddLotShares) || 0);
    const withCost = holdings.filter(h => h.cost && totalSharesFn(h) > 0 && quotes[h.code]?.price);
    if (withCost.length) {
      const totalCost = withCost.reduce((s, h) => s + h.cost * totalSharesFn(h), 0);
      const totalMkt  = withCost.reduce((s, h) => s + quotes[h.code].price * totalSharesFn(h), 0);
      const totalPnlPct = +((totalMkt / totalCost - 1) * 100).toFixed(2);
      portfolioSummary = `\n── 整體持倉摘要 ──\n總成本：${totalCost.toLocaleString()} 元\n目前市值：${totalMkt.toLocaleString()} 元\n整體損益：${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct}%（${(totalMkt - totalCost) >= 0 ? '+' : ''}${(totalMkt - totalCost).toLocaleString()} 元）\n`;
    }

    // ── 根據報告類型決定 Prompt ─────────────────
    const reportType = type === 'close'
      ? `【收盤後持倉檢討與明日策略】`
      : `【開盤前操作策略建議】`;

    const typeInstruction = type === 'close'
      ? `請針對今日收盤結果：
1. 逐一檢討每檔持股今日表現，說明盤中發生了什麼
2. 判斷各股明日走勢預期
3. 是否需要調整停損或停利設定
4. 明日開盤前的應對方案（是否要設定掛單）
5. 整體倉位建議：是否需要調整持股比重或資金配置`
      : `請針對今日盤前：
1. 逐一說明每檔持股今日的觀察重點（支撐/壓力位、成交量、籌碼）
2. 提出具體的操作預案：若開盤上漲/下跌時的應對
3. 今日是否有加碼或減碼的機會
4. 需要特別注意的風險（個股或總體）
5. 整體盤勢對持股的影響分析`;

    const prompt = `你是一位幫助投資人管理台股持倉的專業分析師。

${reportType}

═══════════════════════════════
【當前市場狀況】
${marketCtx}
═══════════════════════════════
【投資人持股】
${holdingsCtx}${portfolioSummary}
═══════════════════════════════

${typeInstruction}

最後請給出一句今日最重要的操作重點（一句話結論）。

⚠️ 以上分析僅供參考，不構成投資建議，請自行承擔投資風險。`;

    const stream = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        writeChunk(res, chunk.delta.text);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[AI] /portfolio error:', err.message, err.status ?? '');
    writeError(res, `持倉分析失敗：${err.message}`);
  }
});

module.exports = router;
