import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import process from 'node:process';

/**
 * Start (or reuse) a solo-mode Vite server for layout probes.
 *
 * Uses scripts/lib/vite-solo.config.mjs, which omits the Hub proxy. Without it
 * the unified shell would detect a running Hub, show the lobby, and never mount
 * the game DOM — turning every geometry assertion into a vacuous pass.
 */

const HOST = '127.0.0.1';
const PORT = Number(process.env.SOLO_PORT ?? 5180);

export const SOLO_URL = `http://${HOST}:${PORT}/`;

function probe() {
  return new Promise(resolve => {
    const socket = connect({ port: PORT, host: HOST });
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`solo dev server did not listen on ${HOST}:${PORT}`);
}

export async function ensureSoloServer() {
  if (await probe()) {
    console.log(`· reusing the solo dev server on ${HOST}:${PORT}`);
    return { started: false, url: SOLO_URL, stop() {} };
  }

  console.log(`· starting solo vite on ${HOST}:${PORT} (no Hub proxy)`);
  const server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--config',
      'scripts/lib/vite-solo.config.mjs',
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      HOST
    ],
    { stdio: 'inherit' }
  );
  await waitForPort();
  // Vite reports ready slightly before the first transform completes.
  await new Promise(r => setTimeout(r, 1200));

  return {
    started: true,
    url: SOLO_URL,
    stop() {
      server.kill();
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    }
  };
}
