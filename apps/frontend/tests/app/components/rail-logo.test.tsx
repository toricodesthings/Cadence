import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RailLogo } from "../../../app/components/sidebar/IconRail";

const sceneCss = readFileSync(
    resolve(import.meta.dirname, "../../../app/components/shared/loading/loading-scene.css"),
    "utf8",
);

describe("RailLogo", () => {
    it("inlines the Cadence logo with scoped SVG IDs so it never collides with LoadingHost", () => {
        const { container } = render(<RailLogo />);
        const wrapper = container.querySelector(".rail-logo");
        expect(wrapper).not.toBeNull();
        expect(screen.getByRole("img", { name: "Cadence" })).toBeTruthy();

        expect(wrapper!.querySelector("#rail-lg-orbit")).not.toBeNull();
        expect(wrapper!.querySelector("#lg-orbit")).toBeNull();
    });

    it("drives a single opening animation from .icon-rail:hover and respects reduced motion", () => {
        expect(sceneCss).toMatch(/\.icon-rail:hover\s+\.rail-logo\s*\{[^}]*rail-logo-grow\s+0\.9s\s+linear\s+1/);
        expect(sceneCss).toMatch(
            /@keyframes\s+rail-logo-grow\s*\{\s*from\s*\{\s*--ls-grow:\s*0;\s*\}\s*to\s*\{\s*--ls-grow:\s*1;\s*\}\s*\}/,
        );
        expect(sceneCss).toMatch(/\[data-motion="reduced"\]\s+\.rail-logo\s*\{[^}]*--ls-still:\s*none/);
    });
});
