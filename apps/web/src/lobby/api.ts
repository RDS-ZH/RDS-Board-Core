import type { HubGameInfo, HubRoomInfo } from '@rds/room-protocol';

const auth = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') });

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(path.startsWith('/api/auth') && !path.includes('me') ? {} : auth()), ...init.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body as T;
}

export const getGames = () => api<HubGameInfo[]>('/api/games');
export const getRooms = () => api<HubRoomInfo[]>('/api/rooms');
export interface CreateRoomOpts { maxPlayers?: number; isPrivate?: boolean; scenarioId?: string; }
export const createRoom = (name: string, gameId: string, opts: CreateRoomOpts = {}) =>
  api<HubRoomInfo>('/api/rooms', { method: 'POST', body: JSON.stringify({ name, gameId, ...opts }) });
export const joinRoom = (id: string, code?: string) =>
  api<HubRoomInfo>('/api/rooms/' + id + '/join', { method: 'POST', body: JSON.stringify(code ? { code } : {}) });
export const me = () => api<{ sub: string; name: string }>('/api/auth/me');
export const getRoom = (id: string) => api<HubRoomInfo>('/api/rooms/' + id);
export const leaveRoom = (id: string) => api<HubRoomInfo | { ok: true }>('/api/rooms/' + id + '/leave', { method: 'POST' });
export const setRoomStatus = (id: string, status: 'open' | 'playing' | 'closed') =>
  api<HubRoomInfo>('/api/rooms/' + id + '/status', { method: 'POST', body: JSON.stringify({ status }) });
// ---- Phase B ----
export const setReady = (id: string, ready: boolean) =>
  api<HubRoomInfo>('/api/rooms/' + id + '/ready', { method: 'POST', body: JSON.stringify({ ready }) });
export const kickPlayer = (id: string, target: string) =>
  api<HubRoomInfo>('/api/rooms/' + id + '/kick', { method: 'POST', body: JSON.stringify({ target }) });
export const transferHost = (id: string, target: string) =>
  api<HubRoomInfo>('/api/rooms/' + id + '/host', { method: 'POST', body: JSON.stringify({ target }) });
