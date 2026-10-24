/**
 * Room-client presenter: turns a server-authoritative GameRoom into the same
 * UiAction shape used by the local UniversalSession. Transport stays outside;
 * this adapter is the missing seam between net projections and the HUD.
 */

import { describeActionView } from '@rds/app/actionText';
import { UiAction } from '@rds/app/contracts';
import { Action, DispatchResult, PlayerId, ProjectedGameState } from '@rds/kernel/types';
import { GameRoom, RoomUpdate } from './room';

export interface RoomUiSnapshot {
  viewer: PlayerId | 'GOD';
  revision: number;
  state: ProjectedGameState;
  actions: UiAction[];
}

export class RoomPresenter {
  private readonly room: GameRoom;
  private readonly viewer: PlayerId | 'GOD';
  private byActionId = new Map<string, Action>();

  constructor(room: GameRoom, viewer: PlayerId | 'GOD') {
    this.room = room;
    this.viewer = viewer;
  }

  public join(token?: string): RoomUiSnapshot {
    return this.fromUpdate(this.room.join(this.viewer, token));
  }

  public refresh(): RoomUiSnapshot {
    return this.fromUpdate(this.room.snapshot(this.viewer));
  }

  public perform(actionId: string): DispatchResult {
    const action = this.byActionId.get(actionId);
    if (!action) return { ok: false, error: `unknown action: ${actionId}`, events: [], stateHash: '' };
    return this.room.submit(action);
  }

  private fromUpdate(update: RoomUpdate): RoomUiSnapshot {
    const state = update.state ?? this.room.engine.getProjectedStateFor(this.viewer);
    const actions = update.state?.legalActions ?? this.room.actions(this.viewer);
    this.byActionId.clear();
    const ui: UiAction[] = [];
    for (const action of actions) {
      const view = describeActionView(state, action);
      if (!view) continue;
      const id = `a${ui.length}`;
      this.byActionId.set(id, action);
      ui.push({
        id,
        icon: view.icon,
        label: view.label,
        hint: view.hint,
        tone: view.tone,
        fields: action.fields as UiAction['fields'],
        ...(action.selection
          ? {
              selection: {
                spec: action.selection,
                candidates: this.room.engine
                  .getSelectionCandidates(action.actorId ?? action.playerId, action.selection)
                  .map(candidate => ({ id: candidate.id, label: candidate.label, icon: candidate.icon }))
              }
            }
          : {})
      });
    }
    return { viewer: this.viewer, revision: update.revision, state, actions: ui };
  }
}
