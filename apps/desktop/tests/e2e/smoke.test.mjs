import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Builder, By, Capabilities, until } from "selenium-webdriver";

// Built by `pnpm e2e:smoke` (build:debug with VITE_DESKTOP_E2E=true) before this runs.
const application = fileURLToPath(new URL(
  `../../src-tauri/target/debug/cadence-desktop${process.platform === "win32" ? ".exe" : ""}`,
  import.meta.url,
));

let driver;
let tauriDriver;

before(async () => {
  const nativeDriver = process.env.TAURI_NATIVE_DRIVER;
  tauriDriver = spawn("tauri-driver", nativeDriver ? ["--native-driver", nativeDriver] : [], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForWebDriverServer();

  const capabilities = new Capabilities();
  capabilities.set("tauri:options", { application });
  capabilities.setBrowserName("wry");
  driver = await new Builder().usingServer("http://127.0.0.1:4444/").withCapabilities(capabilities).build();

  await waitForBridge();
}, { timeout: 120000 });

after(async () => {
  await driver?.quit().catch(() => {});
  tauriDriver?.kill();
});

describe("Cadence desktop smoke suite", () => {
  it("boots the shared frontend in desktop runtime", async () => {
    assert.match(await driver.getTitle(), /Cadence/);
  });

  // Headings fade in from opacity 0 (CardPage), and getText() returns only visible
  // text, so read textContent instead.
  it("renders the auth entry route", async () => {
    await navigateTo("/auth/sign-in");
    const heading = await driver.wait(until.elementLocated(By.xpath("//h1[contains(., 'Sign in to Cadence')]")), 15000);
    assert.match(await heading.getAttribute("textContent"), /Sign in to Cadence/);
  });

  // No pending sign-in, so the callback must refuse rather than hang.
  it("renders the auth callback route safely", async () => {
    await navigateTo("/auth/callback?redirectTo=%2F");
    const heading = await driver.wait(until.elementLocated(By.xpath("//h1[contains(., 'Sign-in failed')]")), 15000);
    assert.equal(await heading.getAttribute("textContent"), "Sign-in failed");
  });

  it("handles auth callback deep links through single-instance handoff", async () => {
    await navigateTo("/auth/sign-in");

    const deepLinkUrl = await callBridge("getAuthCallbackUrl", "/from-e2e");
    assert.equal(deepLinkUrl, "cadence://auth/callback?redirectTo=%2Ffrom-e2e");

    spawn(application, [deepLinkUrl], { stdio: "ignore", windowsHide: true });

    await driver.wait(
      async () => {
        const location = await driver.executeScript("return location.pathname + location.search;");
        return location.startsWith("/auth/callback") && location.includes("redirectTo=%2Ffrom-e2e");
      },
      20000,
      "Cadence did not process the deep-link callback.",
    );
  });

  it("uses native HTTP transport for API health checks", async () => {
    const health = await callBridge("healthCheck");
    assert.equal(health.ok, true);
    assert.equal(health.status, 200);
    // The API wraps every body in a `data` envelope.
    assert.equal(health.data.data.status, "ok");
  });

  // Sign-in and sign-out ride on this patch (0.25.2/0.25.3); unpatched, the webview's fetch is
  // CORS-blocked and throws. Signed out, get-session answers 200 with no session.
  it("routes Neon Auth requests through the patched native fetch", async () => {
    assert.equal(await callBridge("authFetchStatus"), 200);
  });

  it("round-trips the native store", async () => {
    assert.equal(await callBridge("storeRoundTrip", "e2e-probe"), "e2e-probe");
  });

  it("reads notification permission", async () => {
    assert.ok(["default", "granted", "denied"].includes(await callBridge("getNotificationPermission")));
  });

  // The bridge turns every updater failure into { available: false, error }, so assert no error.
  // Needs the published latest.json on GitHub to be reachable.
  it("checks for updates without error", async () => {
    const update = await callBridge("checkForUpdates");
    assert.equal(update.error, undefined);
  });
});

async function waitForWebDriverServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await fetch("http://127.0.0.1:4444/status").then((r) => r.ok, () => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("tauri-driver did not become ready on http://127.0.0.1:4444.");
}

// The bridge is installed once the app boots, so it is gone right after any reload.
function waitForBridge() {
  return driver.wait(
    () => driver.executeScript("return window.__CADENCE_DESKTOP_E2E__?.runtimeTarget === 'desktop';"),
    20000,
    "Cadence desktop test bridge did not become available.",
  );
}

async function navigateTo(route) {
  await driver.executeScript("location.assign(arguments[0]);", route);
  await driver.wait(
    async () => (await driver.executeScript("return location.pathname + location.search;")) === route,
    15000,
    `Cadence did not navigate to ${route}.`,
  );
  await waitForBridge();
}

// executeScript awaits a returned promise; a rejection surfaces as a JavaScriptError.
function callBridge(method, ...args) {
  return driver.executeScript("return window.__CADENCE_DESKTOP_E2E__[arguments[0]](...arguments[1]);", method, args);
}
