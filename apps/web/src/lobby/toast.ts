/**
 * 轻量 toast（Phase A：替代 alert 的非阻塞错误/提示通道）。
 * 挂到 document.body，任何视图（大厅/对局）下都可用。
 */
export type ToastKind = 'info' | 'error' | 'success';

export function showToast(message: string, kind: ToastKind = 'info', durationMs = 3200): void {
  let host = document.querySelector<HTMLElement>('.lob-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'lob-toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'lob-toast lob-' + kind;
  el.textContent = message;
  host.appendChild(el);
  // 入场动画靠 CSS；同一时刻最多保留 4 条
  while (host.children.length > 4) host.removeChild(host.firstElementChild!);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, durationMs);
}
