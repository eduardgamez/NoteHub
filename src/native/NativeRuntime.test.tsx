import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkspace } from '../store/useWorkspace';
import { nativeBridge } from './bridge';
import { NativeRuntime } from './NativeRuntime';

vi.mock('./bridge', async () => {
  const actual = await vi.importActual<typeof import('./bridge')>('./bridge');
  return { ...actual, isNativeIOS: () => true, nativeBridge: {
    authGet: vi.fn().mockResolvedValue({}),
    authSet: vi.fn().mockResolvedValue(undefined),
    authRemove: vi.fn().mockResolvedValue(undefined),
    pendingActions: vi.fn().mockResolvedValue({ actions: [] }),
    pendingNavigation: vi.fn().mockResolvedValue(undefined),
    acknowledgeNavigation: vi.fn(),
    ensurePermission: vi.fn().mockResolvedValue({ enabled: true }),
    sync: vi.fn().mockResolvedValue({ scheduled: 0 }),
    refreshActivity: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  } };
});

beforeEach(() => {
  vi.clearAllMocks();
  const now = Date.now();
  useWorkspace.setState({ hydrated: true, tasks: [], calendarEvents: [{ id: 'ongoing', title: 'Clase actual', start: new Date(now - 60000).toISOString(), end: new Date(now + 3600000).toISOString(), color: 'green' }] });
});
afterEach(() => { cleanup(); document.documentElement.classList.remove('native-ios'); });

it('syncs the ongoing event even when iOS returns no pending notification navigation', async () => {
  render(<NativeRuntime />);
  await waitFor(() => expect(nativeBridge.sync).toHaveBeenCalledWith({ items: [expect.objectContaining({ id: 'event:ongoing', title: 'Clase actual', end: expect.any(Number) })] }));
  expect(nativeBridge.acknowledgeNavigation).not.toHaveBeenCalled();
});

it('asks for notification permission as soon as the app opens', async () => {
  useWorkspace.setState({ calendarEvents: [] });
  render(<NativeRuntime />);
  await waitFor(() => expect(nativeBridge.ensurePermission).toHaveBeenCalled());
});

it('checks the permission again when the app returns to the front', async () => {
  render(<NativeRuntime />);
  await waitFor(() => expect(nativeBridge.ensurePermission).toHaveBeenCalledTimes(1));
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(nativeBridge.ensurePermission).toHaveBeenCalledTimes(2));
});
