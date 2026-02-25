import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase (for realtime subscriptions)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase (for mutations)
export function getServiceSupabase() {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE!;
  return createClient(supabaseUrl, serviceRole);
}
