/**
 * Minimal transport-neutral HTTP-shaped adapter for the in-memory GameRoom.
 *
 * A real WebSocket/HTTP server can call this handler without knowing about the
 * kernel; the payloads are the same RoomUpdate / Action DTOs used by tests.
 */

import { Action, DispatchResult, PlayerId } from '../core/types';
import { GameRoom, RoomUpdate } from './room';

export interface RoomHttpRequest {
  method: 'GET' | 'POST';
  path: '/join' | '/leave' | '/snapshot' | '/delta' | '/actions' | '/submit';
  viewer: PlayerId | 'GOD';
  token?: string;
  action?: Action;
}

export interface RoomHttpResponse {
  status: number;
  body: RoomUpdate | Action[] | DispatchResult | { error: string } | { ok: true };
}

export class RoomHttpAdapter {
  constructor(private readonly room: GameRoom) {}

  public handle(request: RoomHttpRequest): RoomHttpResponse {
    try {
      switch (request.path) {
        case '/join':
          if (request.method !== 'POST') return this.methodNotAllowed();
          return { status: 200, body: this.room.join(request.viewer, request.token) };
        case '/leave':
          if (request.method !== 'POST') return this.methodNotAllowed();
          this.room.leave(request.viewer);
          return { status: 200, body: { ok: true } };
        case '/snapshot':
          return { status: 200, body: this.room.snapshot(request.viewer) };
        case '/delta':
          return { status: 200, body: this.room.delta(request.viewer) };
        case '/actions':
          return { status: 200, body: this.room.actions(request.viewer) };
        case '/submit':
          if (request.method !== 'POST' || !request.action) {
            return { status: 400, body: { error: 'action is required' } };
          }
          if (request.viewer !== 'GOD' && (request.action.actorId ?? request.action.playerId) !== request.viewer) {
            return { status: 403, body: { error: 'actor does not match viewer' } };
          }
          return { status: 200, body: this.room.submit(request.action) };
      }
    } catch (error) {
      return { status: 401, body: { error: (error as Error).message } };
    }
  }

  private methodNotAllowed(): RoomHttpResponse {
    return { status: 405, body: { error: 'method not allowed' } };
  }
}
