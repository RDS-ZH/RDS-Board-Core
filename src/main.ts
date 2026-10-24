import { GAME_REGISTRY } from './games/registry';
import { BoardGameScene, CameraPreset } from './render/scene';
import { BoardGameAudio } from './render/audio';
import { ensureCanvasFontsReady } from './render/fonts';
import { BoardGameHUD } from './ui/hud';
import { MathematicalInspectorUI } from './ui/mathInspector';
import { CameraView, GameSnapshot, PresentationPorts } from './app/contracts';
import { layoutForGame } from './app/layout';
import { NetSession, NetSessionOptions } from './app/netSession';
import { UniversalSession } from './app/session';
import type { InteractiveObjectData } from './render/raycaster';

/**
 * Composition root only.
 * Wires: kernel session (application) ↔ presenter contract ↔ UI / renderer.
 * No game rules or UI state live here.
 */
class BoardGameSimulatorApp {
  private readonly scene: BoardGameScene;
  private session: UniversalSession | NetSession;
  /** Set when URL params request a hub-backed lobby session. */
  private readonly netOptions?: NetSessionOptions;
  private readonly hud: BoardGameHUD;
  private readonly inspector: MathematicalInspectorUI;
  private readonly ports: PresentationPorts;

  private currentGameId = 'catan';
  private lastRevision = -1;
  private lastPlacementKey = '';
  private lastRoomId = '';
  private freeDragEntityId?: string;
  private readonly initialScenario?: string;
  /** True once the canvas webfont can be used; gates the first board paint. */
  private fontsReady = false;
  private pendingSnapshot?: GameSnapshot;

  constructor() {
    const canvasContainer = document.getElementById('canvas-container')!;
    const hudContainer = document.getElementById('hud-container')!;
    const inspectorContainer = document.getElementById('inspector-container')!;

    const params = new URLSearchParams(window.location.search);
    this.initialScenario = params.get('scenario') ?? undefined;
    this.currentGameId = params.get('game') ?? 'catan';
    this.netOptions = parseNetSessionOptions(params);

    this.scene = new BoardGameScene(canvasContainer);
    this.session = this.createSession(this.currentGameId, this.initialScenario);

    this.ports = {
      setCamera: (view: CameraView) => this.scene.setCameraPreset(this.cameraPreset(view)),
      setSound: (enabled: boolean) => {
        BoardGameAudio.toggleSound(enabled);
      },
      isSoundOn: () => BoardGameAudio.isSoundEnabled(),
      toggleInspector: () => this.toggleInspector(),
      highlightBoard: (ids: string[] | null) => this.scene.setHighlight(ids),
      focusRoom: (nodeId: string) => {
        this.scene.focusNode(nodeId);
      },
      clearRoomFocus: () => this.scene.clearFocus()
    };

    this.hud = new BoardGameHUD(hudContainer, this.session, this.ports, {
      onSwitchGame: gameId => this.switchGame(gameId)
    });

    this.inspector = new MathematicalInspectorUI(inspectorContainer, this.session, {
      onClose: () => this.hud.setInspectorActive(false)
    });

    document.addEventListener('click', event => {
      const target = event.target as HTMLElement | null;
      const floor = target?.closest<HTMLElement>('[data-floor]')?.dataset.floor;
      if (floor) this.scene.focusFloor(floor);
    });
    this.scene.onInteractiveClick(data => {
      // Clicking a room entity is also the inspection camera gesture: the
      // dossier and the 2.5D close-up should come from the same click.
      if (data.type === 'NODE' && data.metadata?.floor && this.currentGameId === 'betrayal') {
        this.scene.focusNode(data.id);
      }
      this.handleBoardPick(data);
    });
    this.scene.onInteractiveHover(data => {
      if (!data) {
        this.hud.showHoverHint(null);
        return;
      }
      const meta = (data.metadata ?? {}) as Record<string, unknown>;
      if (data.type === 'NODE') {
        if (meta?.type === 'ROOM_NAV') {
          const targetName = String(meta.targetName ?? meta.name ?? '相邻房间');
          this.hud.showHoverHint({
            title: `→ 进入【${targetName}】`,
            detail: '点击地上高亮箭头直接走入该房间（消耗 1 步）'
          });
          return;
        }
        if (meta?.type === 'DOOR') {
          this.hud.showHoverHint({
            title: `${String(meta.name ?? '门位')} · 探索未开启的门`,
            detail: '点击地上高亮箭头开启并抽取新房间'
          });
          return;
        }
        if (typeof meta.name === 'string') {
          this.hud.showHoverHint({
            title: String(meta.name),
            detail: '点击查看房间档案与陈设'
          });
          return;
        }
      }
      if (data.type === 'ENTITY') {
        const face = (meta as { title?: string }).title;
        if (face) {
          this.hud.showHoverHint({ title: face, detail: '点击查看卡牌详情' });
          return;
        }
      }
      if (data.type === 'DICE') {
        this.hud.showHoverHint({ title: '骰子', detail: '点击掷骰' });
        return;
      }
      this.hud.showHoverHint(null);
    });
    this.scene.onEntityDrop((entityId, target, clientX, clientY) => {
      if (target?.type === 'ENTITY' && target.id !== entityId) {
        if (this.scene.canMergeCards(entityId, target.id)) {
          this.scene.mergeCardsVisually(entityId, target.id);
          this.scene.settleCard(entityId);
          this.hud.pushToast('▣', '已合入同类型牌堆（仅本视图）');
        } else {
          this.scene.resetCardDrag(entityId);
          this.hud.pushToast('⚠️', '不兼容的牌堆，已回弹');
        }
        this.freeDragEntityId = undefined;
        this.scene.clearDropTargets();
        return;
      }
      if (target?.type === 'NODE') {
        const result = this.session.placeEntityAtNode(entityId, target.id);
        if (result.ok) {
          this.freeDragEntityId = undefined;
          this.scene.clearDropTargets();
          return;
        }
      }
      this.scene.moveCardToScreen(entityId, clientX, clientY);
      this.freeDragEntityId = undefined;
      this.scene.clearDropTargets();
      this.hud.pushToast('↔', '卡牌位置已调整（仅本视图）');
    });
    this.scene.onEntityDragStart(entityId => {
      const targets = this.session.getPlacementTargets(entityId);
      const entity = this.session.getSnapshot().board.entities[entityId];
      this.freeDragEntityId = targets.length === 0 && entity?.type === 'CARD' ? entityId : undefined;
      this.scene.setDropTargets(targets.map(target => target.nodeId));
    });
    this.scene.onEntityDragEnd(() => {
      this.freeDragEntityId = undefined;
      this.scene.clearDropTargets();
    });
    this.bindSession(this.session);
    this.session.onVisualEvent(events => {
      this.scene.enqueueAnimations(events);
      for (const ev of events) {
        if (ev.type === 'EXPLORE_ROOM') {
          BoardGameAudio.playDoorOpen();
        } else if (ev.type === 'CARD_DRAW') {
          BoardGameAudio.playCardDraw();
          BoardGameAudio.playEventStinger(ev.title);
        } else if (ev.type === 'CARD_DISCARD') {
          BoardGameAudio.playCardDiscard();
        } else if (ev.type === 'DICE_ROLL') {
          BoardGameAudio.playDiceRoll();
        } else if (ev.type === 'DAMAGE_EFFECT') {
          const kind = ev.payload?.kind === 'MENTAL' ? 'MENTAL' : 'PHYSICAL';
          BoardGameAudio.playCombat(kind, true);
        } else if (ev.type === 'CARD_PLAY') {
          BoardGameAudio.playCardFlip();
        } else if (ev.type === 'BUILD_OBJECT') {
          BoardGameAudio.playBuild();
        } else if (ev.type === 'TOKEN_TRANSFER') {
          BoardGameAudio.playChipClink();
        } else if (ev.type === 'STACK_PUSH' || ev.type === 'STACK_POP' || ev.type === 'STACK_CANCEL') {
          BoardGameAudio.playCardFlip();
        } else if (ev.type === 'DECISION_REVEAL' || ev.type === 'STACK_TIMEOUT') {
          BoardGameAudio.playThunder();
        } else if (ev.type === 'RULE_MUTATE') {
          BoardGameAudio.playHauntAlarm();
          BoardGameAudio.playEventStinger(ev.title);
        } else if (ev.type === 'ANNOUNCEMENT') {
          BoardGameAudio.playEventStinger(ev.title);
        } else if (ev.type === 'MOVE_OBJECT') {
          BoardGameAudio.playFootstep();
        }
      }
    });
    const bootSnapshot = this.session.getSnapshot();
    // Canvas compares glyphs against the loaded face: painting the board before
    // the CJK webfont decodes would bake fallback glyphs into the tile/card
    // texture caches, which are never rebuilt.
    this.pendingSnapshot = bootSnapshot;
    void ensureCanvasFontsReady().then(() => {
      this.fontsReady = true;
      const snapshot = this.pendingSnapshot ?? this.session.getSnapshot();
      this.pendingSnapshot = undefined;
      this.lastRevision = snapshot.revision;
      this.lastPlacementKey = snapshot.placement
        ? `${snapshot.placement.defId}:${snapshot.placement.rotation}`
        : '';
      this.scene.syncState(snapshot.board, snapshot.placement, layoutForGame(this.currentGameId));
    });

    this.wireBootScreen();
    this.wireKeyboard();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__boardGameApp = this;
    }
  }

  private createSession(gameId: string, scenario?: string): UniversalSession | NetSession {
    const module = GAME_REGISTRY[gameId];
    if (!module) throw new Error(`Unknown game module: ${gameId}`);
    if (this.netOptions) {
      const net = new NetSession(module, this.netOptions);
      // Async connect; failures surface as onNotice toasts, not boot crashes.
      void net.start();
      return net;
    }
    return new UniversalSession(module, 42, scenario);
  }

  private bindSession(session: UniversalSession | NetSession): void {
    session.subscribe(snapshot => {
      // Hold every paint until the webfont is usable; the boot promise flushes
      // the newest snapshot it finds.
      if (!this.fontsReady) {
        this.pendingSnapshot = snapshot;
        return;
      }
      const placementKey = snapshot.placement
        ? `${snapshot.placement.defId}:${snapshot.placement.rotation}`
        : '';
      // Every kernel transition (including viewer projection changes) bumps the
      // revision. Rotation-only placement previews do not.
      if (snapshot.revision !== this.lastRevision || placementKey !== this.lastPlacementKey) {
        this.lastRevision = snapshot.revision;
        this.lastPlacementKey = placementKey;
        this.scene.setHighlight(null, false);
        this.scene.syncState(snapshot.board, snapshot.placement, layoutForGame(this.currentGameId));
      }

      // Dynamic situational ambient soundscape & music update
      if (this.currentGameId === 'betrayal') {
        const floor = snapshot.spatial?.activeFloor || 'GROUND';
        const haunt = snapshot.board.globalVars.haunt as { id: string } | null | undefined;
        if (haunt) {
          if (haunt.id === 'mummy') BoardGameAudio.setSoundscape('HAUNT_MUMMY');
          else if (haunt.id === 'floating_eye') BoardGameAudio.setSoundscape('HAUNT_EYE');
          else if (haunt.id === 'phantom') BoardGameAudio.setSoundscape('HAUNT_PHANTOM');
          else if (haunt.id === 'living_dead') BoardGameAudio.setSoundscape('HAUNT_ZOMBIE');
          else if (haunt.id === 'werewolf') BoardGameAudio.setSoundscape('HAUNT_WEREWOLF');
        } else {
          if (floor === 'BASEMENT') BoardGameAudio.setSoundscape('EXPLORATION_BASEMENT');
          else if (floor === 'UPPER') BoardGameAudio.setSoundscape('EXPLORATION_UPPER');
          else BoardGameAudio.setSoundscape('EXPLORATION_GROUND');
        }
      } else {
        BoardGameAudio.stopSoundscape();
        this.lastRoomId = '';
      }

      if (this.currentGameId === 'betrayal') {
        const focusId = snapshot.focus[0] ?? snapshot.viewer;
        const player = snapshot.board.players[focusId];
        const npc = snapshot.board.npcs?.[focusId];
        const roomId = String(
          player?.customProps?.currentRoomId ?? npc?.customProps?.roomId ?? ''
        );
        if (roomId && roomId !== this.lastRoomId) {
          this.lastRoomId = roomId;
          const node = snapshot.board.mapGraph.nodes[roomId];
          BoardGameAudio.playRoomAccent(
            roomId,
            String(node?.props?.name ?? ''),
            Array.isArray(node?.props?.tags) ? node.props.tags.map(String) : []
          );
        }
      }
    });
  }

  private switchGame(gameId: string): void {
    if (gameId === this.currentGameId) return;
    // Lobby sessions are bound to the room's module; switching would strand
    // the peer mesh on a different game.
    if (this.netOptions) return;
    const module = GAME_REGISTRY[gameId];
    if (!module) return;

    this.session.dispose();
    this.currentGameId = gameId;
    this.session = this.createSession(gameId);

    this.hud.setPresenter(this.session);
    this.inspector.setPresenter(this.session);
    this.bindSession(this.session);

    this.scene.setHighlight(null, false);
    const snapshot = this.session.getSnapshot();
    this.scene.syncState(snapshot.board, snapshot.placement, layoutForGame(gameId));
    this.lastRevision = snapshot.revision;
    this.lastPlacementKey = snapshot.placement ? `${snapshot.placement.defId}:${snapshot.placement.rotation}` : '';
    this.hud.syncCamera('iso');

    this.hud.showAnnouncement(`已载入 · ${module.meta.name}`);
  }

  private toggleInspector(): void {
    this.inspector.toggleCollapse();
    this.hud.setInspectorActive(this.inspector.isOpen());
  }

  private cameraPreset(view: CameraView): CameraPreset {
    switch (view) {
      case 'top':
        return 'TOP_DOWN';
      case 'seat':
        return 'PLAYER_1';
      default:
        return 'ISOMETRIC';
    }
  }

  private handleBoardPick(data: InteractiveObjectData): void {
    const kind =
      data.type === 'NODE'
        ? 'node'
        : data.type === 'EDGE'
        ? 'edge'
        : data.type === 'DICE'
        ? 'dice'
        : 'entity';

    this.session.pickTarget({
      kind,
      id: data.id,
      metadata: { ...((data.metadata as object) || {}), intent: 'interact' }
    });
  }

  private wireBootScreen(): void {
    const boot = document.getElementById('boot-screen');
    const enter = document.getElementById('boot-enter');
    enter?.addEventListener('click', () => {
      boot?.classList.add('hidden');
      this.hud.showAnnouncement('欢迎 · 点击底部动作栏开始推演');
    });
  }

  private wireKeyboard(): void {
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLInputElement) return;

      if (event.key === 'Escape') {
        this.hud.closePayload();
        this.session.cancelPlacement();
        this.scene.setHighlight(null);
        return;
      }

      if (event.key === 'i' || event.key === 'I') {
        this.toggleInspector();
        return;
      }

      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
        const action = this.session.getSnapshot().actions[digit - 1];
        if (action) {
          this.hud.promptAction(action.id);
          event.preventDefault();
        }
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new BoardGameSimulatorApp();
});

/**
 * Lobby URL: ?hub=<origin>&room=<roomId>&token=<hubToken>&player=<playerId>
 * plus role=host, or role=guest&host=<hostHubUserId>. All four base params
 * are required; anything less falls back to the local single-player session.
 */
function parseNetSessionOptions(params: URLSearchParams): NetSessionOptions | undefined {
  const hub = params.get('hub');
  const room = params.get('room');
  const token = params.get('token');
  const player = params.get('player');
  if (!hub || !room || !token || !player) return undefined;
  const role = params.get('role') === 'host' ? 'host' : 'guest';
  const hostId = params.get('host') ?? undefined;
  if (role === 'guest' && !hostId) {
    console.warn('[net-session] guest role requires &host=<hostHubUserId>; falling back to local session');
    return undefined;
  }
  return {
    hub,
    roomId: room,
    token,
    role,
    playerId: player,
    hostId,
    scenario: params.get('scenario') ?? undefined
  };
}
