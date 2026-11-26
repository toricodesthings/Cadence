import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPRINGS, cssSpring } from "../../../../app/lib/constants/motion";

const squash = (text: string) => text.replace(/\s+/g, "");
const css = squash(readFileSync(join(process.cwd(), "app/app.css"), "utf8"));

describe("springs", () => {
    it.each(Object.entries(SPRINGS))("%s stays calm and matches its app.css token", (name, s) => {
        expect(s.bounce).toBeLessThanOrEqual(0.15);
        expect(css).toContain(squash(`--spring-${name.toLowerCase()}: ${cssSpring(s)};`));
    });
});
