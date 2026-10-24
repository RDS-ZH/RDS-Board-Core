/**
 * Minimal application-layer i18n registry.
 *
 * Content is still largely Chinese, but UI/action labels now flow through one
 * translation point instead of being embedded in each renderer/session branch.
 * More locale dictionaries can be added without touching the kernel.
 *
 * TODO(i18n): static HUD/chrome strings (buttons, phase labels, mission text)
 * are still Chinese-only; game action labels are the supported subset.
 */

export type Locale = 'zh' | 'en';

let currentLocale: Locale = 'zh';

const EN: Record<string, string> = {
  掷骰子: 'Roll dice',
  结束回合: 'End turn',
  放弃响应: 'Pass',
  摸2张牌: 'Draw 2 cards',
  发起玩家交易: 'Propose trade',
  接受交易: 'Accept trade',
  拒绝交易: 'Reject trade',
  购买发展卡: 'Buy development card',
  探索房门: 'Explore door',
  放置: 'Place',
  移动至相邻房间: 'Move to adjacent room',
  提亲: 'Propose',
  使用: 'Use',
  丢下: 'Drop',
  拾取: 'Pick up',
  结束怪物回合: 'End monster turn',
  进行作祟检定: 'Haunt check',
  施展: 'Cast'
};

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/** Translate a static text fragment; unknown fragments stay in Chinese. */
export function translateText(text: string): string {
  if (currentLocale === 'zh') return text;
  const exact = EN[text];
  if (exact) return exact;
  // Prefix fallback for dynamic labels such as `探索房门 · 北`.
  for (const [zh, en] of Object.entries(EN)) {
    if (text.startsWith(zh)) return `${en}${text.slice(zh.length)}`;
  }
  return text;
}
