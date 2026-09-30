import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { remoteCodexAccess } from './codexAccess';
const getUser = vi.fn();
const client = { auth: { getUser } } as unknown as SupabaseClient;
it('requires explicit owners and a token even when general broker auth is disabled', async () => {
 getUser.mockReset();
 expect(await remoteCodexAccess(client, 'Bearer token', '')).toBe(false);
 expect(await remoteCodexAccess(client, undefined, 'owner@example.com')).toBe(false);
 expect(getUser).not.toHaveBeenCalled();
});
it('validates the token on the server and permits only the verified owner', async () => {
 getUser.mockResolvedValue({ data: { user: { email: 'Owner@example.com', email_confirmed_at: '2026-01-01' } }, error: null });
 expect(await remoteCodexAccess(client, 'Bearer token', ' owner@example.com ')).toBe(true);
 expect(getUser).toHaveBeenCalledWith('token');
 expect(await remoteCodexAccess(client, 'Bearer token', 'other@example.com')).toBe(false);
 getUser.mockResolvedValue({ data: { user: { email: 'owner@example.com' } }, error: null });
 expect(await remoteCodexAccess(client, 'Bearer token', 'owner@example.com')).toBe(false);
});
it('rejects expired sessions and network failures', async () => {
 getUser.mockResolvedValue({ data: { user: null }, error: new Error('Expired') });
 expect(await remoteCodexAccess(client, 'Bearer token', 'owner@example.com')).toBe(false);
 getUser.mockRejectedValue(new Error('Offline'));
 expect(await remoteCodexAccess(client, 'Bearer token', 'owner@example.com')).toBe(false);
});
