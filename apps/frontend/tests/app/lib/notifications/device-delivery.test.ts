import { describe, expect, it } from "vitest";
import { deviceStatus, type DeviceFacts } from "../../../../app/lib/notifications/device-delivery";

const base: DeviceFacts = { unsupported: false, iosTab: false, permission: "granted", accountOn: true, thisDevice: { enabled: true, push: true } };
const status = (over: Partial<DeviceFacts>) => deviceStatus({ ...base, ...over });

describe("deviceStatus", () => {
    it("is connected only with permission, the account switch on, and a registered push device", () => {
        expect(status({})).toBe("connected");
        expect(status({ thisDevice: { enabled: true, push: false } })).toBe("local");
        expect(status({ permission: "default" })).toBe("off");
        expect(status({ accountOn: false })).toBe("off");
    });

    it("is off when this device has no row yet, or was switched off from anywhere", () => {
        expect(status({ thisDevice: undefined })).toBe("off");
        expect(status({ thisDevice: { enabled: false, push: true } })).toBe("off");
    });

    it("keeps unsupported, install and denied apart instead of calling them all blocked", () => {
        expect(status({ unsupported: true, permission: "default" })).toBe("unsupported");
        expect(status({ iosTab: true, unsupported: true, permission: "default" })).toBe("install");
        expect(status({ permission: "denied", thisDevice: undefined })).toBe("denied");
    });
});

import { duplicateRisk } from "../../../../app/lib/notifications/device-delivery";
import type { Device } from "@cadence/contracts/push";

const device = (over: Partial<Device>): Device =>
    ({ installId: crypto.randomUUID(), kind: "computer", label: "Chrome on Windows", enabled: true, push: true, lastSeenAt: null, createdAt: "2026-10-07T00:00:00.000Z", ...over });

describe("duplicateRisk", () => {
    const app = device({ kind: "desktop-app", label: "Cadence app on Windows", push: false });
    const browser = device({ kind: "computer" });
    const phone = device({ kind: "phone", label: "Cadence on iPhone" });

    it("warns a pushed browser about the desktop app, naming the app as the one to drop", () => {
        expect(duplicateRisk([browser, app], browser.installId, "connected")).toEqual({ kind: "app-also", device: app });
    });

    it("warns the desktop app about a pushed browser, since push also covers closed Cadence", () => {
        expect(duplicateRisk([browser, app], app.installId, "local")).toEqual({ kind: "browser-also", device: browser });
    });

    it("says nothing about a phone, which is a different place, or about devices already off", () => {
        expect(duplicateRisk([phone, app], phone.installId, "connected")).toBeNull();
        expect(duplicateRisk([browser, { ...app, enabled: false }], browser.installId, "connected")).toBeNull();
        expect(duplicateRisk([{ ...browser, enabled: false }, app], browser.installId, "connected")).toBeNull();
    });

    it("says nothing when this device isn't delivering, or when a browser has no push to clash with", () => {
        expect(duplicateRisk([browser, app], browser.installId, "off")).toBeNull();
        expect(duplicateRisk([{ ...browser, push: false }, app], browser.installId, "local")).toBeNull();
        expect(duplicateRisk([browser], browser.installId, "connected")).toBeNull();
    });
});
