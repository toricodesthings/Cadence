import { describe, expect, it } from "vitest";
import { deviceStatus, type DeviceFacts } from "../../../../app/lib/notifications/device-delivery";

const base: DeviceFacts = { desktop: false, unsupported: false, iosTab: false, permission: "granted", accountOn: true, deviceOff: false, registered: true };
const status = (over: Partial<DeviceFacts>) => deviceStatus({ ...base, ...over });

describe("deviceStatus", () => {
    it("is connected only with permission, the switch on, and a saved registration", () => {
        expect(status({})).toBe("connected");
        expect(status({ registered: false })).toBe("local");
        expect(status({ permission: "default" })).toBe("off");
        expect(status({ accountOn: false })).toBe("off");
        expect(status({ deviceOff: true })).toBe("off");
    });

    it("keeps unsupported, install and denied apart instead of calling them all blocked", () => {
        expect(status({ unsupported: true, permission: "default" })).toBe("unsupported");
        expect(status({ iosTab: true, unsupported: true, permission: "default" })).toBe("install");
        expect(status({ permission: "denied", registered: false })).toBe("denied");
    });

    it("turning one device off leaves the account's other devices alone", () => {
        // The account switch is shared; only this device's flag and registration change.
        expect(status({ deviceOff: true })).toBe("off");
        expect(status({ deviceOff: false })).toBe("connected");
    });
});
