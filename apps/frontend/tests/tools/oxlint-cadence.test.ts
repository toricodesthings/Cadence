// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const oxlint = join(root, "node_modules/.bin/oxlint");
const plugin = join(root, "tools/oxlint-cadence.mjs");

// One valid and one invalid fixture per rule; the value is the expected diagnostic count.
const cases: Record<string, Record<string, [string, number]>> = {
    "ui-words": {
        valid: [
            `export const A = ({ S, v }: any) => <S title={v === "project" ? "New list" : "Routines"}>Your lists</S>;`,
            0,
        ],
        invalid: [`export const A = () => <p aria-label="Habits">Find tasks, projects</p>;`, 2],
    },
    "no-dom-title": {
        valid: [
            `export const A = ({ T }: any) => <><T title="x" /><svg><title>x</title></svg><iframe title="x" /></>;`,
            0,
        ],
        invalid: [`export const A = () => <span title="x" />;`, 1],
    },
    "focus-visible": {
        valid: [
            `const cn = (...a: unknown[]) => a.join(" ");
export const A = (on: boolean) => <><button className="outline-none focus-visible:ring-2" /><input className={cn("outline-none", on && "focus:border-accent")} /></>;`,
            0,
        ],
        invalid: [`export const A = () => <button className="p-2 outline-none" />;`, 1],
    },
    "surface-tokens": {
        valid: [
            `export const A = () => <div className="surface-card hover:text-twilight-text"><svg fill="#fff" /></div>;`,
            0,
        ],
        invalid: [`export const A = () => <div className="bg-white/[0.04] hover:text-red-400 bg-[#123456]" />;`, 3],
    },
    "no-z-index": {
        valid: [`export const A = () => <div className="z-0"><i className="z-10 layer-floating-ui" /></div>;`, 0],
        invalid: [`export const A = () => <div className="z-50 md:z-[60]" />;`, 2],
    },
};

let dir: string;
const results = new Map<string, number>();

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "oxlint-cadence-"));
    const rules = Object.fromEntries(Object.keys(cases).map((r) => [`cadence/${r}`, "error"]));
    writeFileSync(join(dir, ".oxlintrc.json"), JSON.stringify({ plugins: [], jsPlugins: [plugin], rules }));
    for (const [rule, fixtures] of Object.entries(cases))
        for (const [kind, [code]] of Object.entries(fixtures)) writeFileSync(join(dir, `${rule}.${kind}.tsx`), code);
    let out: string;
    try {
        out = execFileSync(oxlint, ["-c", ".oxlintrc.json", "--format", "json", "."], { cwd: dir, encoding: "utf8" });
    } catch (error) {
        out = (error as { stdout: string }).stdout; // exit 1 when any rule reports
    }
    for (const d of JSON.parse(out).diagnostics as { filename: string; code: string }[]) {
        const file = d.filename.split(/[\\/]/).pop()!;
        if (d.code.startsWith("cadence(")) results.set(file, (results.get(file) ?? 0) + 1);
    }
}, 30_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("cadence oxlint plugin", () => {
    for (const [rule, fixtures] of Object.entries(cases))
        for (const [kind, [, expected]] of Object.entries(fixtures))
            it(`${rule}: ${kind} fixture reports ${expected}`, () => {
                expect(results.get(`${rule}.${kind}.tsx`) ?? 0).toBe(expected);
            });
});
