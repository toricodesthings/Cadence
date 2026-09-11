import { describe, expect, it } from "vitest";
import { describeUsage, formatReset } from "../../../../app/lib/ai/usage";
import type { AiUsage } from "@cadence/contracts/ai";

const NOW = 1_760_000_000_000; // fixed clock (ms)
const nowS = Math.floor(NOW / 1000);

function usage(overrides?: {
    enabled?: boolean;
    fiveH?: Partial<AiUsage["windows"]["5h"]>;
    sevenD?: Partial<AiUsage["windows"]["7d"]>;
}): AiUsage {
    const base = (limit: number): AiUsage["windows"]["5h"] => ({
        requests: { used: 0, limit },
        tokens: { used: 0, limit: 100_000 },
        resetEpoch: null,
    });
    return {
        enabled: overrides?.enabled ?? true,
        windows: {
            "5h": { ...base(50), ...overrides?.fiveH },
            "7d": { ...base(500), ...overrides?.sevenD },
        },
    };
}

describe("describeUsage", () => {
    it("returns null when the budget is disabled", () => {
        expect(describeUsage(usage({ enabled: false }), NOW)).toBeNull();
    });

    it("returns null when usage data is absent", () => {
        expect(describeUsage(undefined, NOW)).toBeNull();
    });

    it("returns null when plenty remains (no meter anxiety)", () => {
        expect(describeUsage(usage(), NOW)).toBeNull();
    });

    it("warns when 5h requests dip to the low fraction", () => {
        const line = describeUsage(
            usage({ fiveH: { requests: { used: 45, limit: 50 }, resetEpoch: nowS + 7200 } }),
            NOW,
        );
        expect(line).toBe("≈ 5 messages left · resets in 2h");
    });

    it("uses the singular form for one remaining message", () => {
        const line = describeUsage(
            usage({ fiveH: { requests: { used: 49, limit: 50 }, resetEpoch: null } }),
            NOW,
        );
        expect(line).toBe("≈ 1 message left");
    });

    it("says 'No messages left' at zero", () => {
        const line = describeUsage(
            usage({ fiveH: { requests: { used: 50, limit: 50 }, resetEpoch: nowS + 60 } }),
            NOW,
        );
        expect(line).toBe("No messages left · resets in a minute");
    });

    it("picks the tighter of two low windows", () => {
        const line = describeUsage(
            usage({
                fiveH: { requests: { used: 46, limit: 50 }, resetEpoch: null }, // 4 left
                sevenD: { requests: { used: 498, limit: 500 }, resetEpoch: null }, // 2 left
            }),
            NOW,
        );
        expect(line).toBe("≈ 2 messages left");
    });

    it("uses the generic capacity line when only tokens are draining", () => {
        const line = describeUsage(
            usage({ fiveH: { tokens: { used: 95_000, limit: 100_000 } } }),
            NOW,
        );
        expect(line).toBe("Running low on AI capacity");
    });
});

describe("formatReset", () => {
    it("returns null when no window is armed", () => {
        expect(formatReset(null, NOW)).toBeNull();
    });

    it("formats minutes, hours, and days coarsely", () => {
        expect(formatReset(nowS + 300, NOW)).toBe("in 5m");
        expect(formatReset(nowS + 3 * 3600, NOW)).toBe("in 3h");
        expect(formatReset(nowS + 3 * 86_400, NOW)).toBe("in 3d");
    });

    it("clamps a past epoch to the floor", () => {
        expect(formatReset(nowS - 100, NOW)).toBe("in a minute");
    });
});
