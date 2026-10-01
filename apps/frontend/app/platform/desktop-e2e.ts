import { API_BASE_URL, NEON_AUTH_URL } from "../lib/env";
import {
  checkForAppUpdate,
  getAuthCallbackUrl,
  getDesktopStore,
  getNotificationPermission,
  IS_DESKTOP_RUNTIME,
  platformFetch,
} from "./runtime";

interface DesktopBridgeHealthCheck {
  ok: boolean;
  status: number;
  data: unknown;
}

interface DesktopBridgeUpdateCheck {
  available: boolean;
  currentVersion?: string;
  version?: string;
  date?: string;
  error?: string;
}

declare global {
  interface Window {
    __CADENCE_DESKTOP_E2E__?: {
      runtimeTarget: "desktop";
      getAuthCallbackUrl: (redirectTo?: string) => string;
      getNotificationPermission: () => ReturnType<typeof getNotificationPermission>;
      healthCheck: () => Promise<DesktopBridgeHealthCheck>;
      authFetchStatus: () => Promise<number>;
      storeRoundTrip: (value: string) => Promise<string | undefined>;
      checkForUpdates: () => Promise<DesktopBridgeUpdateCheck>;
    };
  }
}

export function installDesktopE2EBridge() {
  if (
    !IS_DESKTOP_RUNTIME
    || import.meta.env.VITE_DESKTOP_E2E !== "true"
    || typeof window === "undefined"
  ) {
    return () => {};
  }

  window.__CADENCE_DESKTOP_E2E__ = {
    runtimeTarget: "desktop",
    getAuthCallbackUrl,
    getNotificationPermission,
    async healthCheck() {
      const response = await platformFetch(`${API_BASE_URL}/health`);
      const data = await response.json();

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    },
    // Plain fetch, so it goes through patch-desktop-fetch; the webview's own fetch is CORS-blocked here.
    async authFetchStatus() {
      return (await fetch(`${NEON_AUTH_URL}/get-session`)).status;
    },
    async storeRoundTrip(value) {
      const store = await getDesktopStore("e2e");
      if (!store) throw new Error("Native store unavailable.");
      await store.set("probe", value);
      const read = await store.get<string>("probe");
      await store.del("probe");
      return read;
    },
    async checkForUpdates() {
      try {
        const update = await checkForAppUpdate();

        if (!update) {
          return { available: false };
        }

        return {
          available: true,
          currentVersion: update.currentVersion,
          version: update.version,
          date: update.date,
        };
      } catch (error) {
        return {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  return () => {
    delete window.__CADENCE_DESKTOP_E2E__;
  };
}
