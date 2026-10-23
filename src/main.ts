import { GAME_REGISTRY } from './games/registry';
import { BoardGameScene, CameraPreset } from './render/scene';
import { BoardGameAudio } from './render/audio';
import { BoardGameHUD } from './ui/hud';
import { MathematicalInspectorUI } from './ui/mathInspector';
import { CameraView, PresentationPorts } from './app/contracts';
import { layoutForGame } from './app/layout';
import { UniversalSession } from './app/session';
import type { InteractiveObjectData } from './render/raycaster';

/**
 * Composition root only.
 * Wires: kernel session (application) ↔ presenter contract ↔ UI / renderer.
 * No game rules or UI state live here.
 */
class BoardGameSimulatorApp {
  private readonly scene: BoardGameScene;
  private session: UniversalSession;
  private readonly hud: BoardGameHUD;
  private readonly inspector: MathematicalInspectorUI;
  private readonly ports: PresentationPorts;

  private currentGameId = 'catan';
  private lastRevision = -1;
  private lastPlacementKey = '';
  private freeDragEntityId?: string;
  private readonly initialScenario?: string;

  constructor() {
    const canvasContainer = document.getElementById('canvas-container')!;
    const hudContainer = document.getElementById('hud-container')!;
    const inspectorContainer = document.getElementById('inspector-container')!;

    const params = new URLSearchParams(window.location.search);
    this.initialScenario = params.get('scenario') ?? undefined;
    this.currentGameId = params.get('game') ?? 'catan';

    this.scene = new BoardGameScene(canvasContainer);
    this.session = this.createSession(this.currentGameId, this.initialScenario);

    this.ports = {
      setCamera: (view: CameraView) => this.scene.setCameraPreset(this.cameraPreset(view)),
      setSound: (enabled: boolean) => {
        BoardGameAudio.toggleSound(enabled);
      },
      isSoundOn: () => BoardGameAudio.isSoundEnabled(),
      toggleInspector: () => this.toggleInspector(),
      highlightBoard: (ids: string[] | null) => this.scene.setHighlight(ids)
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
    this.scene.onInteractiveClick(data => this.handleBoardPick(data));
    this.scene.onInteractiveHover(() => undefined);
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
    this.session.onVisualEvent(events => this.scene.enqueueAnimations(events));
    const bootSnapshot = this.session.getSnapshot();
    this.scene.syncState(bootSnapshot.board, bootSnapshot.placement, layoutForGame(this.currentGameId));
    this.lastRevision = bootSnapshot.revision;
    this.lastPlacementKey = bootSnapshot.placement ? `${bootSnapshot.placement.defId}:${bootSnapshot.placement.rotation}` : '';

    this.wireBootScreen();
    this.wireKeyboard();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__boardGameApp = this;
    }
  }

  private createSession(gameId: string, scenario?: string): UniversalSession {
    const module = GAME_REGISTRY[gameId];
    if (!module) throw new Error(`Unknown game module: ${gameId}`);
    return new UniversalSession(module, 42, scenario);
  }

  private bindSession(session: UniversalSession): void {
    session.subscribe(snapshot => {
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
    });
  }

  private switchGame(gameId: string): void {
    if (gameId === this.currentGameId) return;
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

    this.session.pickTarget({ kind, id: data.id, metadata: data.metadata });
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
