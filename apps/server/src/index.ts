import { fileURLToPath } from 'node:url';
// serveStatic root 相对 CWD；统一定位到 apps/server/
process.chdir(fileURLToPath(new URL('../', import.meta.url))); // → apps/server/
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { PORT } from './config.ts';
import { register, login, userFromAuthHeader } from './auth.ts';
import { listRooms, createRoom, joinRoom, leaveRoom, setRoomStatus, getRoomInfo, setReady, kickPlayer, transferHost, setRoomChangedHook } from './rooms.ts';
import { GAMES } from './games.ts';
import { SignalHub } from './signal.ts';

const app = new Hono();

// ---- 认证 ----
app.post('/api/auth/register', async c => {
  const body = await c.req.json().catch(() => ({}));
  const r = register(String(body.name ?? ''), String(body.password ?? ''));
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r);
});
app.post('/api/auth/login', async c => {
  const body = await c.req.json().catch(() => ({}));
  const r = login(String(body.name ?? ''), String(body.password ?? ''));
  return 'error' in r ? c.json({ error: r.error }, 401) : c.json(r);
});
app.get('/api/auth/me', c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  return u ? c.json(u) : c.json({ error: 'unauthorized' }, 401);
});

// ---- 游戏 / 房间 ----
app.get('/api/games', c => c.json(GAMES));
app.get('/api/rooms', c => c.json(listRooms()));
app.post('/api/rooms', async c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const r = createRoom(u.sub, String(body.name ?? ''), String(body.gameId ?? ''), {
    maxPlayers: body.maxPlayers == null ? undefined : Number(body.maxPlayers),
    isPrivate: !!body.isPrivate,
    scenarioId: body.scenarioId == null ? undefined : String(body.scenarioId),
  });
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r);
});
app.get('/api/rooms/:id', c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  if (!u) return c.json({ error: '未登录' }, 401);
  const r = getRoomInfo(c.req.param('id'), u.sub);
  return 'error' in r ? c.json({ error: r.error }, 404) : c.json(r);
});
app.post('/api/rooms/:id/join', async c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const code = body.code == null ? undefined : String(body.code);
  const r = joinRoom(u.sub, c.req.param('id'), code);
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r);
});
app.post('/api/rooms/:id/leave', c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const r = leaveRoom(u.sub, c.req.param('id'));
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json({ ok: true });
});
app.post('/api/rooms/:id/status', async c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const r = setRoomStatus(u.sub, c.req.param('id'), body.status);
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r);
});
// ---- Phase B：就绪 / 请离 / 转移房主 ----
app.post('/api/rooms/:id/ready', async c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const r = setReady(u.sub, c.req.param('id'), !!body.ready);
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r);
});
app.post('/api/rooms/:id/kick', async c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const r = kickPlayer(u.sub, c.req.param('id'), String(body.target ?? ''));
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r);
});
app.post('/api/rooms/:id/host', async c => {
  const u = userFromAuthHeader(c.req.header('authorization'));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const r = transferHost(u.sub, c.req.param('id'), String(body.target ?? ''));
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r);
});
app.get('/healthz', c => c.json({ ok: true }));

// ---- 游戏客户端静态托管（GAMES 目录挂载 RDS-Board-Core 构建产物 dist/ → /games/rds-board-core/） ----
// 生产 compose 卷：./rds-board-core-dist:/app/games/rds-board-core
app.use('/games/*', serveStatic({ root: '../../dist', rewriteRequestPath: p => p.replace(/^\/games\/rds-board-core/, '') || '/index.html' }));

// ---- 静态大厅（生产：web/dist；开发：vite 独立端口） ----
app.use('/*', serveStatic({ root: '../../dist' }));
app.get('/*', serveStatic({ path: '../../dist/index.html' }));

const server = serve({ fetch: app.fetch, port: PORT }, info => {
  console.log('[hub] listening on http://127.0.0.1:' + info.port);
});

// ---- /ws 信令 ----
const wss = new WebSocketServer({ noServer: true });
const hub = new SignalHub();
hub.startHeartbeat();
setRoomChangedHook(room => hub.broadcastRoomUpdate(room));
server.on('upgrade', (req: http.IncomingMessage, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => hub.accept(ws, url.searchParams.get('token')));
});
