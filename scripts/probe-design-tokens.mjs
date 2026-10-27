import fs from 'node:fs';
import path from 'node:path';

/**
 * Design-token guard (docs/UI-ARCHITECTURE.md Phase 1).
 *
 * Catches the three ways this layer breaks silently:
 *
 * 1. Hardcoded px font sizes — everything must go through the fluid type scale,
 *    whose floor is 12px (the layout probe rejects anything smaller).
 *
 * 2. Stale aliases. A custom property declared as `var(--b)` is substituted once,
 *    in the scope where it is declared. If `--b` is overridden by a *theme* on a
 *    descendant element, the alias keeps the root-scope value and the theme
 *    silently does nothing. That bug shipped once: `--text: var(--text-primary)`
 *    made the gothic theme fall back to slate text colours. Primitive ->
 *    semantic indirection is fine; aliasing a *theme-overridable* token is not.
 *
 * 3. References to tokens that are never declared and carry no fallback.
 */

const UI_DIR = 'apps/web/src/ui';
const TOKEN_SHEETS = ['tokens/primitives.css', 'tokens/semantic.css', 'tokens/themes.css'];
const COMPONENT_SHEETS = ['styles.css', 'dock-fan.css', 'layout-phase0.css', 'theme-gothic.css'];
const ALL_SHEETS = [...TOKEN_SHEETS, ...COMPONENT_SHEETS];

/** Component props written inline by templates (hud.ts, mathInspector.ts). */
const RUNTIME_PROPS = new Set([
  '--i',
  '--off',
  '--abs',
  '--pct',
  '--ribbon',
  '--trait-color',
  '--pc-color',
  '--ink'
]);

const failures = [];
const read = rel => fs.readFileSync(path.join(UI_DIR, rel), 'utf8');

/* ---- 1. no px font sizes in any sheet ---------------------------------- */
for (const sheet of ALL_SHEETS) {
  const hits = [...read(sheet).matchAll(/font-size:\s*[0-9.]+px/g)];
  if (hits.length) failures.push(`${sheet}: ${hits.length} hardcoded px font-size`);
}

/* ---- collect declarations ---------------------------------------------- */
const declared = new Map(); // token -> value (first declaration wins for reporting)
const themeScopeTokens = new Set(); // tokens a theme overrides

/**
 * Index every declaration with the selector chain it sits in, using real brace
 * depth. A fixed look-back window misses declarations deep inside a block.
 */
function scanDeclarations(src) {
  const out = [];
  let depth = 0;
  let buffer = '';
  let selector = '';
  let inComment = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inComment) {
      if (ch === '*' && next === '/') { inComment = false; i++; }
      continue;
    }
    if (ch === '/' && next === '*') { inComment = true; i++; continue; }

    if (ch === '{') {
      selector = buffer.trim();
      buffer = '';
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      buffer = '';
      continue;
    }
    if (ch === ';') {
      const decl = buffer.trim();
      buffer = '';
      const m = decl.match(/^(--[a-z0-9-]+)\s*:\s*([\s\S]+)$/i);
      if (m) out.push({ token: m[1], value: m[2].trim(), selector });
      continue;
    }
    buffer += ch;
  }
  return out;
}

for (const sheet of ALL_SHEETS) {
  for (const decl of scanDeclarations(read(sheet))) {
    if (!declared.has(decl.token)) declared.set(decl.token, decl.value);
    // A declaration whose enclosing selector is a theme scope is an override.
    if (/\[data-theme/.test(decl.selector)) themeScopeTokens.add(decl.token);
  }
}

/* ---- 2. stale aliases: `--a: var(--b)` where themes override --b -------- */
for (const [token, value] of declared) {
  if (RUNTIME_PROPS.has(token)) continue;
  const target = value.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i)?.[1];
  if (!target) continue;
  if (themeScopeTokens.has(target) && !themeScopeTokens.has(token)) {
    failures.push(
      `${token}: aliases ${target}, which a theme overrides — the alias keeps the root value and the theme silently does nothing`
    );
  }
}

/* ---- 3. unresolved references (only when no fallback is provided) ------ */
const allCss = ALL_SHEETS.map(read).join('\n');
const unresolved = new Set();
for (const m of allCss.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/gim)) {
  const [, token, next] = m;
  if (next === ',') continue; // has a fallback
  if (declared.has(token) || RUNTIME_PROPS.has(token)) continue;
  unresolved.add(token);
}
for (const token of unresolved) failures.push(`${token}: referenced without a fallback but never declared`);

/* ---- report ------------------------------------------------------------ */
const typeSteps = [...declared.keys()].filter(t => /^--type-/.test(t)).length;
console.log(
  `design tokens: ${declared.size} declared (${typeSteps} type steps), ` +
    `${themeScopeTokens.size} theme-overridable, ${ALL_SHEETS.length} sheets`
);
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nDesign-token guard passed.');
}
