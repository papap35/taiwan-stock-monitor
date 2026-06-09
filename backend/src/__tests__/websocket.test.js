/**
 * backend/src/__tests__/websocket.test.js
 * 測試 websocket.js 的純邏輯部分（不啟動真實 WebSocket server）
 * - collectSubscribedCodes：收集所有 client 的訂閱代號
 * - broadcast：只對 OPEN 狀態的 client 發送
 * 使用 Node.js 內建 test runner（node --test）
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

// ─── 輔助：建立 mock ws client ────────────────────────────────────────────
function makeMockClient(readyState = WebSocket.OPEN, subscribedCodes = []) {
  const messages = [];
  return {
    readyState,
    _subscribedCodes: subscribedCodes,
    send: (msg) => messages.push(msg),
    _messages: messages,
  };
}

// ─── 直接測試 websocket.js 抽出的純邏輯，不 import 整個模組（避免 ws.Server 副作用）
// 把 collectSubscribedCodes / broadcast 邏輯 inline 複製成可測試的 factory

function makeWebSocketLogic(clients) {
  function collectSubscribedCodes() {
    const codes = new Set();
    clients.forEach(client => {
      if (Array.isArray(client._subscribedCodes)) {
        client._subscribedCodes.forEach(c => codes.add(c));
      }
    });
    return codes;
  }

  function broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload, ts: Date.now() });
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  return { collectSubscribedCodes, broadcast };
}

// ─── collectSubscribedCodes ───────────────────────────────────────────────
describe('collectSubscribedCodes', () => {
  it('returns empty Set when no clients', () => {
    const { collectSubscribedCodes } = makeWebSocketLogic([]);
    const codes = collectSubscribedCodes();
    assert.equal(codes.size, 0);
  });

  it('collects codes from a single client', () => {
    const clients = [makeMockClient(WebSocket.OPEN, ['2330', '2317'])];
    const { collectSubscribedCodes } = makeWebSocketLogic(clients);
    const codes = collectSubscribedCodes();
    assert.equal(codes.size, 2);
    assert.ok(codes.has('2330'));
    assert.ok(codes.has('2317'));
  });

  it('merges codes from multiple clients and deduplicates', () => {
    const clients = [
      makeMockClient(WebSocket.OPEN, ['2330', '2317']),
      makeMockClient(WebSocket.OPEN, ['2330', '2454']), // 2330 重複
      makeMockClient(WebSocket.OPEN, ['6505']),
    ];
    const { collectSubscribedCodes } = makeWebSocketLogic(clients);
    const codes = collectSubscribedCodes();
    assert.equal(codes.size, 4); // 2330, 2317, 2454, 6505
    assert.ok(codes.has('2330'));
    assert.ok(codes.has('2317'));
    assert.ok(codes.has('2454'));
    assert.ok(codes.has('6505'));
  });

  it('ignores clients without _subscribedCodes', () => {
    const clients = [
      makeMockClient(WebSocket.OPEN, ['2330']),
      { readyState: WebSocket.OPEN }, // 無 _subscribedCodes
    ];
    const { collectSubscribedCodes } = makeWebSocketLogic(clients);
    const codes = collectSubscribedCodes();
    assert.equal(codes.size, 1);
    assert.ok(codes.has('2330'));
  });

  it('still collects from closed clients (collectSubscribedCodes does not filter by readyState)', () => {
    // 設計上 collectSubscribedCodes 只收集代號，不管 readyState
    const clients = [
      makeMockClient(WebSocket.CLOSED, ['2330']),
      makeMockClient(WebSocket.OPEN,   ['2317']),
    ];
    const { collectSubscribedCodes } = makeWebSocketLogic(clients);
    const codes = collectSubscribedCodes();
    // 兩者都應被收集（readyState 過濾只在 broadcast 時做）
    assert.ok(codes.has('2330'));
    assert.ok(codes.has('2317'));
  });
});

// ─── broadcast ────────────────────────────────────────────────────────────
describe('broadcast', () => {
  it('sends message to all OPEN clients', () => {
    const c1 = makeMockClient(WebSocket.OPEN);
    const c2 = makeMockClient(WebSocket.OPEN);
    const { broadcast } = makeWebSocketLogic([c1, c2]);

    broadcast('quotes', { '2330': { price: 950 } });

    assert.equal(c1._messages.length, 1);
    assert.equal(c2._messages.length, 1);
    const parsed = JSON.parse(c1._messages[0]);
    assert.equal(parsed.type, 'quotes');
    assert.equal(parsed.payload['2330'].price, 950);
    assert.ok(typeof parsed.ts === 'number');
  });

  it('skips CLOSED clients', () => {
    const open   = makeMockClient(WebSocket.OPEN);
    const closed = makeMockClient(WebSocket.CLOSED);
    const { broadcast } = makeWebSocketLogic([open, closed]);

    broadcast('taiex', { value: 20000 });

    assert.equal(open._messages.length, 1);
    assert.equal(closed._messages.length, 0);
  });

  it('skips CONNECTING clients', () => {
    const open        = makeMockClient(WebSocket.OPEN);
    const connecting  = makeMockClient(WebSocket.CONNECTING);
    const { broadcast } = makeWebSocketLogic([open, connecting]);

    broadcast('taiex', { value: 20000 });

    assert.equal(open._messages.length, 1);
    assert.equal(connecting._messages.length, 0);
  });

  it('does nothing when no clients', () => {
    const { broadcast } = makeWebSocketLogic([]);
    // 不應拋錯
    assert.doesNotThrow(() => broadcast('taiex', {}));
  });

  it('sends JSON with correct structure', () => {
    const client = makeMockClient(WebSocket.OPEN);
    const { broadcast } = makeWebSocketLogic([client]);

    broadcast('alerts_triggered', [{ id: '1', code: '2330' }]);

    const parsed = JSON.parse(client._messages[0]);
    assert.equal(parsed.type, 'alerts_triggered');
    assert.ok(Array.isArray(parsed.payload));
    assert.equal(parsed.payload[0].code, '2330');
    assert.ok(Number.isInteger(parsed.ts));
  });
});
