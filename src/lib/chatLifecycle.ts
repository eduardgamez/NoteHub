export const CHAT_BACKGROUND_TIMEOUT = 3 * 60 * 1000;

export function watchChatLifecycle(reset: () => void) {
  let hiddenAt: number | undefined = document.hidden ? Date.now() : undefined;
  const hide = () => { hiddenAt ??= Date.now(); };
  const show = () => {
    if (document.hidden || hiddenAt === undefined) return;
    const elapsed = Date.now() - hiddenAt;
    hiddenAt = undefined;
    if (elapsed > CHAT_BACKGROUND_TIMEOUT) reset();
  };
  const visibility = () => document.hidden ? hide() : show();
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  window.addEventListener('focus', show);
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    window.removeEventListener('focus', show);
  };
}
