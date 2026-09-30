import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudSync } from './cloudSync';

afterEach(() => cloudSync._setClientForTests(null));

describe('device session persistence', () => {
  it('recognizes the persisted session without requiring a user validation request', async () => {
    const getUser = vi.fn().mockRejectedValue(new Error('Offline'));
    const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { email: 'person@example.com' } } } });
    cloudSync._setClientForTests({ auth: { getSession, getUser } } as unknown as SupabaseClient);
    expect(await cloudSync.status()).toEqual({ configured: true, connected: true, email: 'person@example.com' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('signs out only the current device', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    cloudSync._setClientForTests({ auth: { signOut } } as unknown as SupabaseClient);
    await cloudSync.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reports a failed sign out instead of showing success', async () => {
    const error = new Error('Could not sign out');
    cloudSync._setClientForTests({ auth: { signOut: vi.fn().mockResolvedValue({ error }) } } as unknown as SupabaseClient);
    await expect(cloudSync.signOut()).rejects.toThrow(error);
  });
});
