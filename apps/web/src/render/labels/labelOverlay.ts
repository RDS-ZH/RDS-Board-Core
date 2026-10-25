import * as THREE from 'three';
import {
  LabelAnchor,
  LabelPlacement,
  ScreenRect,
  layoutLabels
} from './labelLayout';

export interface WorldLabel {
  id: string;
  text: string;
  world: [number, number, number];
  priority: number;
  kind?: string;
  count?: number;
  interactive?: boolean;
  visible?: boolean;
  /** Presentation-only card group; dragging the badge moves the whole group. */
  groupId?: string;
}

/**
 * DOM/SVG screen-space labels.
 *
 * Rendering stays in the presentation layer: the scene provides world anchors,
 * the overlay projects them through the camera and resolves overlaps in pixels.
 */
export class LabelOverlay {
  private static readonly _scratchProjVec = new THREE.Vector3();
  private readonly container: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly chipHost: HTMLDivElement;
  private readonly burstHost: HTMLDivElement;
  private bursts: {
    world: [number, number, number];
    el: HTMLDivElement;
    born: number;
    ttl: number;
  }[] = [];
  private labels: WorldLabel[] = [];
  private chips = new Map<string, HTMLDivElement>();
  private chipContentKeys = new Map<string, string>();
  private chipAttrs = new Map<string, { interactive: boolean; groupId?: string }>();
  private leaders = new Map<string, SVGLineElement>();
  private onClick?: (id: string) => void;
  private onGroupDrag?: (groupId: string, phase: 'start' | 'move' | 'end', clientX: number, clientY: number) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    this.root = document.createElement('div');
    this.root.className = 'label-overlay';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('label-leaders');
    this.root.appendChild(this.svg);
    this.chipHost = document.createElement('div');
    this.chipHost.className = 'label-chips';
    this.root.appendChild(this.chipHost);
    this.burstHost = document.createElement('div');
    this.burstHost.className = 'label-bursts';
    this.root.appendChild(this.burstHost);
    container.appendChild(this.root);
  }

  public setLabels(labels: WorldLabel[]): void {
    this.labels = labels.filter(label => label.visible !== false);
  }

  /**
   * Floating world-anchored text (damage numbers, heals).
   *
   * Kept in world space and re-projected every frame so camera moves do not
   * leave the number stranded; the CSS animation owns the rise and fade.
   */
  public popBurst(
    world: [number, number, number],
    text: string,
    tone: 'physical' | 'mental' | 'heal' = 'physical',
    ttl = 1500
  ): void {
    const el = document.createElement('div');
    el.className = `label-burst ${tone}`;
    el.textContent = text;
    this.burstHost.appendChild(el);
    this.bursts.push({ world, el, born: performance.now(), ttl });
  }

  private updateBursts(camera: THREE.Camera, viewport: { width: number; height: number }, now: number): void {
    if (this.bursts.length === 0) return;
    this.bursts = this.bursts.filter(burst => {
      const age = now - burst.born;
      if (age > burst.ttl) {
        burst.el.remove();
        return false;
      }
      const vector = LabelOverlay._scratchProjVec.set(...burst.world).project(camera);
      const x = (vector.x * 0.5 + 0.5) * viewport.width;
      const y = (-vector.y * 0.5 + 0.5) * viewport.height;
      // Rise ~46px over the lifetime, independent of the CSS keyframes.
      burst.el.style.transform = `translate(${x}px, ${y - age * 0.032}px) translate(-50%, -50%)`;
      burst.el.style.opacity = String(Math.max(0, 1 - age / burst.ttl));
      return true;
    });
  }

  public setOnClick(callback: (id: string) => void): void {
    this.onClick = callback;
  }

  public setOnGroupDrag(
    callback: (groupId: string, phase: 'start' | 'move' | 'end', clientX: number, clientY: number) => void
  ): void {
    this.onGroupDrag = callback;
  }

  /**
   * Exact chip text width using the same face the chip renders with.
   *
   * A per-character estimate cannot serve both "公爵夫人" and "Alice": CJK glyphs
   * are ~1em wide while Latin averages half that, and the mismatch truncates
   * room names with an ellipsis.
   */
  private readonly measureText = (() => {
    const cache = new Map<string, number>();
    let ctx: CanvasRenderingContext2D | null | undefined;
    return (text: string): number => {
      const cached = cache.get(text);
      if (cached !== undefined) return cached;
      if (ctx === undefined) {
        ctx = document.createElement('canvas').getContext('2d');
        if (ctx) {
          // Mirrors .label-chip so layout boxes match painted boxes.
          ctx.font = '500 12px "AlibabaPuHuiTi", "PingFang SC", "Segoe UI", sans-serif';
        }
      }
      const width = ctx ? ctx.measureText(text).width : text.length * 12;
      cache.set(text, width);
      return width;
    };
  })();

  public render(
    camera: THREE.Camera,
    viewport: { width: number; height: number },
    obstacles: ScreenRect[] = []
  ): void {
    const anchors: LabelAnchor[] = [];
    const anchorWorld = new Map<string, { x: number; y: number }>();
    for (const label of this.labels) {
      const vector = LabelOverlay._scratchProjVec.set(...label.world).project(camera);
      if (vector.z < -1 || vector.z > 1) continue;
      const x = (vector.x * 0.5 + 0.5) * viewport.width;
      const y = (-vector.y * 0.5 + 0.5) * viewport.height;
      anchors.push({ ...label, x, y });
      anchorWorld.set(label.id, { x, y });
    }

    const placements = layoutLabels(anchors, viewport, obstacles, this.measureText);
    this.updateBursts(camera, viewport, performance.now());
    const visible = new Set(placements.map(place => place.id));

    for (const placement of placements) {
      let chip = this.chips.get(placement.id);
      if (!chip) {
        chip = document.createElement('div');
        chip.className = 'label-chip';
        chip.dataset.labelId = placement.id;
        this.chipHost.appendChild(chip);
        this.chips.set(placement.id, chip);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('label-leader-line');
        this.svg.appendChild(line);
        this.leaders.set(placement.id, line);
      }

      // Dirty-check DOM contents to avoid tearing down and recreating DOM nodes every frame.
      const contentKey = `${placement.kind ?? 'generic'}:${placement.text}:${placement.count ?? 1}`;
      if (this.chipContentKeys.get(placement.id) !== contentKey) {
        this.chipContentKeys.set(placement.id, contentKey);
        chip.className = `label-chip label-kind-${placement.kind ?? 'generic'}`;
        chip.replaceChildren(...this.chipContent(placement));
        chip.title = placement.text;
      }

      chip.style.transform = `translate(${placement.left}px, ${placement.top}px)`;
      chip.style.width = `${placement.width}px`;
      chip.style.height = `${placement.height}px`;

      const prevAttrs = this.chipAttrs.get(placement.id);
      if (!prevAttrs || prevAttrs.interactive !== placement.interactive || prevAttrs.groupId !== placement.groupId) {
        this.chipAttrs.set(placement.id, { interactive: !!placement.interactive, groupId: placement.groupId });
        chip.style.pointerEvents = placement.interactive || placement.groupId ? 'auto' : 'none';
        chip.style.cursor = placement.groupId ? 'grab' : placement.interactive ? 'pointer' : 'default';
        chip.onclick = placement.interactive
          ? event => {
              event.stopPropagation();
              this.onClick?.(placement.id);
            }
          : null;
        if (placement.groupId) {
          chip.onpointerdown = event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            chip?.setPointerCapture(event.pointerId);
            this.onGroupDrag?.(placement.groupId!, 'start', event.clientX, event.clientY);
          };
          chip.onpointermove = event => {
            if (!chip?.hasPointerCapture(event.pointerId)) return;
            this.onGroupDrag?.(placement.groupId!, 'move', event.clientX, event.clientY);
          };
          chip.onpointerup = event => {
            if (!chip?.hasPointerCapture(event.pointerId)) return;
            chip.releasePointerCapture(event.pointerId);
            this.onGroupDrag?.(placement.groupId!, 'end', event.clientX, event.clientY);
          };
          chip.onpointercancel = event => {
            if (chip?.hasPointerCapture(event.pointerId)) chip.releasePointerCapture(event.pointerId);
            this.onGroupDrag?.(placement.groupId!, 'end', event.clientX, event.clientY);
          };
        } else {
          chip.onpointerdown = null;
          chip.onpointermove = null;
          chip.onpointerup = null;
          chip.onpointercancel = null;
        }
      }

      const leader = this.leaders.get(placement.id);
      if (leader) {
        leader.setAttribute('x1', String(placement.anchorX));
        leader.setAttribute('y1', String(placement.anchorY));
        leader.setAttribute('x2', String(placement.left + placement.width / 2));
        leader.setAttribute('y2', String(placement.top + placement.height / 2));
      }
    }

    for (const [id, chip] of this.chips) {
      if (!visible.has(id)) chip.style.display = 'none';
      else chip.style.display = '';
    }
    for (const [id, leader] of this.leaders) {
      leader.style.display = visible.has(id) ? '' : 'none';
    }
  }

  private chipContent(placement: LabelPlacement): Node[] {
    const text = document.createElement('span');
    text.className = 'label-text';
    text.textContent = placement.text;
    const nodes: Node[] = [text];
    if (placement.count && placement.count > 1) {
      const count = document.createElement('span');
      count.className = 'label-count';
      count.textContent = `×${placement.count}`;
      nodes.push(count);
    }
    return nodes;
  }

  public clear(): void {
    this.labels = [];
    this.chips.clear();
    this.chipContentKeys.clear();
    this.chipAttrs.clear();
    this.leaders.clear();
    this.chipHost.replaceChildren();
    this.svg.replaceChildren();
  }

  public destroy(): void {
    this.clear();
    this.root.remove();
  }
}
