import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../../../", import.meta.url);
const host = "127.0.0.1";
const desktopPort = 8790;
const bridgePort = 8788;

function run(label, args) {
  const child = spawn("pnpm", args, {
    cwd: fileURLToPath(repoRoot),
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if (typeof code === "number" && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      process.exit(code);
    }
  });

  return child;
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function detectFrontendMode(port) {
  try {
    const response = await fetch(`http://${host}:${port}/auth/sign-in`);
    const html = await response.text();
    if (html.includes("manifest.webmanifest") || html.includes("mobile-web-app-capable")) {
      return "web";
    }
    if (html.includes("<title>Cadence</title>")) {
      return "desktop";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function ensureServer({ label, port, expectedMode, startArgs }) {
  const open = await isPortOpen(port);
  if (!open) {
    return run(label, startArgs);
  }

  const mode = await detectFrontendMode(port);
  if (mode !== expectedMode) {
    throw new Error(
      `Port ${port} is already in use by an incompatible frontend (${mode}). `
        + `Expected ${expectedMode}. Stop the existing server or use the matching workflow.`,
    );
  }

  console.log(`[${label}] reusing existing ${expectedMode} frontend on http://${host}:${port}`);
  return null;
}

const children = [];

try {
  const desktopChild = await ensureServer({
    label: "desktop-frontend",
    port: desktopPort,
    expectedMode: "desktop",
    startArgs: ["--filter", "@cadence/frontend", "dev:desktop"],
  });
  if (desktopChild) {
    children.push(desktopChild);
  }

  const bridgeChild = await ensureServer({
    label: "browser-bridge",
    port: bridgePort,
    expectedMode: "web",
    startArgs: ["--filter", "@cadence/frontend", "dev"],
  });
  if (bridgeChild) {
    children.push(bridgeChild);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
