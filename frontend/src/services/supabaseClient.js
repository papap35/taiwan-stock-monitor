/**
 * frontend/src/services/supabaseClient.js
 * Supabase 前端 client（僅用於 Auth，登入狀態與 access token）
 * 資料讀寫一律透過後端 /api/sync/*，不直接存取資料表。
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;
