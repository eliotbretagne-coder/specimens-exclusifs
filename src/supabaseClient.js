import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wykchkfnyktwxxgyvuei.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pQ7a9xSQ9l_mGSsmRTEx9A_w82vjs-o";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

export const ADMIN_EMAIL = "eliotbretagne@gmail.com";
