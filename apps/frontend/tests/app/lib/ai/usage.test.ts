import { describe, expect, it } from "vitest";
import { describeImageAllowance, describeUsage, describeUsageMeters, formatReset, formatResetDetail } from "../../../../app/lib/ai/usage";
import type { AiUsage } from "@cadence/contracts/ai";

const NOW = 1_760_000_000_000; // fixed clock (ms)
const nowS = Math.floor(NOW / 1000);

function usage(overrides?: {
    enabled?: boolean;
    fiveH?: Partial<AiUsage["windows"]["5h"]>;
    sevenD?: Partial<AiUsage["windows"]["7d"]>;
    images?: Partial<AiUsage["images"]>;
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
        images: { used: 0, limit: 20, perMessage: 4, resetEpoch: null, ...overrides?.images },
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

describe("describeImageAllowance", () => {
    const reset = nowS + 7 * 3600;

    it("stays quiet while there's plenty", () => {
        expect(describeImageAllowance(usage({ images: { used: 10 } }), NOW)).toMatchObject({ blocked: false, label: "Attach an image" });
        expect(describeImageAllowance(undefined, NOW).blocked).toBe(false);
    });

    it("shows the count and reset near the cap", () => {
        expect(describeImageAllowance(usage({ images: { used: 17, resetEpoch: reset } }), NOW)).toEqual({
            left: 3,
            blocked: false,
            label: "3 images left · resets in 7h",
        });
    });

    it("blocks at the cap until the reset", () => {
        expect(describeImageAllowance(usage({ images: { used: 20, resetEpoch: reset } }), NOW)).toEqual({
            left: 0,
            blocked: true,
            label: "Image limit reached · resets in 7h",
        });
    });
});

describe("formatResetDetail", () => {
    it("counts days and hours, then the date and time", () => {
        expect(formatResetDetail(nowS + 2 * 86400 + 5 * 3600 + 30, NOW)).toMatch(/^Resets in 2 days 5 hours \(on .+, .+\)$/);
    });

    it("drops a zero part and uses singulars", () => {
        expect(formatResetDetail(nowS + 86400, NOW)).toMatch(/^Resets in 1 day \(on /);
        expect(formatResetDetail(nowS + 3600 + 60, NOW)).toMatch(/^Resets in 1 hour 1 minute \(on /);
        expect(formatResetDetail(nowS + 12 * 60, NOW)).toMatch(/^Resets in 12 minutes \(on /);
        expect(formatResetDetail(nowS + 20, NOW)).toMatch(/^Resets in under a minute \(on /);
    });
});

describe("describeUsageMeters", () => {
    it("returns null when the budget is disabled or absent", () => {
        expect(describeUsageMeters(usage({ enabled: false }), NOW)).toBeNull();
        expect(describeUsageMeters(undefined, NOW)).toBeNull();
    });

    it("waits for the first message when no window is armed", () => {
        const [fiveH] = describeUsageMeters(usage(), NOW)!;
        expect(fiveH).toMatchObject({ fraction: 0, headline: "0% used", caption: "Starts with your next message", reset: null, full: false });
    });

    it("counts messages left when requests are the tighter dimension", () => {
        const [fiveH] = describeUsageMeters(
            usage({ fiveH: { requests: { used: 10, limit: 50 }, resetEpoch: nowS + 3 * 3600 } }),
            NOW,
        )!;
        expect(fiveH).toMatchObject({ fraction: 0.2, headline: "20% used", caption: "About 40 messages left" });
        expect(fiveH.reset).toMatch(/^Resets in 3 hours \(on /);
    });

    it("fills by tokens without naming them when tokens are tighter", () => {
        const [, sevenD] = describeUsageMeters(
            usage({ sevenD: { tokens: { used: 60_000, limit: 100_000 }, resetEpoch: nowS + 5 * 86400 } }),
            NOW,
        )!;
        expect(sevenD).toMatchObject({ fraction: 0.6, headline: "60% used", caption: "Long replies use it up faster" });
    });

    it("marks a full window", () => {
        const [fiveH] = describeUsageMeters(
            usage({ fiveH: { requests: { used: 50, limit: 50 }, resetEpoch: nowS + 3600 } }),
            NOW,
        )!;
        expect(fiveH).toMatchObject({ fraction: 1, headline: "Limit reached", caption: "Nothing left until it resets", full: true });
    });

    it("shows photos with the per-message cap, and a reset once any are sent", () => {
        const [, , photos] = describeUsageMeters(usage({ images: { used: 3, resetEpoch: nowS + 3600 } }), NOW)!;
        expect(photos).toMatchObject({ headline: "3 of 20", caption: "Up to 4 per message", full: false });
        expect(photos.reset).toMatch(/^Resets in 1 hour \(on /);
        expect(describeUsageMeters(usage(), NOW)![2].reset).toBeNull();
    });
});
