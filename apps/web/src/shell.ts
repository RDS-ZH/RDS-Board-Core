import './lobby/lobby.css';

/**
 * 统一外壳（unified shell）：单一 SPA 同时承载「联机大厅」与「游戏本体」。
 * 启动二态探测：同源 /healthz 在 500ms 内应答 → 大厅模式；否则 → 本地单机模式。
 * URL 已带网络对局参数（hub/roomId/token/playerId）→ 跳过大厅直接进对局。
 */
const NET_KEYS = ['hub', 'roomId', 'token', 'playerId'] as const;

function hasNetParams(): boolean {
  const p = new URLSearchParams(location.search);
  return NET_KEYS.every(k => p.get(k));
}

async function hubAlive(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 500);
    const res = await fetch('/healthz', { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    // SPA fallback（如 vite dev）会对任意路径回 200 HTML——必须验证 JSON 体
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch { return false; }
}

let gameStarted = false;

async function enterGameView(query: string): Promise<void> {
  if (gameStarted) {
    // 对局已在本页运行：带参数则整页重载以重建网络会话，否则忽略
    if (query) location.search = '?' + query;
    return;
  }
  gameStarted = true;
  const lobby = document.getElementById('lobby-root');
  if (lobby) lobby.hidden = true;
  const app = document.getElementById('app');
  if (app) app.style.display = '';
  if (query) history.replaceState(null, '', '?' + query);
  await import('./main.ts');
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);

  // 1) 已带网络对局参数：直接进对局（Hub 房间页 / 旧 /games 入口兼容）
  if (hasNetParams()) return enterGameView(location.search);

  // 2) 同源探测 Hub
  const alive = await hubAlive();
  if (!alive) {
    // 本地单机模式：隐藏大厅，直接启动游戏外壳
    return enterGameView('');
  }

  // 3) 大厅模式
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
  const lobbyEl = document.getElementById('lobby-root')!;
  lobbyEl.hidden = false;
  const { startLobby } = await import('./lobby/lobby.ts');
  await startLobby(lobbyEl, p => enterGameView(p.query));
}

boot();
