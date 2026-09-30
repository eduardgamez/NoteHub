import type { SupabaseClient } from '@supabase/supabase-js';

// Remote use of the Mac's Codex session is opt-in and restricted to verified owners.
export async function remoteCodexAccess(client: SupabaseClient | null, authorization: string | undefined, allowedEmails: string): Promise<boolean> {
  const owners = allowedEmails.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!client || !owners.length || !token) return false;
  try {
    const { data, error } = await client.auth.getUser(token);
    return !error && Boolean(data.user?.email_confirmed_at && data.user.email && owners.includes(data.user.email.toLowerCase()));
  } catch { return false; }
}
