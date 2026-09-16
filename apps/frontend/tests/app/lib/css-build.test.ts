// @vitest-environment node
import { fileURLToPath } from "node:url";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { expect, it } from "vitest";

it("preserves standard backdrop filters through the production CSS pipeline", async () => {
    const result = await build({
        configFile: false,
        logLevel: "silent",
        plugins: [tailwindcss()],
        build: {
            write: false,
            rolldownOptions: { input: fileURLToPath(new URL("../../../app/app.css", import.meta.url)) },
        },
    });
    if (!("output" in result)) throw new Error("Expected a CSS build output");
    const css = result.output.flatMap((output) => output.type === "asset" && output.fileName.endsWith(".css")
        ? [String(output.source)] : []).join("\n");
    for (const selector of [".glass", ".glass-surface", ".surface-utility", ".surface-route-overlay", ".cadence-toast", ".offline-banner"]) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rules = [...css.matchAll(new RegExp(`${escaped}\\{([^{}]+)\\}`, "g"))].map((match) => match[1]).join(";");
        expect(rules, selector).toMatch(/(?:^|;)backdrop-filter:blur\(/);
    }
});
