import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import process from 'node:process';

/**
 * Make sure a Vite dev server answers on BASE_URL.
 *
 * Capture and UI-matrix runs need a live page; making them boot the server
 * themselves removes the "start pnpm dev first" step for contributors.
 * Returns a handle whose `stop()` shuts the server down only when this process
 * started it.
 */

const DEFAULT_PORT = 5173;
const HOST = '127.0.0.1';

export function devPort() {
  try {
    return Number(new URL(process.env.BASE_URL ?? `http://${HOST}:${DEFAULT_PORT}/`).port) || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function probe() {
  const port = devPort();
  return new Promise(resolve => {
    const socket = connect({ port, host: HOST });
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

async function waitForPort(timeoutMs = 40000) {
  const port = devPort();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`dev server did not listen on ${HOST}:${port}`);
}

export async function ensureDevServer() {
  const port = devPort();
  if (await probe()) {
    console.log(`· reusing the dev server already listening on ${HOST}:${port}`);
    return { started: false, stop() {} };
  }

  console.log(`· starting vite on ${HOST}:${port} …`);
  const server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', HOST],
    { stdio: 'inherit' }
  );
  await waitForPort();
  // Vite logs "ready" slightly before the first module transform completes.
  await new Promise(r => setTimeout(r, 1200));

  return {
    started: true,
    stop() {
      server.kill();
      if (process.platform === 'win32') {
        // Vite spawns a worker; take the whole tree down.
        spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    }
  };
}
