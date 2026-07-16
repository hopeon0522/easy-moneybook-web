import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://smcuffnbcuaqxzqbxfsu.supabase.co';
const defaultPublishableKey = 'sb_publishable_6pXVy7r3lQXKmTWhvX029A_rZl0_qU7';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || defaultUrl,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || defaultPublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('로그인이 필요합니다.');
  return data.user.id;
}
