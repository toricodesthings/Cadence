import { API_BASE_URL } from "../lib/env";
import {
  checkForAppUpdate,
  getAuthCallbackUrl,
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
      checkForUpdates: () => Promise<DesktopBridgeUpdateCheck>;
    };
  }
}

export function installDesktopE2EBridge() {
  if (!IS_DESKTOP_RUNTIME || !import.meta.env.DEV || typeof window === "undefined") {
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
