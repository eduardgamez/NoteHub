// Follow asynchronously rendered messages until the reader scrolls away.
export function watchChatScroll(thread: HTMLElement) {
  let following = true;
  let savedTop: number | undefined;
  const atBottom = () => thread.scrollHeight - thread.clientHeight - thread.scrollTop <= 24;
  const scroll = () => { if (!document.hidden && savedTop === undefined) following = atBottom(); };
  const bottom = () => {
    if (following && !document.hidden && savedTop === undefined) thread.scrollTop = thread.scrollHeight;
  };
  const visibility = () => {
    if (document.hidden) savedTop ??= thread.scrollTop;
    else if (savedTop !== undefined) {
      thread.scrollTop = savedTop;
      savedTop = undefined;
      following = atBottom();
    }
  };
  bottom();
  const observer = new ResizeObserver(bottom);
  const content = thread.querySelector('.ai-thread-content');
  if (content) observer.observe(content);
  thread.addEventListener('scroll', scroll);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    observer.disconnect();
    thread.removeEventListener('scroll', scroll);
    document.removeEventListener('visibilitychange', visibility);
  };
}
