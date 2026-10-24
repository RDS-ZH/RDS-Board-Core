import { UiCardDetail } from '@rds/app/contracts';

/**
 * Deterministic ink illustration for the card detail sheet.
 *
 * The art is intentionally line-work rather than raster: it reads like a
 * woodcut plate in an old folio, scales cleanly, and needs no external assets.
 * Motifs are chosen from the card's own name so every card has a stable plate.
 */
export function cardArtSvg(card: UiCardDetail): string {
  const title = `${card.title} ${card.en ?? ''}`.toLowerCase();
  const motif = motifFor(title, card.kind);
  const lines = hatchLines(title);
  return `
    <svg viewBox="0 0 220 140" role="img" aria-label="${escapeXml(card.title)}">
      <defs>
        <radialGradient id="artGlow" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stop-color="rgba(255,244,210,0.7)" />
          <stop offset="100%" stop-color="rgba(90,62,28,0.02)" />
        </radialGradient>
        <pattern id="artHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" stroke-width="0.6" opacity="0.18" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="218" height="138" rx="5" fill="url(#artGlow)" />
      <rect x="9" y="9" width="202" height="122" fill="url(#artHatch)" opacity="0.55" />
      <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        ${lines}
        ${motif}
      </g>
      <g fill="currentColor" opacity="0.55">
        <circle cx="18" cy="18" r="1.3" />
        <circle cx="202" cy="18" r="1.3" />
        <circle cx="18" cy="122" r="1.3" />
        <circle cx="202" cy="122" r="1.3" />
      </g>
    </svg>
  `;
}

function motifFor(title: string, kind: string): string {
  if (/(骷髅|头骨|skull|骨)/.test(title)) return skull();
  if (/(眼|eye|目|凝视)/.test(title)) return eye();
  if (/(鸦|raven|crow|鸟)/.test(title)) return raven();
  if (/(手|hand|爪|claw)/.test(title)) return hand();
  if (/(斧|axe|刀|blade|矛|spear|枪|revolver|gun|剑)/.test(title)) return weapon();
  if (/(绳|rope|链|chain)/.test(title)) return rope();
  if (/(钥匙|key|锁|lock)/.test(title)) return key();
  if (/(书|book|卷|tome|知识)/.test(title)) return book();
  if (/(烛|candle|灯|lantern|火|fire)/.test(title)) return candle();
  if (/(心|heart|医疗|medical|药|potion)/.test(title)) return heart();
  if (/(幽灵|ghost|spirit|魂|灵|雾|fog)/.test(title)) return ghost();
  if (kind === 'EVENT') return event();
  if (kind === 'ROOM') return room();
  return seal();
}

function hatchLines(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const x = 16 + (h % 188);
    const y = 20 + ((h >>> 8) % 100);
    out.push(`<path d="M${x} ${y} l${8 + (h % 14)} ${-4 - (h % 9)}" opacity="0.22" />`);
  }
  return out.join('');
}

function skull(): string {
  return `
    <path d="M78 86c-9-8-12-20-6-31 7-13 22-19 38-17 17 2 29 12 31 26 2 12-3 20-11 26-4 3-5 7-4 12H85c1-6 0-11-7-16Z" fill="rgba(40,28,14,0.10)" />
    <path d="M91 84c0-12 8-20 19-20s19 8 19 20" />
    <path d="M85 88h42M91 104h31" opacity="0.6" />
    <ellipse cx="99" cy="80" rx="5" ry="6" fill="currentColor" />
    <ellipse cx="121" cy="80" rx="5" ry="6" fill="currentColor" />
    <path d="M106 91l4 6 4-6M102 100v7M110 100v8M118 100v7" />
  `;
}

function eye(): string {
  return `
    <path d="M62 72c18-24 42-33 61-30 17 3 30 14 38 30-15 24-39 35-64 30-15-3-27-13-35-30Z" fill="rgba(40,28,14,0.08)" />
    <circle cx="113" cy="72" r="19" />
    <circle cx="113" cy="72" r="8" fill="currentColor" />
    <circle cx="107" cy="66" r="2.5" fill="rgba(255,245,220,0.9)" stroke="none" />
    <path d="M70 72l-8-13M156 72l9-14M78 62l-4-16M149 62l6-17" opacity="0.7" />
  `;
}

function raven(): string {
  return `
    <path d="M84 54c16-10 36-8 48 6 8 9 6 20-3 26-8 5-17 2-23-3-6 7-17 9-25 3-9-7-9-22 3-32Z" fill="rgba(40,28,14,0.09)" />
    <path d="M132 59l19-7-13 13M96 52l-12-9 3 14" />
    <circle cx="117" cy="64" r="2.3" fill="currentColor" />
    <path d="M82 85l-9 17M104 88l-5 18M113 88l5 18M127 84l9 16" opacity="0.8" />
  `;
}

function hand(): string {
  return `
    <path d="M76 102c-7-8-9-22-3-31l9-13c2-3 7-1 6 3l-3 11 15-29c2-3 7-1 6 3l-8 26 14-22c2-3 7 0 6 4l-9 23 11-13c3-3 7 1 5 4l-15 25c-5 8-15 13-25 9-6-2-10-8-9-10Z" fill="rgba(40,28,14,0.08)" />
    <path d="M78 94c9 7 24 8 34 0M90 70l4 24M102 66l2 28M113 70l-2 22" opacity="0.65" />
  `;
}

function weapon(): string {
  return `
    <path d="M64 112L142 30l8-8 5 5-8 8-78 82Z" fill="rgba(40,28,14,0.10)" />
    <path d="M136 26l14-10-3 18M70 98l-14 14M78 84l10 9M88 72l10 9M98 62l9 9" />
    <path d="M64 112l8-2-6-6Z" fill="currentColor" />
  `;
}

function rope(): string {
  return `
    <path d="M70 40c26 8 55 18 66 46 9 24-14 37-32 25-18-12-4-31 15-25 18 6 26 24 19 40" fill="none" />
    <path d="M70 40l13 8M83 48l11 7M94 55l11 8M105 63l10 9M115 72l9 11M124 83l8 12M132 95l6 14" opacity="0.55" />
    <path d="M68 34l10-8M150 120l10 8" opacity="0.7" />
  `;
}

function key(): string {
  return `
    <circle cx="90" cy="66" r="22" fill="rgba(40,28,14,0.08)" />
    <circle cx="90" cy="66" r="9" />
    <path d="M108 78l50 50M142 112l12-12M152 122l12-12" />
    <path d="M74 50l-6-10M102 52l8-9M80 82l-9 7" opacity="0.55" />
  `;
}

function book(): string {
  return `
    <path d="M62 42l48-14 48 14v66l-48-14-48 14Z" fill="rgba(40,28,14,0.07)" />
    <path d="M110 28v80M72 48l28 8M72 62l28 8M120 56l28-8M120 70l28-8" opacity="0.8" />
    <circle cx="110" cy="68" r="12" opacity="0.55" />
    <path d="M110 56l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z" fill="currentColor" stroke="none" opacity="0.5" />
  `;
}

function candle(): string {
  return `
    <path d="M95 112V58h30v54M88 112h44" />
    <path d="M110 46c-7-8-4-17 0-23 5 7 8 15 0 23Z" fill="currentColor" stroke="none" opacity="0.75" />
    <path d="M110 30c-13 10-9 28 0 34M98 70l5-5M118 77l6-6" opacity="0.6" />
    <path d="M88 112l-10 8M132 112l10 8" opacity="0.5" />
  `;
}

function heart(): string {
  return `
    <path d="M110 112C88 94 72 82 72 64c0-13 10-22 22-22 8 0 14 4 16 11 3-7 9-11 17-11 12 0 21 9 21 22 0 18-16 30-38 48Z" fill="rgba(110,30,36,0.12)" />
    <path d="M82 58h14l6-10 10 24 8-14h18" opacity="0.8" />
    <path d="M110 74v22M102 84h16" opacity="0.55" />
  `;
}

function ghost(): string {
  return `
    <path d="M78 106V66c0-18 14-30 32-30s32 12 32 30v40l-10-8-8 8-9-8-9 8-8-8-9 8-7-8Z" fill="rgba(40,28,14,0.06)" />
    <circle cx="99" cy="66" r="3" fill="currentColor" />
    <circle cx="121" cy="66" r="3" fill="currentColor" />
    <path d="M102 82c5 5 11 5 16 0M90 48c7-8 33-8 40 0" opacity="0.6" />
  `;
}

function event(): string {
  return `
    <path d="M110 24l-24 44 18-4-14 42 34-48-18 4 18-38Z" fill="rgba(40,28,14,0.10)" />
    <path d="M70 116c12-14 18-20 40-20s28 6 40 20" opacity="0.55" />
    <path d="M60 40l-10-10M160 40l10-10M50 90h-14M184 90h-14" opacity="0.4" />
  `;
}

function room(): string {
  return `
    <path d="M72 112V58l38-24 38 24v54" fill="rgba(40,28,14,0.07)" />
    <path d="M92 112V86c0-8 8-12 18-12s18 4 18 12v26" />
    <path d="M82 66h56M110 34v18" opacity="0.6" />
    <circle cx="120" cy="98" r="1.5" fill="currentColor" />
  `;
}

function seal(): string {
  return `
    <circle cx="110" cy="70" r="34" fill="rgba(40,28,14,0.06)" />
    <circle cx="110" cy="70" r="26" opacity="0.6" />
    <path d="M110 36v68M76 70h68M86 46l48 48M134 46l-48 48" opacity="0.35" />
    <path d="M110 58l5 10 11 1-8 7 2 11-10-5-10 5 2-11-8-7 11-1Z" fill="currentColor" stroke="none" opacity="0.55" />
  `;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, char => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
    return map[char];
  });
}
