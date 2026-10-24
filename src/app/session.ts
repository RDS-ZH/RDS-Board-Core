import { UniversalGameEngine } from '../core/engine';
import { describeActionView } from './actionText';
import { GameModule } from '../core/module';
import { Action, ActorId, GameState, PlayerId, ProjectedGameState, SelectionCandidate, SelectionSpec, VisualTraceEvent } from '../core/types';
import { topDecision } from '../core/decisions';
import { InterruptStackManager } from '../core/stack';
import {
  BoardPick,
  GamePresenter,
  GameSnapshot,
  UiAction,
  UiDecision,
  UiHook,
  UiNotice,
  UiNpc,
  UiPlacement,
  UiPlacementDoorConnection,
  UiPlayer,
  UiReplay,
  UiSpatialInfo,
  UiStackFrame,
  ViewerId
} from './contracts';

export interface BoundAction {
  ui: UiAction;
  action?: Action;
  highlight?: string[];
  type?: string;
  idKey?: 'targetEdgeId' | 'targetNodeId' | 'entityId';
}

interface ActiveBoardGroup {
  type: string;
  idKey: 'targetEdgeId' | 'targetNodeId' | 'entityId';
  targets: string[];
}

const ROLE_LABELS: Record<string, string> = {
  LORD: '主公',
  LOYALIST: '忠臣',
  REBEL: '反贼',
  SPY: '内奸',
  TRAITOR: '叛徒',
  HERO: '英雄',
  EXPLORER: '探索者',
  LANDLORD: '地主',
  PEASANT: '农民'
};

const RESOURCES: Record<string, { icon: string; label: string; color: string }> = {
  wood: { icon: '🌲', label: '木材', color: '#3f9d5a' },
  brick: { icon: '🧱', label: '砖', color: '#c9603f' },
  sheep: { icon: '🐑', label: '羊毛', color: '#9bc94f' },
  wheat: { icon: '🌾', label: '麦', color: '#e0b23c' },
  ore: { icon: '⛏️', label: '矿', color: '#8b93a1' }
};

const GEMS: Record<string, string> = {
  diamond: '#dfe9ef',
  sapphire: '#4f8ef7',
  emerald: '#3fbf7f',
  ruby: '#e0604e',
  onyx: '#8b93a1',
  gold: '#d9b45b'
};

const EVENT_ICONS: Record<string, string> = {
  CARD_DRAW: '🎴',
  CARD_PLAY: '✧',
  CARD_DISCARD: '🗂️',
  DICE_ROLL: '🎲',
  TOKEN_TRANSFER: '◈',
  BUILD_OBJECT: '🔨',
  MOVE_OBJECT: '➜',
  EXPLORE_ROOM: '🚪',
  STACK_PUSH: '⤒',
  STACK_POP: '⤓',
  STACK_CANCEL: '⊘',
  STACK_TIMEOUT: '⏱',
  DECISION_TIMEOUT: '⏱',
  RULE_MUTATE: '☠',
  DAMAGE_EFFECT: '✸',
  DECISION_OPEN: '🔓',
  DECISION_COMMIT: '🔒',
  DECISION_REVEAL: '💥'
};

/**
 * Application layer: owns the engine, translates its read models into UI DTOs,
 * and exposes only the presenter contract. The UI never imports the engine.
 */
export class UniversalSession implements GamePresenter {
  private readonly engine: UniversalGameEngine;
  private readonly module: GameModule;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly scenario?: string;

  private revision = 0;
  private snapshot!: GameSnapshot;
  private bound: BoundAction[] = [];
  private activeBoardGroup?: ActiveBoardGroup;
  private armedPlacement?: { entityId: string };
  private placementRotation?: number;
  private lastReplay?: UiReplay;

  private listeners = new Set<(snapshot: GameSnapshot) => void>();
  private noticeListeners = new Set<(notice: UiNotice) => void>();
  private visualListeners = new Set<(events: VisualTraceEvent[]) => void>();

  constructor(module: GameModule, seed = 1, scenario?: string) {
    this.module = module;
    this.scenario = scenario;
    this.engine = new UniversalGameEngine(module, seed, { scenario });

    this.unsubscribers.push(
      this.engine.onStateChange(() => {
        this.revision += 1;
        this.lastReplay = undefined;
        this.rebuild();
        this.publish();
      })
    );

    this.unsubscribers.push(
      this.engine.onVisualEvent(events => {
        for (const listener of this.visualListeners) listener(events);
        for (const event of events) this.emitEventNotice(event.type, event.title, event.durationMs);
      })
    );

    this.rebuild();
  }

  /* ------------------------------------------------------------------ */
  /* GamePresenter                                                       */
  /* ------------------------------------------------------------------ */

  public getSnapshot(): GameSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: (snapshot: GameSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  public onNotice(listener: (notice: UiNotice) => void): () => void {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  /** Forward kernel visual events to a renderer/animation port. */
  public onVisualEvent(listener: (events: VisualTraceEvent[]) => void): () => void {
    this.visualListeners.add(listener);
    return () => this.visualListeners.delete(listener);
  }

  public perform(
    actionId: string,
    payload?: Record<string, unknown>,
    targets?: string[]
  ): { ok: boolean; error?: string } {
    const bound = this.bound.find(entry => entry.ui.id === actionId);
    if (!bound) return { ok: false, error: `unknown action: ${actionId}` };

    if (bound.highlight && !bound.action) {
      if (bound.type && bound.idKey) {
        this.activeBoardGroup = { type: bound.type, idKey: bound.idKey, targets: bound.highlight };
      }
      this.emit({
        kind: 'event',
        icon: '✧',
        title: `已高亮 ${bound.highlight.length} 个合法位置，请在 3D 桌面上点击目标`,
        durationMs: 2800
      });
      return { ok: true };
    }
    this.activeBoardGroup = undefined;

    if (!bound.action) return { ok: false, error: 'action has no dispatch payload' };

    const action: Action = { ...bound.action };
    if (payload && Object.keys(payload).length > 0) {
      action.payload = { ...(bound.action.payload ?? {}), ...payload };
    }
    if (targets && targets.length > 0) action.targets = targets;

    return this.dispatch(action);
  }

  public pickTarget(pick: BoardPick): { handled: boolean; message?: string } {
    if (this.armedPlacement) {
      if (pick.kind !== 'node') {
        return { handled: false, message: '请点击高亮的房间节点' };
      }
      const entityId = this.armedPlacement.entityId;
      this.armedPlacement = undefined;
      const result = this.placeEntityAtNode(entityId, pick.id);
      return { handled: result.ok, message: result.error };
    }
    const focus = this.engine.getFocusActors();
    const actor =
      this.engine.getViewer() !== 'GOD'
        ? this.engine.getViewer()
        : focus[0] ?? this.engine.getActiveActorId();
    const legal = this.engine.getLegalActions(actor);

    // In-world placement rotation / confirmation gizmos
    if (this.snapshot.placement) {
      if (pick.id === 'placement_rotate' || (pick.metadata as any)?.intent === 'rotate') {
        this.rotatePlacement(1);
        return { handled: true };
      }
      if (pick.id === 'placement_confirm' || (pick.metadata as any)?.intent === 'confirm') {
        const res = this.confirmPlacement();
        return { handled: res.ok, message: res.error };
      }
    }

    // In-world room navigation arrow hotspot (moving to adjacent room)
    if ((pick.metadata as any)?.type === 'ROOM_NAV') {
      const targetRoomId = (pick.metadata as any)?.targetRoomId;
      const targetName = (pick.metadata as any)?.targetName ?? '相邻房间';
      const moveAction = legal.find(
        a =>
          a.type === 'MOVE_TO_ROOM' &&
          (a.targetNodeId === targetRoomId ||
            (a.selection?.scope as { neighbors?: string[] } | undefined)?.neighbors?.includes(targetRoomId))
      );
      if (moveAction) {
        const res = this.dispatch({
          ...moveAction,
          targets: [targetRoomId]
        });
        if (res.ok) {
          this.emit({
            kind: 'event',
            icon: '🚪',
            title: `走入了【${targetName}】`,
            durationMs: 1800,
            roomId: targetRoomId
          });
        }
        return { handled: res.ok, message: res.error };
      }
      const moveNpcAction = legal.find(a => a.type === 'MOVE_NPC' && a.targetNodeId === targetRoomId);
      if (moveNpcAction) {
        const res = this.dispatch(moveNpcAction);
        return { handled: res.ok, message: res.error };
      }
    }

    // In-world door exploration hotspot
    if ((pick.metadata as any)?.type === 'DOOR') {
      const dir = (pick.metadata as any)?.direction;
      const exploreAction = legal.find(a => a.type === 'EXPLORE_DOOR' && a.payload?.direction === dir);
      if (exploreAction) {
        const res = this.dispatch(exploreAction);
        return { handled: res.ok, message: res.error };
      }
    }

    // Direct entity/board interaction from 3D viewport clicks
    const isDirectInteract = (pick.metadata as any)?.intent === 'interact';
    if (isDirectInteract && !this.activeBoardGroup) {
      if (pick.kind === 'node') {
        const directMoveAction = legal.find(
          a =>
            a.type === 'MOVE_TO_ROOM' &&
            (a.targetNodeId === pick.id ||
              (a.selection?.scope as { neighbors?: string[] } | undefined)?.neighbors?.includes(pick.id))
        );
        if (directMoveAction) {
          const res = this.dispatch({
            ...directMoveAction,
            targetNodeId: pick.id,
            targets: [pick.id]
          });
          return { handled: res.ok, message: res.error };
        }
        const directNpcAction = legal.find(a => a.type === 'MOVE_NPC' && a.targetNodeId === pick.id);
        if (directNpcAction) {
          const res = this.dispatch(directNpcAction);
          return { handled: res.ok, message: res.error };
        }
      } else if (pick.kind === 'entity') {
        const directCombatAction =
          legal.find(a => a.type === 'ATTACK_MONSTER' && a.entityId === pick.id) ??
          legal.find(a => a.type === 'ATTACK_HERO' && a.targetPlayerId === pick.id) ??
          legal.find(a => a.type === 'SLAP' && a.targetPlayerId === pick.id);
        if (directCombatAction) {
          const res = this.dispatch(directCombatAction);
          return { handled: res.ok, message: res.error };
        }
      }
    }

    // Entity clicks are inspection first unless the action dock explicitly
    // selected a board-targeting action (e.g. pick up from the room pile).
    if (pick.kind === 'entity' && !this.activeBoardGroup) {
      const entity = this.snapshot.board.entities[pick.id];
      const face = entity?.components?.cardFace;
      if (face) {
        const custom = (entity?.components?.custom ?? {}) as Record<string, unknown>;
        const kind = String(face.type ?? custom.cardType ?? 'ITEM');
        const KIND_LABELS: Record<string, string> = {
          weapon: '武器',
          armor: '护甲',
          relic: '圣物',
          consumable: '消耗品',
          tool: '工具'
        };
        const facts: { label: string; value: string }[] = [];
        if (custom.kind) facts.push({ label: '类别', value: KIND_LABELS[String(custom.kind)] ?? String(custom.kind) });
        if (typeof custom.charges === 'number' && custom.charges > 0) {
          facts.push({ label: '剩余次数', value: String(custom.charges) });
        }
        if (custom.tradeable === false) facts.push({ label: '交易', value: '不可交易' });
        if (custom.companion) facts.push({ label: '随从', value: '不可丢弃' });
        if (custom.stealable === false) facts.push({ label: '夺取', value: '不可被抢' });
        this.emit({
          kind: 'event',
          icon: entity.isMasked ? '🂠' : '🃏',
          title: entity.isMasked ? '未揭示的卡牌' : face.title,
          detail: entity.isMasked ? '需要先揭示这张牌。' : face.desc,
          durationMs: 6500,
          card: entity.isMasked
            ? undefined
            : {
                title: face.title,
                en: String(custom.en ?? ''),
                kind,
                desc: String(face.desc ?? ''),
                color: String(face.color ?? ''),
                facts,
                actions: this.snapshot.actions
                  .filter(action => action.entityId === entity.id || action.placementEntityId === entity.id)
                  .map(action => ({ id: action.id, icon: action.icon, label: action.label }))
                  .slice(0, 6)
              }
        });
        return { handled: true };
      }
    }

    // Board clicks are inspection-first. Moving/building requires the player
    // to arm a targeting action from the dock; a stray node/edge click must
    // never dispatch a legal action implicitly.
    if ((pick.kind === 'node' || pick.kind === 'edge') && !this.activeBoardGroup) {
      const node = this.snapshot.board.mapGraph.nodes[pick.id];
      const edge = this.snapshot.board.mapGraph.edges[pick.id];
      const isRoom = pick.kind === 'node' && node?.type === 'ROOM';
      const title =
        pick.kind === 'node'
          ? String(node?.props?.name ?? node?.type ?? '节点')
          : String(edge?.id ?? '边');
      this.emit({
        kind: 'event',
        icon: isRoom ? '🏚' : '🔍',
        title: isRoom ? `察看了 ${title}` : `已选中 ${title}`,
        detail: isRoom
          ? '房间档案已更新；点 ◎ 可拉近镜头观察陈设。'
          : '这是查看操作；移动/建造请先从动作栏选择动作。',
        durationMs: 2600,
        roomId: isRoom ? pick.id : undefined
      });
      return { handled: true };
    }

    const match = (() => {
      if (this.activeBoardGroup) {
        return legal.find(
          action =>
            action.type === this.activeBoardGroup!.type &&
            action[this.activeBoardGroup!.idKey] === pick.id
        );
      }
      if (pick.kind === 'dice') {
        return legal.find(a => a.type === 'ROLL_DICE') ?? legal.find(a => a.type === 'ROLL_HAUNT_CHECK');
      }
      if (pick.kind === 'node') {
        return (
          legal.find(a => a.type === 'SETUP_SETTLEMENT' && a.targetNodeId === pick.id) ??
          legal.find(a => a.type === 'BUILD_SETTLEMENT' && a.targetNodeId === pick.id) ??
          legal.find(a => a.type === 'UPGRADE_CITY' && a.targetNodeId === pick.id) ??
          legal.find(a => a.type === 'MOVE_TO_ROOM' && a.targetNodeId === pick.id) ??
          legal.find(a => a.type === 'MOVE_NPC' && a.targetNodeId === pick.id) ??
          legal.find(a => a.type === 'MOVE_ROBBER' && a.targetNodeId === pick.id)
        );
      }
      if (pick.kind === 'edge') {
        return (
          legal.find(a => a.type === 'SETUP_ROAD' && a.targetEdgeId === pick.id) ??
          legal.find(a => a.type === 'BUILD_ROAD' && a.targetEdgeId === pick.id) ??
          legal.find(a => a.type === 'BUILD_ROAD_FREE' && a.targetEdgeId === pick.id)
        );
      }
      return (
        legal.find(a => a.entityId === pick.id) ??
        (() => {
          const selectionAction = legal.find(
            action =>
              !!action.selection &&
              this.engine
                .getSelectionCandidates(action.actorId ?? action.playerId, action.selection)
                .some(candidate => candidate.id === pick.id)
          );
          return selectionAction ? { ...selectionAction, targets: [pick.id] } : undefined;
        })()
      );
    })();

    if (!match) {
      const message = '该对象当前不是合法目标。可先在动作栏选择动作，桌面会高亮全部候选位置。';
      this.emit({ kind: 'error', icon: '◌', title: message, durationMs: 2800 });
      return { handled: false, message };
    }

    this.activeBoardGroup = undefined;
    const result = this.dispatch(match);
    return { handled: result.ok, message: result.error };
  }

  public setViewer(viewer: ViewerId): void {
    // Targeting is viewer-scoped; switching seats must not leave stale highlights.
    this.activeBoardGroup = undefined;
    this.engine.setViewer(viewer);
  }

  private placementStorageKey(defId: string): string {
    return `dsh:placement:${this.module.meta.id}:${this.engine.getSeed()}:${this.scenario ?? ''}:${defId}`;
  }

  private readStoredRotation(defId: string): number | undefined {
    try {
      if (typeof sessionStorage === 'undefined') return undefined;
      const raw = sessionStorage.getItem(this.placementStorageKey(defId));
      if (!raw) return undefined;
      const value = Number(JSON.parse(raw).rotation);
      return Number.isFinite(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private storeRotation(defId: string, rotation: number): void {
    try {
      if (typeof sessionStorage === 'undefined') return;
      sessionStorage.setItem(this.placementStorageKey(defId), JSON.stringify({ rotation }));
    } catch {
      // Storage is an enhancement; placement still works without it.
    }
  }

  private clearStoredRotation(defId: string): void {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(this.placementStorageKey(defId));
    } catch {
      // ignore
    }
  }

  public rotatePlacement(direction: 1 | -1 = 1): void {
    const placement = this.snapshot.placement;
    if (!placement || placement.rotations.length === 0) return;
    const index = placement.rotations.indexOf(placement.rotation);
    const next = (index + direction + placement.rotations.length) % placement.rotations.length;
    this.placementRotation = placement.rotations[next];
    this.storeRotation(placement.defId, this.placementRotation);
    this.rebuild();
    this.publish();
  }

  public confirmPlacement(): { ok: boolean; error?: string } {
    const placement = this.snapshot.placement;
    if (!placement) return { ok: false, error: 'no pending room placement' };
    const bound = this.bound.find(entry => entry.action?.type === 'PLACE_ROOM');
    if (!bound) return { ok: false, error: 'placement action is not legal' };
    const result = this.perform(bound.ui.id, { rotation: String(placement.rotation) });
    if (result.ok) {
      this.clearStoredRotation(placement.defId);
      this.placementRotation = undefined;
    }
    return result;
  }

  /**
   * Resolve a drag/drop target node to the first legal slot action for the
   * entity. Rules remain module-owned; this only selects a bound UI action.
   */
  public placeEntityAtNode(entityId: string, nodeId?: string): { ok: boolean; error?: string } {    const raw = this.engine.getRawState();
    const entity = raw.entities[entityId];
    if (!entity) return { ok: false, error: `unknown entity: ${entityId}` };
    const actorId = entity.ownerId ?? raw.activeActorId ?? raw.activePlayerId;
    const actor = raw.players[actorId] ?? raw.npcs?.[actorId];
    const currentRoomId = String(actor?.customProps?.currentRoomId ?? actor?.customProps?.roomId ?? '');
    const targetRoomId = nodeId || currentRoomId;
    const trySlots = (roomId: string) => {
      const slots = Object.values(raw.mapGraph.slots ?? {}).filter(slot => {
        if (slot.nodeId !== roomId) return false;
        if (slot.accepts?.entityTypes && !slot.accepts.entityTypes.includes(entity.type)) return false;
        return true;
      });
      for (const slot of slots) {
        const bound = this.bound.find(
          entry =>
            entry.action?.type === 'PLACE_ENTITY' &&
            entry.action.entityId === entityId &&
            entry.action.targetSlotId === slot.id
        );
        if (bound) return this.perform(bound.ui.id);
      }
      return undefined;
    };

    const direct = trySlots(targetRoomId);
    if (direct) return direct;
    // Items are only legal in the actor's current room; if the pointer landed
    // on an overlapping/other room, fall back to the owner's room.
    if (currentRoomId && targetRoomId !== currentRoomId) {
      const fallback = trySlots(currentRoomId);
      if (fallback) return fallback;
    }
    return { ok: false, error: '该实体没有可放置到目标房间的合法位置' };
  }

  /** Valid node targets for drag-start highlighting. */
  public getPlacementTargets(entityId: string): { nodeId: string; slotId: string; label: string }[] {
    const raw = this.engine.getRawState();
    const entity = raw.entities[entityId];
    if (!entity) return [];
    const targets: { nodeId: string; slotId: string; label: string }[] = [];
    for (const slot of Object.values(raw.mapGraph.slots ?? {})) {
      if (!slot.nodeId) continue;
      if (slot.accepts?.entityTypes && !slot.accepts.entityTypes.includes(entity.type)) continue;
      const bound = this.bound.find(
        entry =>
          entry.action?.type === 'PLACE_ENTITY' &&
          entry.action.entityId === entityId &&
          entry.action.targetSlotId === slot.id
      );
      if (!bound) continue;
      const node = raw.mapGraph.nodes[slot.nodeId];
      targets.push({
        nodeId: slot.nodeId,
        slotId: slot.id,
        label: String(node?.props?.name ?? slot.nodeId)
      });
    }
    return targets;
  }

  public armPlacement(actionId: string): { ok: boolean; error?: string } {
    const bound = this.bound.find(entry => entry.ui.id === actionId);
    if (!bound?.action || bound.action.type !== 'PLACE_ENTITY' || !bound.action.entityId) {
      return { ok: false, error: '该动作不支持目标点选' };
    }
    this.armedPlacement = { entityId: bound.action.entityId };
    this.emit({ kind: 'event', icon: '◎', title: '请点击高亮的目标房间', durationMs: 2200 });
    return { ok: true };
  }

  public cancelPlacement(): void {
    this.armedPlacement = undefined;
  }

  public rewind(step: number): void {
    this.engine.rewindToStep(step);
  }

  public verifyReplay(): void {
    const report = this.engine.verifyReplay();
    this.lastReplay = {
      ok: report.ok,
      steps: report.steps,
      errors: report.errors,
      expectedHash: report.expectedHash,
      actualHash: report.actualHash
    };
    this.rebuild();
    this.publish();
  }

  public advanceClock(ticks = 1): void {
    const result = this.engine.dispatch({
      type: '__TICK__',
      playerId: 'SYSTEM',
      payload: { ticks }
    });
    if (!result.ok) {
      this.emit({ kind: 'error', icon: '⏱', title: result.error ?? 'clock advance rejected', durationMs: 3000 });
    }
  }

  public dispose(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers.length = 0;
    this.listeners.clear();
    this.noticeListeners.clear();
    this.visualListeners.clear();
  }

  /* ------------------------------------------------------------------ */
  /* Network bridge seams (used by NetSession host mirroring)            */
  /* ------------------------------------------------------------------ */

  /** Tail the append-only action log so an external mirror can replay it. */
  public getActionHistory(): Action[] {
    return this.engine.getHistory();
  }

  /** Dispatch a raw action (guest-forwarded by NetSession) through the local engine. */
  public dispatchAction(action: Action): { ok: boolean; error?: string } {
    return this.dispatch(action);
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  private dispatch(action: Action): { ok: boolean; error?: string } {
    const result = this.engine.dispatch(action);
    if (!result.ok) {
      const error = result.error ?? 'action rejected by the kernel';
      this.emit({ kind: 'error', icon: '⚠', title: error, durationMs: 4200 });
      return { ok: false, error };
    }
    return { ok: true };
  }

  private emit(notice: UiNotice): void {
    this.noticeListeners.forEach(listener => listener(notice));
  }

  private emitEventNotice(type: string, title: string, durationMs: number): void {
    if (type === 'ANNOUNCEMENT') {
      this.emit({ kind: 'announce', icon: '❖', title, durationMs });
      return;
    }
    if (type === 'RULE_MUTATE') {
      this.emit({ kind: 'announce', icon: '☠', title, durationMs: durationMs || 1600, tabHint: 'HOOKS' });
      return;
    }
    if (type === 'DECISION_REVEAL') {
      this.emit({ kind: 'announce', icon: '💥', title, durationMs: durationMs || 1600 });
      return;
    }
    if (type === 'DECISION_TIMEOUT' || type === 'STACK_TIMEOUT') {
      this.emit({ kind: 'announce', icon: '⏱', title, durationMs: durationMs || 1600, tabHint: 'STACK' });
      return;
    }
    this.emit({ kind: 'event', icon: EVENT_ICONS[type] ?? '•', title, durationMs: 3600 });
  }

  private publish(): void {
    this.listeners.forEach(listener => listener(this.snapshot));
  }

  private rebuild(): void {
    const state = this.engine.getProjectedState();
    const raw = this.engine.getRawState();
    const module = this.module;
    this.activeBoardGroup = undefined;

    const focusActors = this.engine.getFocusActors();
    const focus = focusActors.filter(id => !!raw.players[id]);
    const actor =
      this.engine.getViewer() !== 'GOD'
        ? this.engine.getViewer()
        : focusActors[0] ?? this.engine.getActiveActorId();

    const openDecision = state.pendingDecisions.find(w => w.status === 'OPEN');
    const acting = openDecision
      ? openDecision.participants.filter(pid => openDecision.submissions[pid] === undefined)
      : [actor];

    const legal = acting.flatMap(pid => this.engine.getLegalActions(pid));
    this.bound = buildActionsView(state, legal, (actorId, spec) =>
      this.engine.getSelectionCandidates(actorId, spec)
    );

    const actorName =
      acting.length > 1 ? `${acting.length} 个行动者待提交` : this.engine.getActorName(acting[0] ?? actor);

    this.snapshot = {
      revision: this.revision,
      gameId: module.meta.id,
      gameName: module.meta.name,
      capabilities: { ...module.meta.capabilities },
      schemaCount: Object.keys(module.actionSchemas ?? {}).length,
      dependencyErrors: this.engine.getRules().dependencyErrors(),

      phaseLabel: phaseLabelOf(state),
      mission: missionLineOf(state),
      round: state.round,
      turn: state.turn,
      clock: state.clock,
      actorName,
      focus,
      focusActors,
      viewer: this.engine.getViewer(),
      viewers: [
        { id: 'GOD', name: '全知上帝视角' },
        ...state.playerOrder.map(pid => ({ id: pid, name: state.players[pid]?.name ?? pid }))
      ],

      players: buildPlayersView(state, focus),
      npcs: buildNpcsView(state, focusActors, id => this.engine.getActorName(id)),
      actions: this.bound.map(entry => entry.ui),
      legalCount: legal.length,

      stackDepth: state.interruptStack.length,
      stack: buildStackView(state, id => this.engine.getActorName(id)),
      decision: openDecision
        ? buildDecisionView(state, openDecision, id => this.engine.getActorName(id))
        : undefined,
      openDecisions: state.pendingDecisions.filter(w => w.status === 'OPEN').length,

      hooks: buildHooksView(
        state,
        hookId => this.engine.getRules().get(hookId),
        id => this.engine.getActorName(id)
      ),
      spatial: this.buildSpatial(state, actor),
      placement: this.buildPlacement(raw, actor),
      log: {
        entries: state.actionLog.map((action, index) => ({
          index,
          playerId: action.playerId,
          type: action.type,
          targetId: action.targetPlayerId
        })),
        cursor: raw.actionLog.length,
        total: this.engine.getHistory().length,
        seed: this.engine.getSeed(),
        hash: this.engine.getStateHash(),
        replay: this.lastReplay
      },
      board: state,

      gameOver: state.gameOver,
      winnerLabel: state.gameOver
        ? Array.isArray(state.winner)
          ? state.winner.map(id => this.engine.getActorName(id)).join(' / ')
          : state.winner
          ? this.engine.getActorName(state.winner)
          : ''
        : ''
    };
  }



  private buildPlacement(
    raw: ReturnType<UniversalGameEngine['getRawState']>,
    actor?: string
  ): UiPlacement | undefined {
    const pending = raw.globalVars.pendingRoomPlacement as
      | { defId: string; rotations?: number[] }
      | undefined;
    if (!pending) {
      this.placementRotation = undefined;
      return undefined;
    }
    const rotations = pending.rotations ?? [0];
    if (this.placementRotation === undefined || !rotations.includes(this.placementRotation)) {
      const stored = this.readStoredRotation(pending.defId);
      this.placementRotation =
        stored !== undefined && rotations.includes(stored) ? stored : rotations[0];
    }
    return buildPlacementView(raw, this.engine.getViewer(), actor, this.placementRotation);
  }

  /* ------------------------------------------------------------------ */
  /* Players                                                             */
  /* ------------------------------------------------------------------ */





  private buildSpatial(state: ProjectedGameState, actor?: string): UiSpatialInfo | undefined {    const floors = state.mapGraph.topology?.layers ?? [];
    if (floors.length === 0) return undefined;
    const raw = this.engine.getRawState();
    const playerRoom = actor ? raw.players[actor]?.customProps?.currentRoomId : undefined;
    const npcRoom = actor ? raw.npcs?.[actor]?.customProps?.roomId : undefined;
    const activeNodeId = String(playerRoom ?? npcRoom ?? '') || undefined;
    return {
      floors,
      activeNodeId,
      activeFloor: activeNodeId ? this.engine.getSpatialFloor(activeNodeId) : undefined
    };
  }





  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */




  /* ------------------------------------------------------------------ */
  /* Stack / decisions / hooks                                           */
  /* ------------------------------------------------------------------ */






}

/* -------------------------------------------------------------------------- */
/* Pure projection → DTO view builders.                                        */
/* Shared by UniversalSession (host/local) and NetSession (network guest).     */
/* -------------------------------------------------------------------------- */

export function phaseLabelOf(state: ProjectedGameState): string {
    const openDecision = state.pendingDecisions.find(window => window.status === 'OPEN');
    if (openDecision) {
      return openDecision.secret ? 'SECRET DECISION · 同步盲提' : 'DECISION · 等待提交';
    }
    if (state.interruptStack.length > 0) return 'INTERRUPT RESOLUTION · 响应结算';

    switch (state.gameId) {
      case 'catan': {
        const labels: Record<string, string> = {
          SETUP_SETTLEMENT: 'SETUP · 选择起始定居点',
          SETUP_ROAD: 'SETUP · 铺设起始道路',
          ROLL: 'ROLL · 掷骰子',
          ACTION: 'ACTION · 建造 / 交易 / 发展卡',
          DISCARD: 'DISCARD · 七点弃牌',
          MOVE_ROBBER: 'ROBBER · 移动强盗',
          STEAL: 'STEAL · 选择偷取对象',
          ROAD_BUILDING: 'ROAD BUILDING · 免费修路',
          TRADE_PENDING: 'PLAYER TRADE · 等待回应'
        };
        return labels[state.phase] ?? state.phase;
      }
      case 'sanguosha':
        return 'PLAY PHASE · 出牌阶段';
      case 'splendor':
        return 'TAKE ACTION · 行动阶段';
      case 'betrayal': {
        const haunt = state.globalVars.haunt as
          | { number?: number; title?: string; progress?: number; eyesDestroyed?: number; bonesFound?: boolean }
          | null
          | undefined;
        if (!haunt) return `EXPLORATION · 探索阶段 · 预兆 ${Number(state.globalVars.omensRevealed ?? 0)}`;
        const bits = [`HAUNT #${haunt.number} · ${haunt.title}`];
        if (haunt.title?.includes('木乃伊')) bits.push(`封印 ${haunt.progress ?? 0}/2`);
        if (haunt.title?.includes('幽灵')) bits.push(`安魂 ${haunt.progress ?? 0}/3`);
        if (haunt.title?.includes('巨眼')) bits.push(`巨眼 ${haunt.eyesDestroyed ?? 0}/2`);
        return bits.join(' · ');
      }
      case 'dune_mahjong':
        return state.globalVars.battleMode === 'MAHJONG' ? 'PRIORITY CLAIM · 抢断窗口' : 'SIMULTANEOUS COMMIT · 同步盲提';
      default:
        return state.phase;
    }
  }

export function missionLineOf(state: ProjectedGameState): string | undefined {
    if (state.gameId !== 'betrayal') return undefined;
    const objectives = state.globalVars.hauntObjectives as { hero?: string; traitor?: string } | undefined;
    if (!objectives) {
      return `探索阶段 · 已揭示预兆 ${Number(state.globalVars.omensRevealed ?? 0)} 张 · 抽到预兆后结束回合触发作祟检定`;
    }
    if (state.viewerId === 'GOD') {
      return `英雄：${objectives.hero ?? '—'} ｜ 叛徒：${objectives.traitor ?? '—'}`;
    }
    const role = state.players[state.viewerId]?.role;
    return role === 'TRAITOR' ? `叛徒目标：${objectives.traitor ?? '—'}` : `英雄目标：${objectives.hero ?? '—'}`;
  }

export function buildPlayersView(state: ProjectedGameState, focus: string[]): UiPlayer[] {
    const focusSet = new Set(focus);

    return state.playerOrder.map(pid => {
      const player = state.players[pid];
      const handCount = state.zones[`zone_hand_${pid}`]?.orderedEntities.length ?? 0;
      const equipCount = state.zones[`zone_equip_${pid}`]?.orderedEntities.length ?? 0;

      const base: UiPlayer = {
        id: pid,
        name: player?.name ?? pid,
        color: player?.color ?? '#8b93a1',
        avatar: player?.avatar ?? '👤',
        score: player?.score ?? 0,
        scoreLabel: state.gameId === 'sanguosha' ? 'HP' : 'VP',
        alive: player?.alive ?? true,
        roleLabel: player?.role ? ROLE_LABELS[player.role] ?? player.role : undefined,
        roleClass: player?.role?.toLowerCase(),
        isFocus: focusSet.has(pid) && (player?.alive ?? true),
        stats: [],
        pips: []
      };

      if (!player) return base;

      if (state.gameId === 'catan') {
        const resources = player.customProps.resources ?? {};
        base.pips = Object.entries(RESOURCES).map(([key, meta]) => ({
          color: meta.color,
          label: meta.label,
          icon: meta.icon,
          value: String(resources[key] ?? 0)
        }));
        const owned = Object.values(state.entities).filter(e => e?.ownerId === pid && e.components?.building);
        const devCount = state.zones[`zone_dev_${pid}`]?.orderedEntities.length ?? 0;
        const knights = Number(player.customProps.knightsPlayed ?? 0);
        const longest = state.globalVars.longestRoadOwner === pid;
        const army = state.globalVars.largestArmyOwner === pid;
        base.stats = [
          {
            label: '建筑',
            value: `${owned.filter(e => e.components!.building!.type === 'SETTLEMENT').length} 村 · ${
              owned.filter(e => e.components!.building!.type === 'CITY').length
            } 城 · ${owned.filter(e => e.components!.building!.type === 'ROAD').length} 路`
          },
          { label: '发展卡 / 骑士', value: `${devCount} / ${knights}` },
          ...(longest || army
            ? [{ label: '特殊卡', value: `${longest ? '最长道路' : ''}${longest && army ? ' · ' : ''}${army ? '最大军队' : ''}` }]
            : [])
        ];
      } else if (state.gameId === 'sanguosha') {
        const hp = player.customProps.hp ?? 0;
        const maxHp = player.customProps.maxHp ?? 4;
        base.hp = { current: hp, max: maxHp };
        base.stats = [
          { label: player.customProps.hero ?? '武将', value: `${hp} / ${maxHp} HP` },
          { label: '手牌 / 装备', value: `${handCount} / ${equipCount}` }
        ];
      } else if (state.gameId === 'splendor') {
        const bonuses = player.customProps.bonuses ?? {};
        const tokens = player.customProps.tokens ?? {};
        base.pips = [
          ...['diamond', 'sapphire', 'emerald', 'ruby', 'onyx'].map(gem => ({
            color: GEMS[gem],
            label: gem,
            value: String(bonuses[gem] ?? 0)
          })),
          { color: GEMS.gold, label: 'gold', value: String(tokens.gold ?? 0) }
        ];
        const tokenTotal = Object.entries(tokens).reduce(
          (sum, [gem, count]) => (gem === 'gold' ? sum : sum + Number(count)),
          0
        );
        base.stats = [{ label: '筹码 / 保留', value: `${tokenTotal} / ${handCount}` }];
      } else if (state.gameId === 'betrayal') {
        const room = state.mapGraph.nodes[player.customProps.currentRoomId];
        const traits = player.customProps.traits ?? {};
        const hand = state.zones[`zone_hand_${pid}`]?.orderedEntities ?? [];
        const omens = hand.filter(id => state.entities[id]?.components?.custom?.cardType === 'OMEN').length;
        const items = hand.length - omens;
        const floorNames: Record<string, string> = { BASEMENT: '地下室', GROUND: '一楼', UPPER: '二楼' };
        const start = player.customProps.startIndex ?? {};
        base.score = omens;
        base.scoreLabel = '预兆';
        base.stats = [
          {
            label: '所在',
            value: `${room?.props?.name ?? '未知'} · ${floorNames[String(room?.props?.floor ?? '')] ?? ''}`
          },
          { label: '物品 / 预兆', value: `${items} / ${omens}` },
          ...(player.customProps.controlled ? [{ label: '状态', value: '👁️ 被精神控制' }] : []),
          ...(player.customProps.banished ? [{ label: '状态', value: '🛸 已被母舰接引' }] : []),
          ...(player.alive ? [] : [{ label: '状态', value: '💀 已死亡' }])
        ];
        base.pips = [
          {
            color: '#6aa6f5',
            label: `速度（初始 ${Number(start.speed ?? traits.speed ?? 0)}）`,
            short: '速',
            value: String(traits.speed ?? '-'),
            max: 8,
            start: Number(start.speed ?? 0)
          },
          {
            color: '#e0604e',
            label: `力量（初始 ${Number(start.might ?? traits.might ?? 0)}）`,
            short: '力',
            value: String(traits.might ?? '-'),
            max: 8,
            start: Number(start.might ?? 0)
          },
          {
            color: '#57c08b',
            label: `神智（初始 ${Number(start.sanity ?? traits.sanity ?? 0)}）`,
            short: '智',
            value: String(traits.sanity ?? '-'),
            max: 8,
            start: Number(start.sanity ?? 0)
          },
          {
            color: '#b07bf0',
            label: `知识（初始 ${Number(start.knowledge ?? traits.knowledge ?? 0)}）`,
            short: '识',
            value: String(traits.knowledge ?? '-'),
            max: 8,
            start: Number(start.knowledge ?? 0)
          }
        ];
      } else if (state.gameId === 'dune_mahjong') {
        const openWindow = state.pendingDecisions.find(w => w.status === 'OPEN');
        const submitted = openWindow
          ? openWindow.submissions[pid] !== undefined
          : !!state.globalVars.committedDials?.[pid];
        base.pips = [
          { color: '#e0922f', label: '香料', short: '香料', value: String(player.customProps.spice ?? 0) },
          { color: '#8b93a1', label: '军团', short: '军团', value: String(player.customProps.troops ?? 0) }
        ];
        base.stats = [
          { label: player.customProps.leader ?? '将领', value: submitted ? '🔒 已锁定转盘' : '⚪ 未提交' }
        ];
      }

      return base;
    });
  }

export function buildNpcsView(
  state: ProjectedGameState,
  focusActors: string[],
  actorName: (actorId: ActorId) => string
): UiNpc[] {    const focusSet = new Set(focusActors);
    return Object.values(state.npcs ?? {}).map(npc => {
      const entity = npc.entityId ? state.entities[npc.entityId] : undefined;
      const custom = entity?.components?.custom ?? {};
      const controller = npc.controllerId ? actorName(npc.controllerId) : undefined;
      const statusLabels: Record<string, string> = {
        ACTIVE: '活动',
        DEAD: '死亡',
        ELIMINATED: '已消灭',
        SPECTATOR: '放逐'
      };
      const stats = [
        { label: '状态', value: statusLabels[npc.status] ?? npc.status },
        ...(controller ? [{ label: '控制者', value: controller }] : []),
        ...(custom.stunned ? [{ label: '状态', value: '💫 击晕' }] : []),
        ...(custom.carryingGirl ? [{ label: '携带', value: '小女孩' }] : [])
      ];
      return {
        id: npc.id,
        name: npc.name,
        color: npc.color,
        avatar: npc.avatar,
        status: npc.status,
        controllerName: controller,
        isFocus: focusSet.has(npc.id),
        stats
      };
    });
  }

export function buildActionsView(
  state: ProjectedGameState,
  actions: Action[],
  getSelectionCandidates: (actorId: ActorId, spec: SelectionSpec) => SelectionCandidate[]
): BoundAction[] {
    const bound: BoundAction[] = [];
    const groups = new Map<string, { action: Action; ids: string[] }>();

    const boardGroups: Record<
      string,
      { idKey: 'targetEdgeId' | 'targetNodeId' | 'entityId'; icon: string; label: string; hint: string; tone: UiAction['tone'] }
    > = {
      BUILD_ROAD: { idKey: 'targetEdgeId', icon: '🛣️', label: '修建道路', hint: '点击桌面高亮边位 · 1木 1砖', tone: 'normal' },
      SETUP_ROAD: { idKey: 'targetEdgeId', icon: '🛣️', label: '铺设起始道路', hint: '点击与定居点相连的边位', tone: 'primary' },
      BUILD_SETTLEMENT: { idKey: 'targetNodeId', icon: '🏠', label: '建立定居点', hint: '点击高亮顶点 · +1VP', tone: 'primary' },
      SETUP_SETTLEMENT: { idKey: 'targetNodeId', icon: '🏠', label: '选择起始定居点', hint: '点击高亮顶点 · 免费', tone: 'primary' },
      UPGRADE_CITY: { idKey: 'targetNodeId', icon: '🏰', label: '升级为城市', hint: '点击高亮定居点 · +1VP', tone: 'primary' },
      MOVE_ROBBER: { idKey: 'targetNodeId', icon: '🦹', label: '移动强盗', hint: '点击一块非当前地块', tone: 'danger' },
      USE_ELEVATOR: { idKey: 'targetNodeId', icon: '🛗', label: '神秘电梯', hint: '点击任意已探索房间', tone: 'primary' },
      CLIMB_UP: { idKey: 'targetNodeId', icon: '🪜', label: '沿麻绳攀上', hint: '点击上方楼座/露台的房间', tone: 'normal' },
      PICK_UP_ITEM: { idKey: 'entityId', icon: '🫳', label: '拾取物品堆', hint: '点击房间中的卡牌', tone: 'normal' },
      MOVE_NPC: { idKey: 'targetNodeId', icon: '👹', label: '怪物移动', hint: '点击高亮房间 · 消耗怪物移动力', tone: 'danger' },
      BUY_CARD: { idKey: 'entityId', icon: '🏷️', label: '购买发展卡', hint: '点击高亮卡牌', tone: 'primary' }
    };

    for (const action of actions) {
      const group = boardGroups[action.type];
      if (!group) continue;
      const id = action[group.idKey];
      if (!id) continue;
      const bucket = groups.get(action.type) ?? { action, ids: [] };
      bucket.ids.push(id);
      groups.set(action.type, bucket);
    }

    for (const [type, bucket] of groups) {
      const config = boardGroups[type];
      bound.push({
        ui: {
          id: `a${bound.length}`,
          actionType: type,
          icon: config.icon,
          label: `${config.label} · ${bucket.ids.length} 处可选`,
          hint: config.hint,
          tone: config.tone,
          highlightIds: bucket.ids
        },
        highlight: bucket.ids,
        type,
        idKey: config.idKey
      });
    }
    const seen = new Set<string>();
    for (const action of actions) {
      if (boardGroups[action.type]) continue;

      const dedupeKey = `${action.actorId ?? action.playerId}:${
        action.type === 'PLAY_STRIKE'
          ? `${action.type}:${action.targetPlayerId}`
          : action.type === 'RESERVE_CARD'
          ? action.type
          : `${action.type}:${action.entityId ?? ''}:${action.targetPlayerId ?? ''}:${action.targetNodeId ?? ''}:${action.targetEdgeId ?? ''}:${JSON.stringify(action.payload ?? {})}`
      }`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const view = describeActionView(state, action);
      if (!view) continue;

      const selection = action.selection
        ? {
            spec: action.selection,
            candidates: getSelectionCandidates(action.actorId ?? action.playerId, action.selection)
              .map(candidate => ({ id: candidate.id, label: candidate.label, icon: candidate.icon }))
          }
        : undefined;

      const placementNodeId =
        action.type === 'PLACE_ENTITY' && action.targetSlotId
          ? state.mapGraph.slots?.[action.targetSlotId]?.nodeId
          : undefined;

      bound.push({
        ui: {
          id: `a${bound.length}`,
          actionType: action.type,
          icon: view.icon,
          label: view.label,
          hint: view.hint,
          tone: view.tone,
          selection,
          fields: action.fields as UiAction['fields'],
          ...(placementNodeId ? { highlightIds: [placementNodeId] } : {}),
          ...(action.type === 'PLACE_ENTITY' && action.entityId
            ? { placementEntityId: action.entityId }
            : {}),
          ...(action.entityId ? { entityId: action.entityId } : {})
        },
        action
      });
    }

    // Never truncate the dock; keep END_TURN last so a long list cannot bury it.
    const endTurn = bound.find(entry => entry.action?.type === 'END_TURN');
    return endTurn ? [...bound.filter(entry => entry !== endTurn), endTurn] : bound;
  }

export function buildStackView(
  state: ProjectedGameState,
  actorName: (actorId: ActorId) => string
): UiStackFrame[] {
    return [...state.interruptStack].reverse().map(frame => ({
      id: frame.id,
      title: frame.title,
      description: frame.description,
      status: frame.status,
      sourceName: actorName(frame.sourcePlayerId),
      targetName: frame.targetPlayerId
        ? actorName(frame.targetPlayerId)
        : undefined,
      window: frame.responseWindow
        ? {
            priority: !!frame.responseWindow.priorityArbitration,
            deadline: frame.responseWindow.deadline,
            remaining:
              frame.responseWindow.deadline === undefined
                ? undefined
                : Math.max(0, frame.responseWindow.deadline - state.clock),
            eligible: (frame.responseWindow.eligibleActors ?? frame.responseWindow.eligiblePlayers).map(pid => {
              const response = frame.responseWindow!.pendingResponses[pid];
              return {
                id: pid,
                name: actorName(pid),
                pending: !response || response === 'PENDING'
              };
            })
          }
        : undefined
    }));
  }

export function buildDecisionView(
  state: ProjectedGameState,
  window: ProjectedGameState['pendingDecisions'][number],
  actorName: (actorId: ActorId) => string
): UiDecision {
    return {
      id: window.id,
      title: window.title,
      description: window.description ?? '',
      secret: window.secret,
      policyLabel:
        window.policy.type === 'PRIORITY'
          ? `PRIORITY ≥ ${window.policy.shortCircuitAt}`
          : 'ALL COMMITTED',
      deadline: window.deadline,
      remaining:
        window.deadline === undefined ? undefined : Math.max(0, window.deadline - state.clock),
      participants: window.participants.map(pid => ({
        id: pid,
        name: actorName(pid),
        committed: window.submissions[pid] !== undefined
      }))
    };
  }

export function buildHooksView(
  state: ProjectedGameState,
  lookup: (hookId: string) => { name: string; stage: string; priority: number; description: string } | undefined,
  actorName: (actorId: ActorId) => string
): UiHook[] {
    return state.activeHooks.map(instance => {
      const impl = lookup(instance.hookId);
      return {
        instanceId: instance.instanceId,
        hookId: instance.hookId,
        name: impl?.name ?? instance.hookId,
        stage: impl?.stage ?? 'UNKNOWN',
        priority: impl?.priority ?? 0,
        description: impl?.description ?? '实现未注册：状态中只保存 hookId。',
        ownerName: instance.ownerId
          ? actorName(instance.ownerId)
          : undefined,
        params:
          instance.params && Object.keys(instance.params).length > 0
            ? JSON.stringify(instance.params)
            : '—'
      };
    });
  }

export type PlacementSource = Pick<ProjectedGameState, 'globalVars' | 'mapGraph'>;

/** Build the pending-room-tile DTO from any state carrying globalVars + mapGraph. */
export function buildPlacementView(
  state: PlacementSource,
  viewer: ViewerId,
  actor: string | undefined,
  rotation: number
): UiPlacement | undefined {
    const pending = state.globalVars.pendingRoomPlacement as
      | {
          playerId?: string;
          fromRoomId?: string;
          dir?: string;
          defId: string;
          name?: string;
          en?: string;
          floor?: string;
          col?: number;
          row?: number;
          position?: [number, number, number];
          rotations?: number[];
          localDoors?: string[];
          color?: string;
          cost?: number;
          symbol?: string;
          text?: string;
          special?: string;
          tags?: string[];
        }
      | undefined;
    if (!pending) return undefined;
    if (viewer !== 'GOD' && pending.playerId !== viewer && pending.playerId !== actor) {
      return undefined;
    }
    const currentRotation = rotation;
    const DIR_ORDER = ['N', 'E', 'S', 'W'];
    const rotateDir = (dir: string, turns: number) => {
      const idx = DIR_ORDER.indexOf(dir);
      if (idx < 0) return dir;
      return DIR_ORDER[(idx + turns) % 4];
    };
    const OPPOSITES: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };
    const DELTAS: Record<string, [number, number]> = {
      N: [0, -1],
      S: [0, 1],
      E: [1, 0],
      W: [-1, 0]
    };
    const DIR_ZH: Record<string, string> = { N: '北门', E: '东门', S: '南门', W: '西门' };

    const rawDoors = (pending.localDoors ?? []) as string[];
    const rotatedDoors = rawDoors.map(d => rotateDir(d, currentRotation));
    const connections: UiPlacementDoorConnection[] = ['N', 'E', 'S', 'W'].map(dir => {
      const hasDoor = rotatedDoors.includes(dir);
      const [dc, dr] = DELTAS[dir] ?? [0, 0];
      const targetCol = Number(pending.col ?? 0) + dc;
      const targetRow = Number(pending.row ?? 0) + dr;

      const neighbor = Object.values(state.mapGraph.nodes).find(node => {
        const p = node.props;
        return (
          node.type === 'ROOM' &&
          p?.floor === pending.floor &&
          Number(p?.col) === targetCol &&
          Number(p?.row) === targetRow
        );
      });

      if (!hasDoor) {
        return {
          dir,
          dirZh: DIR_ZH[dir],
          connected: false,
          status: 'open'
        };
      }

      if (!neighbor) {
        return {
          dir,
          dirZh: DIR_ZH[dir],
          connected: false,
          status: 'open'
        };
      }

      const neighborDoors = Array.isArray(neighbor.props?.doors) ? neighbor.props.doors : [];
      const connects = neighborDoors.includes(OPPOSITES[dir]);
      return {
        dir,
        dirZh: DIR_ZH[dir],
        neighborRoomId: neighbor.id,
        neighborRoomName: String(neighbor.props?.name ?? ''),
        connected: connects,
        status: connects ? 'connected' : 'blocked'
      };
    });

    return {
      defId: pending.defId,
      name: pending.name ?? pending.defId,
      en: pending.en,
      floor: pending.floor ?? '',
      col: Number(pending.col ?? 0),
      row: Number(pending.row ?? 0),
      position: pending.position ?? [0, 0.15, 0],
      rotations: pending.rotations ?? [0],
      rotation,
      doors: pending.localDoors ?? [],
      color: pending.color ?? '#3e2723',
      cost: pending.cost,
      symbol: pending.symbol,
      text: pending.text,
      special: pending.special,
      tags: pending.tags,
      fromRoomId: pending.fromRoomId,
      entryDir: pending.dir,
      connections
    };
}

/** Focus set P(s) computed from a (projected) state alone — no engine needed. */
export function focusActorsOf(state: ProjectedGameState): ActorId[] {
  const raw = state as unknown as GameState;
  const decision = topDecision(raw);
  if (decision && decision.status === 'OPEN') {
    return decision.participants.filter(pid => decision.submissions[pid] === undefined);
  }
  const frame = InterruptStackManager.peek(raw);
  if (frame && frame.status === 'WAITING_INPUT' && frame.responseWindow) {
    const eligible = frame.responseWindow.eligibleActors ?? frame.responseWindow.eligiblePlayers;
    return eligible.filter(
      pid => !frame.responseWindow!.pendingResponses[pid] || frame.responseWindow!.pendingResponses[pid] === 'PENDING'
    );
  }
  return state.gameOver ? [] : [state.activeActorId ?? state.activePlayerId];
}

/** Actor display name from a (projected) state alone. */
export function actorNameOf(state: ProjectedGameState, actorId: ActorId): string {
  return state.players[actorId]?.name ?? state.npcs?.[actorId]?.name ?? actorId;
}
