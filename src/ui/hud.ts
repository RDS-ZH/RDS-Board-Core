import confetti from 'canvas-confetti';
import {
  CameraView,
  GAME_TABS,
  GamePresenter,
  GameSnapshot,
  PresentationPorts,
  UiAction,
  UiNotice
} from '../app/contracts';

export interface HUDOptions {
  onSwitchGame: (gameId: string) => void;
}

/**
 * Presentation-only HUD.
 * It renders `GameSnapshot` DTOs and forwards intents to the presenter/ports.
 * It must not import the engine, game modules, audio or Three.js.
 */
export class BoardGameHUD {
  private readonly container: HTMLElement;
  private presenter: GamePresenter;
  private readonly ports: PresentationPorts;
  private readonly options: HUDOptions;

  private unsubSnapshot: (() => void) | null = null;
  private unsubNotice: (() => void) | null = null;
  private announceTimer: number | null = null;
  private latest: GameSnapshot | null = null;

  constructor(
    container: HTMLElement,
    presenter: GamePresenter,
    ports: PresentationPorts,
    options: HUDOptions
  ) {
    this.container = container;
    this.presenter = presenter;
    this.ports = ports;
    this.options = options;

    this.renderSkeleton();
    this.syncSoundButton();
    this.bindPresenter(presenter);
  }

  public setPresenter(presenter: GamePresenter): void {
    this.unsubSnapshot?.();
    this.unsubNotice?.();
    this.closePayload();
    this.presenter = presenter;
    this.bindPresenter(presenter);
    this.syncSoundButton();
  }

  public dispose(): void {
    this.unsubSnapshot?.();
    this.unsubNotice?.();
  }

  public setInspectorActive(active: boolean): void {
    this.container.querySelector('#btn-inspector')?.classList.toggle('active', active);
  }

  /** Trigger an action as the user would (keyboard shortcuts). */
  public promptAction(actionId: string): void {
    const snapshot = this.latest;
    const action = snapshot?.actions.find(candidate => candidate.id === actionId);
    if (!snapshot || !action) return;
    // Placement is handled by the inline rotate/confirm controls, not a modal.
    if (snapshot.placement) return;

    if (action.fields?.length || action.selection) {
      this.openPayloadForm(action);
      return;
    }

    if (action.highlightIds) this.ports.highlightBoard(action.highlightIds);
    else this.ports.highlightBoard(null);

    if (action.placementEntityId) {
      const result = this.presenter.armPlacement(action.id);
      if (!result.ok) this.pushToast('⚠️', result.error ?? '无法进入放置模式');
      return;
    }
    this.presenter.perform(action.id);
  }

  public closePayload(): void {
    const layer = this.container.querySelector('#payload-layer') as HTMLElement | null;
    if (!layer) return;
    layer.style.display = 'none';
    layer.innerHTML = '';
  }

  /** Reflect the renderer's camera state without owning the camera. */
  public syncCamera(view: CameraView): void {
    this.container.querySelectorAll<HTMLElement>('.cam-btn').forEach(button => {
      button.classList.toggle('active', button.dataset.cam === view);
    });
  }

  public pushToast(icon: string, text: string, ttl = 3600, detail?: string): void {
    const stack = document.getElementById('toast-container');
    if (!stack) return;

    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="t-ico">${icon}</span><span class="t-txt">${text}${
      detail ? `<span class="t-detail">${detail}</span>` : ''
    }</span>`;
    stack.appendChild(el);

    while (stack.children.length > 4) stack.removeChild(stack.firstElementChild!);

    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 260);
    }, ttl);
  }

  public showAnnouncement(title: string, durationMs = 2000): void {
    const banner = this.container.querySelector('#announce') as HTMLElement | null;
    if (!banner) return;

    if (this.announceTimer) window.clearTimeout(this.announceTimer);

    banner.innerHTML = `<span class="a-mark">❖</span><span>${title}</span>`;
    banner.style.display = 'flex';
    banner.classList.remove('out');

    if (/Winner|HU!|Game Over|胜利|结束/.test(title)) {
      confetti({ particleCount: 90, spread: 78, origin: { y: 0.62 }, colors: ['#d9b45b', '#f6dc9c', '#ffffff'] });
    }

    this.announceTimer = window.setTimeout(() => {
      banner.classList.add('out');
      window.setTimeout(() => {
        banner.style.display = 'none';
        banner.classList.remove('out');
      }, 280);
    }, Math.max(1200, durationMs));
  }

  /* ------------------------------------------------------------------ */

  private bindPresenter(presenter: GamePresenter): void {
    this.unsubSnapshot = presenter.subscribe(snapshot => this.render(snapshot));
    this.unsubNotice = presenter.onNotice(notice => this.renderNotice(notice));
  }

  private openPayloadForm(action: UiAction): void {
    const layer = this.container.querySelector('#payload-layer') as HTMLElement | null;
    if (!layer || (!action.fields?.length && !action.selection)) return;

    const fields = (action.fields ?? [])
      .map(field => {
        if (field.kind === 'enum') {
          const options = (field.options ?? [])
            .map(option => {
              const selected = field.default === option.value ? ' selected' : '';
              return `<option value="${option.value}"${selected}>${option.label}</option>`;
            })
            .join('');
          return `
            <label class="pf-row" data-field-row="${field.key}">
              <span class="pf-label">${field.label}</span>
              <select class="pf-control" data-field="${field.key}">${options}</select>
            </label>
          `;
        }

        if (field.kind === 'boolean') {
          return `
            <label class="pf-row pf-check" data-field-row="${field.key}">
              <input class="pf-control" data-field="${field.key}" type="checkbox" ${field.default ? 'checked' : ''} />
              <span class="pf-label">${field.label}</span>
            </label>
          `;
        }

        if (field.kind === 'string') {
          return `
            <label class="pf-row" data-field-row="${field.key}">
              <span class="pf-label">${field.label}</span>
              <input class="pf-control" data-field="${field.key}" type="text" value="${field.default ?? ''}" />
            </label>
          `;
        }

        if (field.kind === 'json') {
          return `
            <label class="pf-row" data-field-row="${field.key}">
              <span class="pf-label">${field.label}</span>
              <textarea class="pf-control" data-field="${field.key}" rows="3">${
                field.default === undefined ? '' : JSON.stringify(field.default)
              }</textarea>
            </label>
          `;
        }

        const value = field.default ?? field.min ?? 0;
        return `
          <label class="pf-row" data-field-row="${field.key}">
            <span class="pf-label">${field.label}</span>
            <input class="pf-control" data-field="${field.key}" type="number"
              value="${value}" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" />
          </label>
        `;
      })
      .join('');

    const selection = action.selection
      ? `
        <div class="pf-row">
          <span class="pf-label">选择目标（${action.selection.spec.min}–${action.selection.spec.max}）</span>
          <div class="pf-targets" data-selection-min="${action.selection.spec.min}" data-selection-max="${action.selection.spec.max}">
            ${
              action.selection.candidates.length > 0
                ? action.selection.candidates
                    .map(
                      candidate => `
                        <label class="pf-target">
                          <input type="checkbox" data-target="${candidate.id}" />
                          <span>${candidate.icon ? `${candidate.icon} ` : ''}${candidate.label}</span>
                        </label>`
                    )
                    .join('')
                : '<div class="pf-empty">当前没有可选目标</div>'
            }
          </div>
        </div>`
      : '';

    layer.innerHTML = `
      <div class="payload-backdrop"></div>
      <form class="payload-card" autocomplete="off">
        <header class="pf-head">
          <span class="pf-ico">${action.icon}</span>
          <div>
            <div class="pf-title">${action.label}</div>
            <div class="pf-hint">${action.hint}</div>
          </div>
        </header>
        <div class="pf-body">${selection}${fields}</div>
        <footer class="pf-foot">
          <button type="button" class="pf-btn" id="pf-cancel">取消</button>
          <button type="submit" class="pf-btn primary">确认</button>
        </footer>
      </form>
    `;
    layer.style.display = 'flex';

    const close = () => {
      layer.style.display = 'none';
      layer.innerHTML = '';
    };

    layer.querySelector('.payload-backdrop')?.addEventListener('click', close);
    layer.querySelector('#pf-cancel')?.addEventListener('click', close);

    const form = layer.querySelector('form') as HTMLFormElement;

    const fieldValue = (key: string): unknown => {
      const control = form.querySelector(`[data-field="${key}"]`) as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null;
      if (!control) return undefined;
      if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked;
      return control.value;
    };
    const applyFieldVisibility = (): void => {
      for (const field of action.fields ?? []) {
        const row = form.querySelector(`[data-field-row="${field.key}"]`) as HTMLElement | null;
        if (!row) continue;
        const dep = field.dependsOn;
        if (!dep) {
          row.style.display = '';
          continue;
        }
        const value = fieldValue(dep.key);
        const visible =
          dep.truthy !== undefined
            ? Boolean(value) === dep.truthy
            : dep.equals !== undefined
            ? String(value) === String(dep.equals)
            : true;
        row.style.display = visible ? '' : 'none';
      }
    };
    form.querySelectorAll('[data-field]').forEach(control => {
      control.addEventListener('change', applyFieldVisibility);
      control.addEventListener('input', applyFieldVisibility);
    });
    applyFieldVisibility();

    form.addEventListener('submit', event => {
      event.preventDefault();
      const payload: Record<string, unknown> = {};
      for (const field of action.fields ?? []) {
        const row = form.querySelector(`[data-field-row="${field.key}"]`) as HTMLElement | null;
        if (row && row.style.display === 'none') continue;
        const control = form.querySelector(`[data-field="${field.key}"]`) as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | null;
        if (!control) continue;
        if (field.kind === 'boolean') {
          payload[field.key] = (control as HTMLInputElement).checked;
        } else if (field.kind === 'json') {
          try {
            payload[field.key] = control.value.trim() === '' ? null : JSON.parse(control.value);
          } catch {
            this.pushToast('⚠️', `${field.label} 不是合法 JSON`);
            return;
          }
        } else {
          payload[field.key] = field.kind === 'number' ? Number(control.value) : control.value;
        }
      }

      const targets = Array.from(form.querySelectorAll<HTMLInputElement>('[data-target]:checked')).map(
        input => input.dataset.target ?? ''
      );
      if (action.selection) {
        if (targets.length < action.selection.spec.min || targets.length > action.selection.spec.max) {
          this.pushToast('◌', `请选择 ${action.selection.spec.min}–${action.selection.spec.max} 个目标`);
          return;
        }
      }

      const result = this.presenter.perform(action.id, payload, targets);
      if (!result.ok) {
        this.pushToast('⚠️', result.error ?? '动作被拒绝');
        return;
      }
      close();
    });

    (form.querySelector('[data-field]') as HTMLElement | null)?.focus();
  }

  private renderNotice(notice: UiNotice): void {
    if (notice.kind === 'announce') {
      this.showAnnouncement(notice.title, notice.durationMs ?? 1800);
      return;
    }
    this.pushToast(notice.icon, notice.title, notice.durationMs ?? 3200, notice.detail);
  }

  private syncSoundButton(): void {
    const button = this.container.querySelector('#btn-audio') as HTMLElement | null;
    if (!button) return;
    const on = this.ports.isSoundOn();
    button.classList.toggle('active', on);
    button.textContent = on ? '♪' : '✕';
  }

  private renderSkeleton(): void {
    this.container.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">𝒢</div>
          <div class="brand-text">
            <div class="brand-title">通用桌游内核</div>
            <div class="brand-sub">UNIVERSAL GAME KERNEL</div>
          </div>
        </div>

        <nav class="game-switch" id="game-switch">
          ${GAME_TABS.map(
            tab => `
            <button class="game-pill" data-game="${tab.id}">
              <span class="gp-ico">${tab.icon}</span><span>${tab.name}</span>
            </button>
          `
          ).join('')}
        </nav>

        <div class="topbar-actions">
          <div class="viewer-switch" title="认知滤镜 O(s,i)：切换全知视角或受限玩家视角">
            <span class="vs-label">𝒪 滤镜</span>
            <select id="viewer-select"></select>
          </div>

          <div class="cam-switch">
            <button class="cam-btn active" data-cam="iso">2.5D等轴</button>
            <button class="cam-btn" data-cam="top">俯视</button>
            <button class="cam-btn" data-cam="seat">座位</button>
          </div>

          <button class="icon-btn" id="btn-undo" aria-label="撤销上一步">↶<span class="tip">撤销上一步动作</span></button>
          <button class="icon-btn" id="btn-audio" aria-label="音效">♪<span class="tip">音效开关</span></button>
          <button class="icon-btn" id="btn-inspector" aria-label="数学模型">𝒢<span class="tip">内核检查器 · I</span></button>
        </div>
      </header>

      <aside class="player-rail" id="player-rail"></aside>
      <div class="action-dock" id="action-dock"></div>
      <div class="announcement-banner" id="announce" style="display:none"></div>
      <div class="payload-layer" id="payload-layer" style="display:none"></div>
    `;

    this.container.querySelectorAll<HTMLElement>('.game-pill').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.game;
        if (id) this.options.onSwitchGame(id);
      });
    });

    this.container.querySelector('#viewer-select')?.addEventListener('change', event => {
      this.presenter.setViewer((event.target as HTMLSelectElement).value);
    });

    this.container.querySelectorAll<HTMLElement>('.cam-btn').forEach(button => {
      button.addEventListener('click', () => {
        const view = button.dataset.cam as CameraView | undefined;
        if (!view) return;
        this.container.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        this.ports.setCamera(view);
      });
    });

    this.container.querySelector('#btn-audio')?.addEventListener('click', () => {
      this.ports.setSound(!this.ports.isSoundOn());
      this.syncSoundButton();
    });

    this.container.querySelector('#btn-inspector')?.addEventListener('click', () => {
      this.ports.toggleInspector();
    });

    this.container.querySelector('#btn-undo')?.addEventListener('click', () => {
      const snapshot = this.latest;
      if (!snapshot || snapshot.log.cursor <= 0) {
        this.pushToast('↶', '没有可撤销的动作');
        return;
      }
      this.presenter.rewind(snapshot.log.cursor - 1);
      this.pushToast('↶', '已撤销上一步');
    });
  }

  private render(snapshot: GameSnapshot): void {
    this.latest = snapshot;
    this.container.querySelectorAll<HTMLElement>('.game-pill').forEach(button => {
      button.classList.toggle('active', button.dataset.game === snapshot.gameId);
    });

    this.renderViewerSelect(snapshot);
    this.renderPlayers(snapshot);
    this.renderDock(snapshot);
  }

  private renderViewerSelect(snapshot: GameSnapshot): void {
    const select = this.container.querySelector('#viewer-select') as HTMLSelectElement | null;
    if (!select) return;

    const signature = snapshot.viewers.map(v => `${v.id}:${v.name}`).join('|');
    if (select.dataset.signature !== signature) {
      select.innerHTML = snapshot.viewers
        .map(viewer => `<option value="${viewer.id}">${viewer.name}</option>`)
        .join('');
      select.dataset.signature = signature;
    }
    select.value = snapshot.viewer;
  }

  private renderPlayers(snapshot: GameSnapshot): void {
    const rail = this.container.querySelector('#player-rail');
    if (!rail) return;

    const playerCards = snapshot.players
      .map(player => {
        const hp = player.hp
          ? `<div class="hp-track">${Array.from({ length: player.hp.max })
              .map((_, index) => `<span class="hp-seg ${index < player.hp!.current ? 'on' : ''}"></span>`)
              .join('')}</div>`
          : '';

        // Betrayal traits carry a printed 0..8 track: draw a character-sheet
        // style ladder with the start value ringed instead of a flat pill.
        const ladder = player.pips.filter(pip => typeof pip.max === 'number' && pip.max > 0);
        const plainPips = player.pips.filter(pip => !(typeof pip.max === 'number' && pip.max > 0));

        const traitRows = ladder.length
          ? `<div class="pc-traits">${ladder
              .map(pip => {
                const max = pip.max ?? 8;
                const value = Number(pip.value);
                const start = Number(pip.start ?? -1);
                const segs = Array.from({ length: max })
                  .map((_, index) => {
                    const on = Number.isFinite(value) && index < value ? 'on' : '';
                    const mark = index === start ? 'start' : '';
                    return `<span class="trait-seg ${on} ${mark}"></span>`;
                  })
                  .join('');
                return `<div class="trait-row ${player.alive ? '' : 'dead'}" style="--trait-color:${pip.color}" title="${pip.label}">
                  <span class="trait-key">${pip.short ?? ''}</span>
                  <span class="trait-track">${segs}</span>
                  <span class="trait-val">${pip.value}</span>
                </div>`;
              })
              .join('')}</div>`
          : '';

        const pips =
          plainPips.length > 0
            ? `<div class="pc-pips">${plainPips
                .map(
                  pip =>
                    `<span class="pip" title="${pip.label}">${
                      pip.icon ? `<span>${pip.icon}</span>` : ''
                    }${pip.short ? `<span class="pip-k">${pip.short}</span>` : ''}<i style="background:${pip.color}"></i>${pip.value}</span>`
                )
                .join('')}</div>`
            : '';

        const stats = player.stats
          .map(stat => `<div class="pc-row"><span class="k">${stat.label}</span><span class="v">${stat.value}</span></div>`)
          .join('');

        return `
          <article class="pc ${player.isFocus ? 'active' : ''} ${player.alive ? '' : 'dead'}" style="--pc-color:${player.color}">
            <div class="pc-head">
              <div class="pc-avatar">${player.avatar}</div>
              <div class="pc-id">
                <div class="pc-name">${player.name}</div>
                <div class="pc-tags">
                  ${player.roleLabel ? `<span class="pc-role ${player.roleClass ?? ''}">${player.roleLabel}</span>` : ''}
                  ${player.isFocus ? `<span class="pc-turn"><span class="dot"></span>决策中</span>` : ''}
                </div>
              </div>
              <div class="pc-score"><b>${player.score}</b><span>${player.scoreLabel}</span></div>
            </div>
            <div class="pc-body">
              ${hp}
              ${traitRows}
              ${pips}
              ${stats}
            </div>
          </article>
        `;
      })
      .join('');

    const npcCards = (snapshot.npcs ?? [])
      .map(npc => {
        const stats = npc.stats
          .map(stat => `<div class="pc-row"><span class="k">${stat.label}</span><span class="v">${stat.value}</span></div>`)
          .join('');
        return `
          <article class="pc npc ${npc.isFocus ? 'active' : ''}" style="--pc-color:${npc.color}">
            <div class="pc-head">
              <div class="pc-avatar">${npc.avatar}</div>
              <div class="pc-id">
                <div class="pc-name">${npc.name}</div>
                <div class="pc-tags">
                  <span class="pc-role npc">NPC</span>
                  ${npc.isFocus ? `<span class="pc-turn"><span class="dot"></span>决策中</span>` : ''}
                </div>
              </div>
            </div>
            <div class="pc-body">${stats}</div>
          </article>
        `;
      })
      .join('');

    rail.innerHTML = playerCards + npcCards;
  }

  private renderDock(snapshot: GameSnapshot): void {
    const dock = this.container.querySelector('#action-dock');
    if (!dock) return;

    const alert = snapshot.decision
      ? `
        <div class="alert-strip decision">
          <div class="al-ico">🔒</div>
          <div class="al-body">
            <div class="al-title">${snapshot.decision.secret ? '秘密决策窗口' : '决策窗口'} · ${snapshot.decision.title}</div>
            <div class="al-desc">${snapshot.decision.description || snapshot.decision.policyLabel}</div>
          </div>
          <div class="al-wait">
            ${
              snapshot.decision.remaining !== undefined
                ? `<span class="chip timer">⏱ ${snapshot.decision.remaining} ticks</span>`
                : ''
            }
            ${snapshot.decision.participants
              .map(
                participant =>
                  `<span class="chip ${participant.committed ? 'done' : 'wait'}"><span class="c-dot"></span>${
                    participant.name
                  }${participant.committed ? ' · 已锁定' : ' · 待提交'}</span>`
              )
              .join('')}
          </div>
        </div>
      `
      : snapshot.stackDepth > 0 && snapshot.stack[0]?.window
      ? `
        <div class="alert-strip">
          <div class="al-ico">⚡</div>
          <div class="al-body">
            <div class="al-title">响应窗口开启 · ${snapshot.stack[0].title}</div>
            <div class="al-desc">${snapshot.stack[0].description}</div>
          </div>
          <div class="al-wait">
            ${
              snapshot.stack[0].window.remaining !== undefined
                ? `<span class="chip timer">⏱ ${snapshot.stack[0].window.remaining} ticks</span>`
                : ''
            }
            ${snapshot.stack[0].window.eligible
              .map(
                player =>
                  `<span class="chip ${player.pending ? 'wait' : 'done'}"><span class="c-dot"></span>${player.name}</span>`
              )
              .join('')}
          </div>
        </div>
      `
      : '';

    const buttons = snapshot.actions
      .map(
        action => `
        <button class="act ${action.tone === 'primary' ? 'primary' : action.tone === 'danger' ? 'danger' : ''}"
                data-action-id="${action.id}">
          <span class="act-ico">${action.icon}</span>
          <span class="act-txt">
            <span class="act-label">${action.label}</span>
            <span class="act-hint">${action.hint}</span>
          </span>
          <span class="act-key">${snapshot.actions.indexOf(action) + 1}</span>
        </button>
      `
      )
      .join('');

    const floorTabs = snapshot.spatial?.floors?.length
      ? `<div class="floor-tabs">
          <button class="floor-tab" data-floor="ALL">全部</button>
          ${snapshot.spatial.floors
            .map(
              floor =>
                `<button class="floor-tab ${snapshot.spatial?.activeFloor === floor.id ? 'active' : ''}" data-floor="${floor.id}">${floor.name}</button>`
            )
            .join('')}
        </div>`
      : '';

    const placement = snapshot.placement;
    const placementPanel = placement
      ? `
        <div class="placement-panel">
          <div class="placement-preview">
            <span class="pp-ico">🧭</span>
            <span class="pp-name">${placement.name}</span>
            <span class="pp-angle">${placement.rotation * 90}°</span>
            <span class="pp-hint">合法朝向 ${placement.rotations.length} 个：${placement.rotations
              .map(rotation => `${rotation * 90}°`)
              .join(' / ')}；拖动视角确认位置，旋转不会提交回合</span>
          </div>
          <button class="act primary placement-btn" data-place-rotate>
            <span class="act-ico">↻</span>
            <span class="act-txt"><span class="act-label">旋转房间</span><span class="act-hint">切换下一个合法朝向</span></span>
          </button>
          <button class="act primary placement-btn" data-place-confirm>
            <span class="act-ico">✔</span>
            <span class="act-txt"><span class="act-label">确认放置</span><span class="act-hint">按当前朝向落板块并进入房间</span></span>
          </button>
        </div>
      `
      : '';

    dock.innerHTML = `
      ${alert}
      ${
        snapshot.mission
          ? `<div class="alert-strip mission">
              <div class="al-ico">🎯</div>
              <div class="al-body">
                <div class="al-title">当前目标</div>
                <div class="al-desc">${snapshot.mission}</div>
              </div>
            </div>`
          : ''
      }
      ${floorTabs}
      <div class="dock-shell">
        <div class="dock-bar">
          <span class="dock-phase"><span class="ph-dot"></span>${snapshot.phaseLabel}</span>
          <span class="dock-who">行动者 <b>${snapshot.actorName}</b></span>
          <span class="dock-meta">
            <span class="m">R${snapshot.round}·T${snapshot.turn}</span>
            <span class="m">Σ ${snapshot.stackDepth}</span>
            <span class="m">Δ ${snapshot.openDecisions}</span>
            <span class="m">|ℒ| ${snapshot.legalCount}</span>
          </span>
        </div>
        <div class="dock-actions">
          ${
            placement
              ? placementPanel
              : snapshot.actions.length > 0
              ? buttons
              : `<div class="empty-hint"><span class="e-ico">◌</span><span>暂无可执行的合法动作 — 等待其他玩家，或正在结算响应栈。</span></div>`
          }
        </div>
      </div>
    `;

    dock.querySelector('[data-place-rotate]')?.addEventListener('click', () => {
      this.presenter.rotatePlacement(1);
    });
    dock.querySelector('[data-place-confirm]')?.addEventListener('click', () => {
      const result = this.presenter.confirmPlacement();
      if (!result.ok) this.pushToast('⚠️', result.error ?? '放置被拒绝');
    });

    dock.querySelectorAll<HTMLElement>('[data-action-id]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.actionId;
        if (!id) return;
        const action = snapshot.actions.find(candidate => candidate.id === id);
        if (!action) return;

        if (action.fields?.length || action.selection) {
          this.openPayloadForm(action);
          return;
        }

        if (action.highlightIds) this.ports.highlightBoard(action.highlightIds);
        else this.ports.highlightBoard(null);

        if (action.placementEntityId) {
          const result = this.presenter.armPlacement(action.id);
          if (!result.ok) this.pushToast('⚠️', result.error ?? '无法进入放置模式');
          return;
        }
        this.presenter.perform(id);
      });
    });
  }
}
