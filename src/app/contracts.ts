import type { MapGraphNode, ProjectedGameState, SelectionSpec, SpatialFrame, TopologySpec } from '../core/types';

/**
 * UI-facing contracts.
 *
 * The UI (HUD + inspector) must not import the engine, game modules, audio or
 * the renderer. It only receives these DTOs from a `GamePresenter` and calls
 * back through the presenter / presentation ports.
 */

export type ViewerId = string;
export type BoardState = ProjectedGameState;

export type ActionTone = 'primary' | 'danger' | 'normal';

/**
 * Presentation projection port.
 *
 * Core stores logical coordinates only. A port maps one node into renderer
 * world space; it may be registered per `positionSpace` (grid/hex/custom/...).
 * The renderer consumes ports, never game-specific coordinate switches.
 */
export interface ProjectionContext {
  gameId: string;
  topology?: TopologySpec;
  frames?: Record<string, SpatialFrame>;
  /** Auto floor layout offsets, keyed by logical layer index. */
  layerOffsets?: Record<number, number>;
  viewport?: { width: number; height: number };
}

export interface ProjectedTransform {
  position: [number, number, number];
  /** Optional visual yaw; renderer may ignore it for tile semantics. */
  rotation?: number;
  /** Optional visual scale; renderer may ignore it for tile semantics. */
  scale?: number;
}

export interface ProjectionPort {
  readonly id: string;
  project(node: MapGraphNode, context: ProjectionContext): ProjectedTransform;
}

export interface UiActionField {
  key: string;
  label: string;
  kind: 'enum' | 'number' | 'boolean' | 'string' | 'json' | 'selection';
  options?: { value: string; label: string }[];
  selection?: SelectionSpec;
  min?: number;
  max?: number;
  step?: number;
  default?: string | number | boolean;
  required?: boolean;
  dependsOn?: {
    key: string;
    equals?: string | number | boolean;
    truthy?: boolean;
  };
}

export interface UiSelectionCandidate {
  id: string;
  label: string;
  icon?: string;
}

export interface UiActionSelection {
  spec: SelectionSpec;
  candidates: UiSelectionCandidate[];
}

export interface UiAction {
  id: string;
  icon: string;
  label: string;
  hint: string;
  tone: ActionTone;
  /** When present, the action is a board-targeting mode: click the highlighted objects. */
  highlightIds?: string[];
  /** Entity placement mode: arm the action, then click a highlighted slot node. */
  placementEntityId?: string;
  /** Declarative target picker; the presenter sends the selected ids as `targets`. */
  selection?: UiActionSelection;
  /** When present, the UI must collect these fields and send them as payload. */
  fields?: UiActionField[];
}

export interface UiPlayer {
  id: string;
  name: string;
  color: string;
  avatar: string;
  score: number;
  scoreLabel: string;
  alive: boolean;
  roleLabel?: string;
  roleClass?: string;
  isFocus: boolean;
  stats: { label: string; value: string }[];
  pips: {
    color: string;
    label: string;
    value: string;
    short?: string;
    icon?: string;
    /** Track length when the game uses a printed 0..max ladder. */
    max?: number;
    /** Printed starting position, rendered as a hollow marker. */
    start?: number;
  }[];
  hp?: { current: number; max: number };
}

export interface UiNpc {
  id: string;
  name: string;
  color: string;
  avatar: string;
  status: string;
  controllerName?: string;
  isFocus: boolean;
  stats: { label: string; value: string }[];
}

export interface UiStackFrame {
  id: string;
  title: string;
  description: string;
  status: string;
  sourceName: string;
  targetName?: string;
  window?: {
    priority: boolean;
    deadline?: number;
    remaining?: number;
    eligible: { id: string; name: string; pending: boolean }[];
  };
}

export interface UiDecision {
  id: string;
  title: string;
  description: string;
  secret: boolean;
  policyLabel: string;
  deadline?: number;
  remaining?: number;
  participants: { id: string; name: string; committed: boolean }[];
}

export interface UiHook {
  instanceId: string;
  hookId: string;
  name: string;
  stage: string;
  priority: number;
  description: string;
  ownerName?: string;
  params: string;
}

export interface UiLogEntry {
  index: number;
  playerId: string;
  type: string;
  targetId?: string;
}

export interface UiReplay {
  ok: boolean;
  steps: number;
  errors: string[];
  expectedHash: string;
  actualHash: string;
}

export interface GameLog {
  entries: UiLogEntry[];
  cursor: number;
  total: number;
  seed: number;
  hash: string;
  replay?: UiReplay;
}

export interface UiCapabilities {
  simultaneousMoves: boolean;
  hiddenInformation: boolean;
  interruptStack: boolean;
  dynamicRules: boolean;
  nonPlayerActors?: boolean;
  topology: string;
  topologySpec?: {
    kind: string;
    adjacency: string;
    directed?: boolean;
    weighted?: boolean;
    geometry?: string;
    geometrySpec?: { cellSize?: number; hexOrientation?: 'pointy' | 'flat'; origin?: [number, number, number] };
    layers?: { id: string; name: string; index: number }[];
  };
}

export interface UiSpatialInfo {
  floors: { id: string; name: string; index: number }[];
  activeNodeId?: string;
  activeFloor?: string;
}

export interface UiPlacement {
  defId: string;
  name: string;
  en?: string;
  floor: string;
  col: number;
  row: number;
  position: [number, number, number];
  rotations: number[];
  rotation: number;
  doors: string[];
  color: string;
  cost?: number;
}

export interface GameSnapshot {
  revision: number;
  gameId: string;
  gameName: string;
  capabilities: UiCapabilities;
  schemaCount: number;  dependencyErrors: string[];

  phaseLabel: string;
  /** Optional persistent objective line (Betrayal haunts, scenario missions). */
  mission?: string;
  round: number;
  turn: number;
  clock: number;
  actorName: string;
  focus: string[];
  /** Focus actors including NPCs. */
  focusActors: string[];
  viewer: ViewerId;
  viewers: { id: string; name: string }[];

  players: UiPlayer[];
  npcs: UiNpc[];
  actions: UiAction[];
  legalCount: number;

  stackDepth: number;
  stack: UiStackFrame[];
  decision?: UiDecision;
  openDecisions: number;

  hooks: UiHook[];
  log: GameLog;
  board: BoardState;
  spatial?: UiSpatialInfo;
  /** Drawn room tile awaiting orientation. */
  placement?: UiPlacement;

  gameOver: boolean;
  winnerLabel: string;
}

export type NoticeKind = 'announce' | 'event' | 'error';

export interface UiNotice {
  kind: NoticeKind;
  icon: string;
  title: string;
  detail?: string;
  durationMs?: number;
  /** Optional tab to focus when this notice arrives. */
  tabHint?: 'G' | 'STACK' | 'FACTIONS' | 'HOOKS' | 'TIME';
}

export type BoardPickKind = 'node' | 'edge' | 'entity' | 'dice';

export interface BoardPick {
  kind: BoardPickKind;
  id: string;
  metadata?: unknown;
}

export type CameraView = 'iso' | 'top' | 'seat';

/**
 * Presentation ports implemented by the composition root (main.ts).
 * Keeps camera/audio/panel concerns out of the presenter and UI.
 */
export interface PresentationPorts {
  setCamera(view: CameraView): void;
  setSound(enabled: boolean): void;
  isSoundOn(): boolean;
  toggleInspector(): void;
  /** Highlight board candidates for a targeting action (null clears). */
  highlightBoard(ids: string[] | null): void;
}

/** Application boundary used by the UI. */
export interface GamePresenter {
  getSnapshot(): GameSnapshot;
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
  onNotice(listener: (notice: UiNotice) => void): () => void;

  /** Execute an action by its UI id (1:1 with the snapshot's action list). */
  perform(actionId: string, payload?: Record<string, unknown>, targets?: string[]): { ok: boolean; error?: string };

  /** Arm a PLACE_ENTITY action; the next highlighted node click resolves the slot. */
  armPlacement(actionId: string): { ok: boolean; error?: string };

  /** Cancel an armed placement without changing state. */
  cancelPlacement(): void;

  /** Map a click on the 3D board to a legal action, if any. */
  pickTarget(pick: BoardPick): { handled: boolean; message?: string };

  /** Rotate / confirm a preloaded room tile without opening a modal. */
  rotatePlacement(direction?: 1 | -1): void;
  confirmPlacement(): { ok: boolean; error?: string };

  setViewer(viewer: ViewerId): void;
  rewind(step: number): void;
  verifyReplay(): void;
  /** Advance the kernel's logical clock; expired windows resolve deterministically. */
  advanceClock(ticks: number): void;
  dispose(): void;
}

export interface GameTab {
  id: string;
  icon: string;
  name: string;
}

/** Static presentation catalog; labels are marketing copy, not domain data. */
export const GAME_TABS: GameTab[] = [
  { id: 'catan', icon: '🏝️', name: '卡坦岛' },
  { id: 'sanguosha', icon: '⚔️', name: '三国杀' },
  { id: 'splendor', icon: '💎', name: '璀璨宝石' },
  { id: 'betrayal', icon: '🕯️', name: '山屋惊魂' },
  { id: 'dune_mahjong', icon: '🀄', name: '沙丘 & 麻将' }
];
