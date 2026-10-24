import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

/**
 * Shared headless-Chromium launcher for the capture and UI-matrix scripts.
 *
 * Resolution order:
 *   1. CHROME_PATH environment variable (explicit override)
 *   2. a system Chrome at the usual per-OS location, if it exists
 *   3. Playwright's own bundled Chromium (`playwright install chromium`)
 *
 * The software-GL flags keep WebGL working on machines without a usable GPU
 * (CI containers, remote desktops), which is the whole point of these runs.
 */

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];

const GL_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--disable-gpu-sandbox'
];

/** Absolute path to a usable Chrome, or undefined to use Playwright's build. */
export function resolveChromePath() {
  const fromEnv = process.env.CHROME_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const candidate of CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function launchChromium(options = {}) {
  const executablePath = resolveChromePath();
  if (!executablePath) {
    console.log('· no system Chrome found, falling back to Playwright Chromium');
  }
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    args: GL_ARGS,
    ...options
  });
}

/** Base URL for the dev server, overridable in CI. */
export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
