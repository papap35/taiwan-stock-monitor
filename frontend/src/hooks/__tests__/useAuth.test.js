import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from '../useAuth';

// 測試環境未設定 VITE_SUPABASE_URL/ANON_KEY，supabase client 應為 null
describe('useAuth', () => {
  it('reports disabled when Supabase env vars are not configured', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.enabled).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBe(null);
  });

  it('getAccessToken resolves to null when disabled', async () => {
    const { result } = renderHook(() => useAuth());
    await expect(result.current.getAccessToken()).resolves.toBe(null);
  });

  it('signInWithGoogle / signOut are no-ops when disabled', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.signInWithGoogle()).toBeUndefined();
    expect(result.current.signOut()).toBeUndefined();
  });
});
