import type { HubGameInfo, HubRoomInfo } from '@rds/room-protocol';
import { getGames, getRooms, createRoom, joinRoom, leaveRoom, setRoomStatus, getRoom, me } from './api.ts';
import { showToast } from './toast.ts';

/**
 * 大厅视图：登录/房间列表/房间页。统一外壳(unified shell)的一部分——
 * 与游戏视图共用同一 SPA；"进入对局"通过 onEnterGame 回调切回游戏视图。
 * 契约见 docs/LOBBY-INTEGRATION.md。
 *
 * Phase A 约束：
 * - 所有动态插值一律经 esc()（存储型 XSS 防御：房间名/用户名来自其他用户输入）
 * - refreshRoom 不再无条件整页重渲：按数据签名跳过无变化渲染（避免按钮 focus/hover 被 3s 轮询重置）
 * - 轮询在大厅隐藏（进对局）或页面不可见时暂停
 * - 错误用 toast，不用 alert
 */
export interface LobbyHandle { destroy(): void; }

export interface EnterGameParams { query: string; }

let user: { sub: string; name: string } | null = null;
let games: HubGameInfo[] = [];
let currentRoom: HubRoomInfo | null = null;
let roomTimer: ReturnType<typeof setInterval> | null = null;
let roomsTimer: ReturnType<typeof setInterval> | null = null;
let rootEl: HTMLElement | null = null;
let onEnterGame: ((p: EnterGameParams) => void) | null = null;
let visibilityHandler: (() => void) | null = null;
/** 上次渲染房间页的数据签名：未变化则跳过 DOM 重建 */
let lastRoomSig = '';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** 大厅是否处于前台（进对局后 lobby-root 被 shell 隐藏，轮询应暂停） */
function lobbyVisible(): boolean {
  return !!rootEl && !(rootEl as HTMLElement & { hidden?: boolean }).hidden && !document.hidden;
}

export async function startLobby(container: HTMLElement, enterGame: (p: EnterGameParams) => void): Promise<LobbyHandle> {
  rootEl = container;
  onEnterGame = enterGame;
  visibilityHandler = () => {
    // 从后台/对局回到大厅：立即刷一次，弥补暂停期间的空窗
    if (lobbyVisible()) {
      if (currentRoom) void refreshRoom(); else void refreshRooms();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
  await boot();
  return {
    destroy() {
      stopTimer('room'); stopTimer('list');
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      if (rootEl) rootEl.innerHTML = '';
      rootEl = null; onEnterGame = null; currentRoom = null; lastRoomSig = '';
    }
  };
}

function stopTimer(which: 'room' | 'list'): void {
  const t = which === 'room' ? roomTimer : roomsTimer;
  if (t) clearInterval(t);
  if (which === 'room') roomTimer = null; else roomsTimer = null;
}

function render(): void {
  if (!rootEl) return;
  rootEl.innerHTML = !user ? authHtml() : currentRoom ? roomHtml() : lobbyHtml();
  lastRoomSig = currentRoom ? roomSig(currentRoom) : '';
  bind();
}

/** 房间页渲染签名：签名字段变化才值得重建 DOM */
function roomSig(r: HubRoomInfo): string {
  return [r.id, r.status, r.name, r.gameId, r.hostId, r.maxPlayers,
    r.players.map(p => p.id + ':' + p.name).join(',')].join('|');
}

function authHtml() {
  return `
  <div class="lob-card lob-auth">
    <h2>RDS Board · 联机大厅</h2>
    <p class="lob-muted">桌游联机中心 · 账号</p>
    <div class="lob-stack">
      <input id="name" placeholder="用户名（2-24 位字母数字下划线）" />
      <input id="pass" type="password" placeholder="密码（至少 6 位）" />
      <div class="lob-row">
        <button id="login">登录</button>
        <button id="register" class="lob-secondary">注册</button>
      </div>
      <div id="err" class="lob-error"></div>
    </div>
  </div>`;
}

function lobbyHtml() {
  return `
  <header class="lob-header"><h1>RDS Board · 联机大厅</h1><div class="lob-row"><span class="lob-muted">${esc(user!.name)}</span><button id="logout" class="lob-secondary">退出</button></div></header>
  <div class="lob-main">
    <div class="lob-card">
      <b>创建房间</b>
      <div class="lob-row" style="margin-top:10px">
        <input id="room-name" placeholder="房间名" style="flex:1;min-width:160px" />
        <select id="game">${games.map(g => `<option value="${esc(g.id)}">${esc(g.name)}（${g.minPlayers}-${g.maxPlayers}人）</option>`).join('')}</select>
        <button id="create">创建</button>
      </div>
    </div>
    <div class="lob-card"><b>房间列表</b><div id="rooms" class="lob-muted" style="margin-top:8px">加载中…</div></div>
    <div class="lob-card lob-solo"><b>单机模式</b><p class="lob-muted">不想联机？直接开一桌本地对局。</p><button id="solo">本地单机</button></div>
  </div>`;
}

function roomRow(r: HubRoomInfo) {
  const g = games.find(x => x.id === r.gameId);
  return `<tr>
    <td>${esc(r.name)}</td><td>${esc(g?.name ?? r.gameId)}</td>
    <td>${r.players.map(p => esc(p.name)).join('、')}${r.hostId === user!.sub ? '（你是房主）' : ''}</td>
    <td><span class="lob-badge ${r.status}">${r.status === 'open' ? '等待中' : '游戏中'}</span></td>
    <td><button data-join="${esc(r.id)}" ${r.status !== 'open' ? 'disabled' : ''}>加入</button></td>
  </tr>`;
}

async function refreshRooms() {
  const el = document.getElementById('rooms');
  if (!el || !lobbyVisible()) return;
  try {
    const rooms = await getRooms();
    el.innerHTML = rooms.length
      ? '<table><tr><th>房间</th><th>游戏</th><th>玩家</th><th>状态</th><th></th></tr>' + rooms.map(roomRow).join('') + '</table>'
      : '暂无房间，创建一个吧';
  } catch (e: any) { el.innerHTML = '<span class="lob-error">' + esc(e.message) + '</span>'; }
}

function bind() {
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const err = (m: string) => { const e = $('err'); if (e) e.textContent = m; };

  if (!user) {
    const doAuth = async (path: string) => {
      try {
        const res = await fetch('/api/auth/' + path, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: ($('name') as HTMLInputElement).value, password: ($('pass') as HTMLInputElement).value }),
        });
        const body = await res.json();
        if (!res.ok) return err(body.error);
        localStorage.setItem('token', body.token);
        await boot();
      } catch (e: any) { err(e.message); }
    };
    $('login')?.addEventListener('click', () => doAuth('login'));
    $('register')?.addEventListener('click', () => doAuth('register'));
    return;
  }

  $('logout')?.addEventListener('click', () => { localStorage.removeItem('token'); user = null; currentRoom = null; render(); });
  $('solo')?.addEventListener('click', () => onEnterGame?.({ query: '' }));

  if (currentRoom) {
    const r0 = currentRoom;
    $('exit-room')?.addEventListener('click', async () => {
      try { await leaveRoom(r0.id); } catch (e: any) { showToast(e.message, 'error'); return; }
      currentRoom = null; render();
    });
    $('start-game')?.addEventListener('click', async () => {
      try {
        currentRoom = await setRoomStatus(r0.id, 'playing');
        onEnterGame?.({ query: gameQuery(currentRoom, 'host') });
        render();
      } catch (e: any) { showToast(e.message, 'error'); }
    });
    $('reopen-game')?.addEventListener('click', () => onEnterGame?.({ query: gameQuery(r0, 'host') }));
    $('join-game')?.addEventListener('click', () => onEnterGame?.({ query: gameQuery(r0, 'guest') }));
    stopTimer('list');
    stopTimer('room');
    roomTimer = setInterval(refreshRoom, 3000);
    return;
  }

  $('create')?.addEventListener('click', async () => {
    try {
      const room = await createRoom(($('room-name') as HTMLInputElement).value, ($('game') as HTMLSelectElement).value);
      showToast('房间已创建', 'success');
      currentRoom = room; render();
    } catch (e: any) { showToast(e.message, 'error'); }
  });
  // 事件委托：refreshRooms 周期性重建表格 innerHTML，直接绑按钮会丢失监听器
  $('rooms')?.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-join]');
    if (!btn) return;
    try { currentRoom = await joinRoom(btn.dataset.join!); render(); } catch (e: any) { showToast(e.message, 'error'); }
  });
  refreshRooms();
  stopTimer('list');
  roomsTimer = setInterval(refreshRooms, 5000);
}

function seatOf(r: HubRoomInfo, userId: string): number {
  return r.players.findIndex(p => p.id === userId);
}

/** 网络对局启动参数契约见 docs/LOBBY-INTEGRATION.md（与原 Hub gameClientUrl 一致，但同页切换而非 window.open） */
function gameQuery(r: HubRoomInfo, role: 'host' | 'guest'): string {
  const q = new URLSearchParams({
    game: r.gameId,
    hub: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws',
    roomId: r.id,
    token: localStorage.getItem('token') ?? '',
    role,
    playerId: 'p' + (seatOf(r, user!.sub) + 1),
  });
  if (role === 'guest') q.set('hostId', r.hostId);
  return q.toString();
}

function roomHtml() {
  const r = currentRoom!;
  const g = games.find(x => x.id === r.gameId);
  const isHost = r.hostId === user!.sub;
  const seat = seatOf(r, user!.sub);
  return `
  <header class="lob-header"><h1>${esc(r.name)}</h1><div class="lob-row"><span class="lob-muted">${esc(user!.name)}</span><button id="exit-room" class="lob-secondary">离开房间</button></div></header>
  <div class="lob-main">
    <div class="lob-card">
      <b>${esc(g?.name ?? r.gameId)}（${r.players.length}/${r.maxPlayers}人）</b>
      <span class="lob-badge ${r.status}">${r.status === 'open' ? '等待中' : '游戏中'}</span>
      <ol style="margin:12px 0 0 18px">${r.players.map((p, i) => `<li>${esc(p.name)}${p.id === r.hostId ? ' 🏠房主' : ''} · 座位 p${i + 1}${p.id === user!.sub ? '（你）' : ''}</li>`).join('')}</ol>
      <div class="lob-row" style="margin-top:14px">
        ${isHost ? `<button id="start-game" ${r.players.length < (g?.minPlayers ?? 1) ? 'disabled' : ''}>开始游戏（${g?.minPlayers ?? ''}人起）</button>` : ''}
        ${isHost && r.status === 'playing' ? '<button id="reopen-game">再次进入对局</button>' : ''}
        ${!isHost && r.status === 'playing' ? '<button id="join-game">进入对局</button>' : ''}
        ${!isHost && r.status === 'open' ? '<span class="lob-muted">等待房主开始游戏…</span>' : ''}
      </div>
      <p class="lob-muted" style="margin-bottom:0">对局为 P2P（WebRTC）：房主浏览器是对局权威，房主关闭对局窗口则对局中断。你的座位：p${seat + 1}。</p>
    </div>
  </div>`;
}

async function refreshRoom() {
  if (!currentRoom || !lobbyVisible()) return;
  try {
    const fresh = await getRoom(currentRoom.id);
    // 数据签名未变化：跳过整页重建，保住按钮 focus/hover 等交互状态
    if (roomSig(fresh) === lastRoomSig) { currentRoom = fresh; return; }
    currentRoom = fresh;
    render();
  } catch (e: any) {
    currentRoom = null; render(); showToast(e.message, 'error');
  }
}

async function boot() {
  games = await getGames();
  const token = localStorage.getItem('token');
  if (token) {
    try { user = await me(); } catch { localStorage.removeItem('token'); }
  }
  render();
}
