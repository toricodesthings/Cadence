import { beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";
import { tagRoutes } from "../../src/domains/tags/tags.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";

beforeAll(startTestDb);

const BIG = (n: number) => "x".repeat(n);

/** The longest accepted value, one more refused: the contract's limit is the real edge, on both sides. */
describe.each([
    ["task title", "/tasks", taskRoutes, 500, (v: string) => ({ title: v, orderIndex: 1 }), "title"],
    ["list name", "/projects", projectRoutes, 200, (v: string) => ({ name: v }), "name"],
    ["section name", "/sections", sectionRoutes, 200, (v: string) => ({ name: v, orderIndex: 1 }), "name"],
    ["tag name", "/tags", tagRoutes, 100, (v: string) => ({ name: v }), "name"],
    ["capture text", "/inbox", inboxRoutes, 5000, (v: string) => ({ rawText: v }), "rawText"],
] as const)("%s length", (_label, mount, router, max, body, field) => {
    it(`takes ${max} characters and refuses ${max + 1}`, async () => {
        const api = apiAs(await createUser(), mount, router as any);

        const ok = await api("POST", "", body(BIG(max)));
        expect(ok.status, JSON.stringify(ok.body)).toBe(201);
        expect(ok.body.data[field]).toHaveLength(max);

        const tooLong = await api("POST", "", body(BIG(max + 1)));
        expect(tooLong.status).toBe(400);
        expect(tooLong.body.error.code).toBe("INVALID_REQUEST");
    });

    it("refuses an empty value or one of only spaces, and stores a padded one trimmed", async () => {
        const api = apiAs(await createUser(), mount, router as any);
        expect((await api("POST", "", body(""))).status).toBe(400);
        expect((await api("POST", "", body("   \t "))).status).toBe(400);

        const padded = await api("POST", "", body("  Buy milk  "));
        expect(padded.status).toBe(201);
        expect(padded.body.data[field]).toBe("Buy milk");
    });
});

describe("any text a person might type", () => {
    it.each([
        ["emoji and ZWJ sequences", "👩🏽‍💻 ship it 🚀"],
        ["CJK", "歯医者の予約"],
        ["right-to-left", "موعد الطبيب"],
        ["combining marks", "Café run"],
        ["quotes, SQL and markup", `Robert'); DROP TABLE tasks;-- <script>alert(1)</script> "q"`],
        ["a NUL-free control mix", "tab\there\nnewline"],
    ])("round-trips %s unchanged", async (_name, title) => {
        const api = apiAs(await createUser(), "/tasks", taskRoutes);

        const created = await api("POST", "", { title, orderIndex: 1 });
        expect(created.status, JSON.stringify(created.body)).toBe(201);

        expect((await api("GET", `/${created.body.data.id}`)).body.data.title).toBe(title);
    });
});

describe("bad ids and bad dates", () => {
    it("answers 400 or 404 (never 500) for an id that is not a uuid, and 404 for one that doesn't exist", async () => {
        const api = apiAs(await createUser(), "/tasks", taskRoutes);

        for (const id of ["not-a-uuid", "0", "../../etc/passwd", "%00"]) {
            const res = await api("GET", `/${encodeURIComponent(id)}`);
            expect([400, 404], `GET ${id}`).toContain(res.status);
        }
        expect((await api("GET", `/${crypto.randomUUID()}`)).status).toBe(404);
        expect((await api("PATCH", `/${crypto.randomUUID()}`, { title: "x" })).status).toBe(404);
        expect((await api("DELETE", `/${crypto.randomUUID()}`)).status).toBe(404);
    });

    it.each(["2026-02-30", "2026-13-01", "2026-00-10", "26-01-01", "2026-1-1", "tomorrow", ""])(
        "refuses %j as a due date and stores nothing",
        async (dueDate) => {
            const api = apiAs(await createUser(), "/tasks", taskRoutes);
            const task = (await api("POST", "", { title: "T", orderIndex: 1 })).body.data;

            expect((await api("POST", "", { title: "Bad", orderIndex: 2, dueDate })).status).toBe(400);
            expect((await api("PATCH", `/${task.id}`, { dueDate })).status).toBe(400);
            expect((await api("GET", `/${task.id}`)).body.data.dueDate).toBeNull();
        },
    );

    it("takes a leap day and a far-off year as plain dates", async () => {
        const api = apiAs(await createUser(), "/tasks", taskRoutes);
        for (const dueDate of ["2028-02-29", "2100-12-31"]) {
            const res = await api("POST", "", { title: dueDate, orderIndex: 1, dueDate });
            expect(res.status, dueDate).toBe(201);
            expect(res.body.data.dueDate).toBe(dueDate);
        }
        expect((await api("POST", "", { title: "x", orderIndex: 1, dueDate: "2027-02-29" })).status).toBe(400);
    });

    it("refuses a malformed JSON body and a body of the wrong shape", async () => {
        const api = apiAs(await createUser(), "/tasks", taskRoutes);
        for (const body of [[], "text", 42, { title: 7 }, { title: null }]) {
            expect((await api("POST", "", body as never)).status, JSON.stringify(body)).toBe(400);
        }
    });
});
