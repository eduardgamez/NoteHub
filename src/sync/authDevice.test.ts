import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceAuthStorage } from './authDevice';
import { nativeBridge } from '../native/bridge';
vi.mock('../native/bridge', () => ({ isNativeIOS: vi.fn(() => true), nativeBridge: { authGet: vi.fn(), authSet: vi.fn(), authRemove: vi.fn() } }));
const key = 'sb-project-auth-token';
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); });
describe('native sessions', () => {
  it('moves an existing session into the keychain and restores it after web storage is cleared', async () => {
    vi.mocked(nativeBridge.authGet).mockResolvedValueOnce({}).mockResolvedValueOnce({ value: 'saved-session' });
    localStorage.setItem(key, 'saved-session');
    expect(await deviceAuthStorage.getItem(key)).toBe('saved-session');
    expect(nativeBridge.authSet).toHaveBeenCalledWith({ key, value: 'saved-session' });
    expect(localStorage.getItem(key)).toBeNull();
    expect(await deviceAuthStorage.getItem(key)).toBe('saved-session');
  });
  it('retains the existing session if keychain migration fails', async () => {
    vi.mocked(nativeBridge.authGet).mockResolvedValue({});
    vi.mocked(nativeBridge.authSet).mockRejectedValue(new Error('Locked'));
    localStorage.setItem(key, 'saved-session');
    await expect(deviceAuthStorage.getItem(key)).rejects.toThrow('Locked');
    expect(localStorage.getItem(key)).toBe('saved-session');
  });
  it('saves rotated refresh tokens and removes both stores on logout', async () => {
    localStorage.setItem(key, 'old');
    await deviceAuthStorage.setItem(key, 'new');
    expect(nativeBridge.authSet).toHaveBeenCalledWith({ key, value: 'new' });
    expect(localStorage.getItem(key)).toBeNull();
    await deviceAuthStorage.removeItem(key);
    expect(nativeBridge.authRemove).toHaveBeenCalledWith({ key });
  });
});
