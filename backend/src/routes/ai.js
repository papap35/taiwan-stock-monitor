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

module.exports = router;
