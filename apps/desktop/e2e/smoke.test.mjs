import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { Builder, By, Capabilities, until } from "selenium-webdriver";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const application = path.resolve(
  desktopRoot,
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "cadence-desktop.exe" : "cadence-desktop",
);
const tauriDriverBinary =
  process.env.TAURI_DRIVER_PATH
  ?? path.resolve(
    os.homedir(),
    ".cargo",
    "bin",
    process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver",
  );
const pnpmBinary = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let driver;
let tauriDriver;

before(async function () {
  this.timeout(300000);

  buildDesktopDebugBinary();
  tauriDriver = spawn(tauriDriverBinary, [], {
    stdio: [null, process.stdout, process.stderr],
    shell: false,
  });

  await waitForWebDriverServer();

  const capabilities = new Capabilities();
  capabilities.set("tauri:options", { application });
  capabilities.setBrowserName("wry");

  driver = await new Builder()
    .usingServer("http://127.0.0.1:4444/")
    .withCapabilities(capabilities)
    .build();

  await driver.manage().setTimeouts({
    implicit: 0,
    pageLoad: 30000,
    script: 30000,
  });

  await driver.wait(
    async () =>
      Boolean(
        await driver.executeScript("return window.__CADENCE_DESKTOP_E2E__?.runtimeTarget === 'desktop';"),
      ),
    20000,
    "Cadence desktop test bridge did not become available.",
  );
});

after(async function () {
  await closeSession();
});

describe("Cadence desktop smoke suite", () => {
  it("boots the shared frontend in desktop runtime", async () => {
    expect(await driver.getTitle()).to.contain("Cadence");
    expect(
      await driver.executeScript("return window.__CADENCE_DESKTOP_E2E__?.runtimeTarget ?? null;"),
    ).to.equal("desktop");
  });

  it("renders the auth entry route", async () => {
    await navigateTo("/auth/sign-in");

    const heading = await driver.wait(
      until.elementLocated(By.xpath("//h1[contains(., 'Step into your Cadence')]")),
      15000,
    );

    expect(await heading.getText()).to.contain("Step into your Cadence");
  });

  it("renders the auth callback route safely", async () => {
    await navigateTo("/auth/callback?redirectTo=%2F");

    const heading = await driver.wait(
      until.elementLocated(By.xpath("//h1[contains(., 'Completing sign in')]")),
      15000,
    );

    expect(await heading.getText()).to.equal("Completing sign in");
  });

  it("handles auth callback deep links through single-instance handoff", async () => {
    await navigateTo("/auth/sign-in");

    const deepLinkUrl = await callBridge("getAuthCallbackUrl", "/from-e2e");
    expect(deepLinkUrl).to.equal("cadence://auth/callback?redirectTo=%2Ffrom-e2e");

    spawn(application, [deepLinkUrl], {
      detached: false,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });

    await driver.wait(
      async () => {
        const location = await driver.executeScript(
          "return window.location.pathname + window.location.search;",
        );
        return (
          typeof location === "string"
          && location.startsWith("/auth/callback")
          && location.includes("redirectTo=%2Ffrom-e2e")
        );
      },
      20000,
      "Cadence did not process the deep-link callback.",
    );
  });

  it("uses native HTTP transport for API health checks", async () => {
    const health = await callBridge("healthCheck");

    expect(health.ok).to.equal(true);
    expect(health.status).to.equal(200);
    expect(health.data).to.include({ status: "ok" });
  });

  it("checks notification and updater APIs without crashing", async () => {
    const permission = await callBridge("getNotificationPermission");
    expect(["default", "granted", "denied"]).to.include(permission);

    const updateCheck = await callBridge("checkForUpdates");
    expect(updateCheck).to.have.property("available");
  });
});

function buildDesktopDebugBinary() {
  const result = spawnSync(pnpmBinary, ["run", "build:debug"], {
    cwd: desktopRoot,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      TAURI_WEBVIEW_AUTOMATION:
        process.env.TAURI_WEBVIEW_AUTOMATION ?? (process.platform === "linux" ? "true" : ""),
    },
  });

  if (result.status !== 0) {
    throw new Error(`Desktop debug build failed with exit code ${result.status ?? "unknown"}.`);
  }
}

async function waitForWebDriverServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4444/status");
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting until the driver responds.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("tauri-driver did not become ready on http://127.0.0.1:4444.");
}

async function navigateTo(route) {
  await driver.executeScript("window.location.assign(arguments[0]);", route);
  await driver.wait(
    async () => {
      const location = await driver.executeScript(
        "return window.location.pathname + window.location.search;",
      );
      return typeof location === "string" && location === route;
    },
    15000,
    `Cadence did not navigate to ${route}.`,
  );
}

async function callBridge(method, ...args) {
  const result = await driver.executeAsyncScript(
    `
      const method = arguments[0];
      const args = arguments[1];
      const done = arguments[arguments.length - 1];
      const bridge = window.__CADENCE_DESKTOP_E2E__;

      if (!bridge || typeof bridge[method] !== "function") {
        done({ ok: false, error: "Cadence desktop test bridge is unavailable." });
        return;
      }

      Promise.resolve(bridge[method](...(args || [])))
        .then((value) => done({ ok: true, value }))
        .catch((error) => {
          done({
            ok: false,
            error: error && typeof error === "object" && "message" in error
              ? String(error.message)
              : String(error),
          });
        });
    `,
    method,
    args,
  );

  if (!result?.ok) {
    throw new Error(result?.error ?? `Bridge call ${method} failed.`);
  }

  return result.value;
}

async function closeSession() {
  if (driver) {
    try {
      await driver.quit();
    } catch {
      // Ignore shutdown failures so the driver process can still be cleaned up.
    }

    driver = undefined;
  }

  if (tauriDriver) {
    tauriDriver.kill();
    tauriDriver = undefined;
  }
}
