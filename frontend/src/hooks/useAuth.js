import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * P6-21: Google 登入（Supabase Auth）
 *
 * - enabled: 是否已設定 VITE_SUPABASE_URL/ANON_KEY
 * - user:    登入中的使用者（null 表示未登入）
 * - getAccessToken(): 取得當前 session 的 access token，供 API 呼叫帶入 Authorization header
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(() => {
    if (!supabase) return;
    return supabase.auth.signInWithOAuth({ provider: 'google' });
  }, []);

  const signOut = useCallback(() => {
    if (!supabase) return;
    return supabase.auth.signOut();
  }, []);

  const getAccessToken = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  return { enabled: !!supabase, loading, user, signInWithGoogle, signOut, getAccessToken };
}
