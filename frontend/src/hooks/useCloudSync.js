import { useState, useEffect, useCallback } from 'react';
import { api, setAuthTokenGetter } from '../services/api';
import { useStockStore } from '../stores/stockStore';
import { useAuth } from './useAuth';

const LAST_SYNC_KEY = 'cloud_sync_last_at';

/**
 * 雲端同步 hook（Supabase 離線優先策略）
 *
 * - 啟動時自動 pull（若 Supabase 已啟用）
 * - 每次 push 成功後記錄時間到 localStorage
 * - 提供手動 push / pull 方法
 * - P6-21：登入後自動帶上 access token，同步該使用者的雲端資料
 */
export function useCloudSync() {
  const [enabled,    setEnabled]    = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(() => localStorage.getItem(LAST_SYNC_KEY) || null);
  const [error,      setError]      = useState(null);

  const auth = useAuth();

  // 將取得 access token 的方法註冊給 api，供 /api/sync/* 帶 Authorization header
  useEffect(() => {
    setAuthTokenGetter(auth.getAccessToken);
  }, [auth.getAccessToken]);

  const { watchlist, groups, alerts, settings, importData } = useStockStore(s => ({
    watchlist:  s.watchlist,
    groups:     s.groups,
    alerts:     s.alerts ?? [],
    settings:   s.settings,
    importData: s.importData,
  }));

  // 檢查是否啟用
  useEffect(() => {
    api.getSyncStatus()
      .then(r => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  // 推送到 Supabase
  const push = useCallback(async () => {
    if (!enabled) return;
    setSyncing(true);
    setError(null);
    try {
      await api.syncPush({ watchlist, groups, alerts, settings });
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);
      setLastSyncAt(now);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }, [enabled, watchlist, groups, alerts, settings]);

  // 從 Supabase 拉取並覆蓋本機
  const pull = useCallback(async () => {
    if (!enabled) return;
    setSyncing(true);
    setError(null);
    try {
      const remote = await api.syncPull();
      // 只覆蓋有回傳資料的部分（null 表示 Supabase 無此資料，保留本機）
      importData({
        watchlist: remote.watchlist ?? watchlist,
        alerts:    remote.alerts    ?? alerts,
        settings:  remote.settings  ?? settings,
        groups:    remote.groups    ?? groups,
      });
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);
      setLastSyncAt(now);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }, [enabled, watchlist, groups, alerts, settings, importData]);

  // 登入狀態切換時，自動從雲端拉取該使用者的資料
  useEffect(() => {
    if (!enabled || auth.loading) return;
    pull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, auth.loading, auth.user?.id]);

  return {
    enabled, syncing, lastSyncAt, error, push, pull,
    authEnabled: auth.enabled,
    user: auth.user,
    signInWithGoogle: auth.signInWithGoogle,
    signOut: auth.signOut,
  };
}
