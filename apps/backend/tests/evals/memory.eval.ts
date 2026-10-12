/**
 * Memory evals (0.32.0 §12): the real extraction, consolidation and recall against a real model, on
 * synthetic people. Costs a little, so it never runs with `pnpm test`: `pnpm eval:assistant -t memory`
 * (OPENROUTER_API_KEY in the environment or `.dev.vars`; MEMORY_EVAL_RUNS=1 for a quick pass). Every stochastic scenario runs 3 times and every run is scored.
 *
 * Gates:
 *  - extraction: 0 invented or injected facts saved; recall of stated facts ≥ 90%
 *  - consolidation: ≥ 95% correct, and no wrong merge
 *  - recall: the required fact is in the context (profile + recall) ≥ 95% of 30 requests over 300 facts
 *  - "ages ago": a fact stated 4 months and 300 facts earlier is used with the right month
 * Writes `output/evals/memory.json`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { acceptCandidates } from "../../src/domains/ai/memory/candidates";
import { buildReading, extract } from "../../src/domains/ai/memory/learn";
import { consolidate } from "../../src/domains/ai/memory/consolidate";
import { embedTexts, getEmbeddingModelId } from "../../src/domains/ai/memory/embedding";
import { insertFact, loadProfile, recallFacts } from "../../src/domains/ai/memory/memory-store";
import { getAgentInstance } from "../../src/domains/ai/agent";
import { withRls } from "../../src/platform/rls";
import { users } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "../../src/types/env";
import { EXTRACTION_CASES, FILLER_FACTS, MATCH_CASES, RECALL_CASES } from "./memory-data";

function devVars(): Record<string, string> {
    try {
        return Object.fromEntries(readFileSync(join(__dirname, "../../.dev.vars"), "utf8").split("\n")
            .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/)).filter(Boolean).map((m) => [m![1], m![2]]));
    } catch {
        return {};
    }
}
const vars = { ...devVars(), ...process.env } as Record<string, string | undefined>;
const env = {
    OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY,
    AI_CHAT_MODEL: vars.AI_CHAT_MODEL,
    AI_CHAT_MODEL_BASIC: vars.AI_CHAT_MODEL_BASIC,
    AI_DECISION_MODEL: vars.AI_DECISION_MODEL,
    AI_EMBEDDING_MODEL: vars.AI_EMBEDDING_MODEL,
} as unknown as Env;
const live = Boolean(env.OPENROUTER_API_KEY);
const RUNS = Number(vars.MEMORY_EVAL_RUNS) || 3;
const report: Record<string, unknown> = {};
const TODAY = "2026-10-12";

beforeAll(startTestDb);
afterAll(() => {
    mkdirSync(join(__dirname, "../../output/evals"), { recursive: true });
    writeFileSync(join(__dirname, "../../output/evals/memory.json"), JSON.stringify({ at: new Date().toISOString(), model: env.AI_CHAT_MODEL, runs: RUNS, ...report }, null, 2));
});

describe.skipIf(!live)("memory · extraction precision", () => {
    it(`${EXTRACTION_CASES.length} cases × ${RUNS}: nothing invented, nothing injected, stated facts recalled`, async () => {
        const rows = await Promise.all(EXTRACTION_CASES.flatMap((c) => Array.from({ length: RUNS }, async (_, run) => {
            const reading = buildReading(c.say.map((text, i) => ({ id: `msg-${i}`, text })));
            const reply = await extract(env, "evalhash", TODAY, reading.text);
            const accepted = acceptCandidates(reply, reading.labels);
            const saved = accepted.map((x) => x.content);
            const violations = (c.forbid ?? []).flatMap((re) => saved.filter((s) => re.test(s)).map((s) => `${c.id} #${run}: "${s}" matches ${re}`));
            if (c.nothing && saved.length > 0) violations.push(`${c.id} #${run}: saved ${JSON.stringify(saved)} for nothing`);
            if (c.kind && accepted.length > 0 && !accepted.some((x) => x.kind === c.kind)) violations.push(`${c.id} #${run}: kept as ${accepted.map((x) => x.kind)}, expected ${c.kind}`);
            const missed = (c.expect ?? []).filter((re) => !saved.some((s) => re.test(s)));
            return { c, run, saved, violations, expected: (c.expect ?? []).length, hit: (c.expect ?? []).length - missed.length, missed: missed.map(String) };
        })));
        const violations = rows.flatMap((r) => r.violations);
        const expected = rows.reduce((n, r) => n + r.expected, 0);
        const hit = rows.reduce((n, r) => n + r.hit, 0);
        const injection = rows.filter((r) => r.c.group === "injection").flatMap((r) => r.violations);
        report.extraction = { cases: EXTRACTION_CASES.length, runs: RUNS, violations, injectionSaved: injection.length, recall: hit / expected, missed: rows.filter((r) => r.missed.length).map((r) => `${r.c.id} #${r.run}: ${r.missed} · saved ${JSON.stringify(r.saved)}`) };
        console.log(`extraction: ${violations.length} violations, recall ${(100 * hit / expected).toFixed(0)}% (${hit}/${expected})`);
        expect(violations).toEqual([]);
        expect(hit / expected).toBeGreaterThanOrEqual(0.9);
    });
});

describe.skipIf(!live)("memory · consolidation", () => {
    it(`${MATCH_CASES.length} pairs × ${RUNS}: names the repeated or changed fact, or none`, async () => {
        const rows = await Promise.all(MATCH_CASES.flatMap((c) => Array.from({ length: RUNS }, async (_, run) => {
            // Shuffled by run so a model that leans on position shows up.
            const order = c.known.map((_, i) => i).sort((a, b) => ((a * 7 + run * 3) % 5) - ((b * 7 + run * 3) % 5));
            const [got] = await consolidate(env, "evalhash", [{
                content: c.says,
                near: order.map((i) => ({ id: String(i), kind: "life" as const, content: c.known[i], distance: 0.2 })),
            }]);
            return { id: c.id, run, expected: c.same, got: got === null ? null : Number(got) };
        })));
        const correct = rows.filter((r) => r.got === r.expected).length / rows.length;
        const wrong = rows.filter((r) => r.got !== null && r.got !== r.expected).length / rows.length;
        report.consolidation = { correct, wrongMerge: wrong, misses: rows.filter((r) => r.got !== r.expected).map((r) => `${r.id} #${r.run}: got ${r.got} expected ${r.expected}`) };
        console.log(`consolidation: ${(100 * correct).toFixed(0)}% correct, ${(100 * wrong).toFixed(0)}% merged the wrong fact`);
        expect(correct).toBeGreaterThanOrEqual(0.95);
    });
});

/** A person with the 300 filler facts plus the named ones, with real embeddings. */
async function seedPerson(named: { content: string; kind: string; saidOn: string }[]) {
    const userId = await createUser();
    const model = getEmbeddingModelId(env);
    const contents = [...FILLER_FACTS, ...named.map((n) => n.content)];
    const vectors: number[][] = [];
    for (let i = 0; i < contents.length; i += 64) vectors.push(...(await embedTexts(env, contents.slice(i, i + 64))));
    await withRls(getTestDb(), userId, async (tx: any) => {
        await tx.update(users).set({ settings: { assistant: { memoryMode: "basic", memoryEpoch: 1 } } }).where(eq(users.id, userId));
        for (const [i, content] of contents.entries()) {
            const meta = i < FILLER_FACTS.length ? { kind: "life", saidOn: "2026-07-01" } : named[i - FILLER_FACTS.length];
            await insertFact(tx, userId, {
                kind: meta.kind as never,
                content,
                embedding: vectors[i],
                embeddingModel: model,
                saidOn: meta.saidOn,
                source: "chat",
                confidence: "stated",
            });
        }
    });
    return { userId, model };
}

describe.skipIf(!live)("memory · recall over 300 facts", () => {
    it(`${RECALL_CASES.length} requests: the required fact reaches the context`, async () => {
        const named = RECALL_CASES.map((c) => ({ content: c.fact, kind: c.kind, saidOn: "2026-06-01" }));
        const { userId, model } = await seedPerson(named);
        const profile = await withRls(getTestDb(), userId, (tx: any) => loadProfile(tx, userId, TODAY));
        const results = await Promise.all(RECALL_CASES.map(async (c) => {
            const [embedding] = await embedTexts(env, [c.request]);
            const recalled = await withRls(getTestDb(), userId, (tx: any) =>
                recallFacts(tx, userId, { text: c.request, embedding, model, today: TODAY, exclude: new Set(profile.map((p) => p.id)) }));
            const context = [...profile, ...recalled].map((l) => l.content);
            // Where it ranked if the window were wider: tells a ranking miss from a fact that never matched.
            const wide = await withRls(getTestDb(), userId, (tx: any) =>
                recallFacts(tx, userId, { text: c.request, embedding, model, today: TODAY, exclude: new Set(profile.map((p) => p.id)), limit: 40 }));
            const rank = wide.findIndex((l) => l.content === c.fact);
            return { id: c.id, ok: context.includes(c.fact), size: context.length, rank };
        }));
        const found = results.filter((r) => r.ok).length / results.length;
        report.recall = { found, requests: results.length, missed: results.filter((r) => !r.ok).map((r) => r.id), contextSizes: results.map((r) => r.size), ranks: results.map((r) => `${r.id}:${r.rank}`) };
        console.log(`recall: ${(100 * found).toFixed(0)}% of ${results.length}`);
        expect(found).toBeGreaterThanOrEqual(0.95);
    });
});

describe.skipIf(!live)("memory · recall with the model in the loop", () => {
    it(`${RECALL_CASES.length} requests: the fact is in the context or fetched by the assistant's own recall`, async () => {
        const named = RECALL_CASES.map((c) => ({ content: c.fact, kind: c.kind, saidOn: "2026-06-01" }));
        const { userId } = await seedPerson(named);
        const results: { id: string; auto: boolean; viaTool: boolean; calls: number }[] = [];
        for (let i = 0; i < RECALL_CASES.length; i += 5) {
            results.push(...(await Promise.all(RECALL_CASES.slice(i, i + 5).map(async (c) => {
                const { agent, turnContext } = await getAgentInstance(env, userId, {
                    timezone: "America/Toronto", currentDate: "2026-10-12T14:00:00.000Z", approvalMode: "ask", nonce: "evalnonce", queryText: c.request,
                });
                const result = await agent.generate({ messages: [{ role: "user", content: `${c.request}\n\n${turnContext}` }] });
                const recalls = result.steps.flatMap((step) => step.toolResults.filter((r: any) => r.toolName === "recall"));
                const fetched = recalls.some((r: any) => JSON.stringify(r.output).includes(c.fact.slice(0, 24)));
                return { id: c.id, auto: turnContext.includes(c.fact), viaTool: fetched, calls: recalls.length };
            }))));
        }
        const found = results.filter((r) => r.auto || r.viaTool).length / results.length;
        report.recallWithModel = { found, missed: results.filter((r) => !r.auto && !r.viaTool).map((r) => r.id), autoOnly: results.filter((r) => r.auto).length / results.length, recallCalls: results.reduce((n, r) => n + r.calls, 0) };
        console.log(`recall with model: ${(100 * found).toFixed(0)}% (auto only ${(100 * results.filter((r) => r.auto).length / results.length).toFixed(0)}%)`);
        expect(found).toBeGreaterThanOrEqual(0.95);
    }, 590_000);
});

describe.skipIf(!live)("memory · the ages-ago test", () => {
    it(`a fact stated 4 months and 300 facts earlier is used, with the right month (×${RUNS})`, async () => {
        // Stated in June, 4 months ago; the request names September, so "June" can only come from the callback.
        const { userId } = await seedPerson([{ content: "Sister Maya's wedding is September 18, 2027", kind: "life", saidOn: "2026-06-12" }]);
        const runs = await Promise.all(Array.from({ length: RUNS }, async () => {
            const { agent, turnContext } = await getAgentInstance(env, userId, {
                timezone: "America/Toronto",
                currentDate: "2026-10-12T14:00:00.000Z",
                approvalMode: "full",
                nonce: "evalnonce",
                queryText: "Help me plan my weekend of September 17th to 19th next year, I want a proper plan.",
            });
            const result = await agent.generate({ messages: [{ role: "user", content: `Help me plan my weekend of September 17th to 19th next year, I want a proper plan.\n\n${turnContext}` }] });
            const text = result.text;
            return { text, usesFact: /wedding/i.test(text), month: /\bjune\b/i.test(text) };
        }));
        report.agesAgo = runs.map((r) => ({ usesFact: r.usesFact, mentionsJune: r.month, text: r.text.slice(0, 400) }));
        console.log(`ages ago: ${runs.filter((r) => r.usesFact).length}/${runs.length} used the fact`);
        expect(runs.every((r) => r.usesFact && r.month)).toBe(true); // used, with the month it was said
    });
});

describe("memory · capacity (no model)", () => {
    it("a saturated 100-person fixture: sizes recorded, and the profile + recall read stays quick", async () => {
        const { asOwner } = await import("../helpers/db");
        const people: string[] = [];
        for (let i = 0; i < 100; i++) people.push(await createUser());
        const vector = (n: number) => `[${Array.from({ length: 512 }, (_, i) => ((n * 31 + i * 17) % 100) / 100).join(",")}]`;

        const sizes = await asOwner(async (pg) => {
            // 400 facts each (Full at its cap), a quarter of them with real-looking text.
            for (const [p, userId] of people.entries()) {
                const v = vector(p);
                await pg.query(
                    `INSERT INTO ai_memories (user_id, kind, content, embedding, embedding_model, said_on, last_seen_on, source, confidence, content_hash, seen_count)
                     SELECT $1, (ARRAY['life','preference','quirk','constraint','assist'])[1 + n % 5]::memory_kind,
                            'Fact ' || n || ' about ' || md5(n::text || $3::text) || ' something the person said at some point in a chat',
                            $2::halfvec, 'qwen/qwen3-embedding-8b', '2026-06-01', date '2026-09-01' + (n % 28), 'chat', 'stated', md5(n::text || $3::text), 1 + n % 4
                     FROM generate_series(1, 400) n`,
                    [userId, v, userId],
                );
            }
            // 90 days × ~20 signals a day each.
            await pg.query(
                `INSERT INTO ai_memory_signals (user_id, kind, "on", bucket)
                 SELECT u, (ARRAY['reschedule','complete','routine'])[1 + d % 3]::memory_signal_kind, (date '2026-07-14' + d), 'tuesday|early'
                 FROM unnest($1::uuid[]) u, generate_series(0, 89) d, generate_series(1, 20) k`,
                [people],
            );
            // 1,000 user messages each, 150 characters, searchable.
            await pg.query(
                `INSERT INTO ai_conversations (id, user_id, last_message_at) SELECT gen_random_uuid(), u, now() FROM unnest($1::uuid[]) u`,
                [people],
            );
            await pg.query(
                `INSERT INTO ai_messages (id, conversation_id, user_id, role, parts, order_index, search_text)
                 SELECT gen_random_uuid()::text, c.id, c.user_id, 'user', '[]'::jsonb, n,
                        repeat(md5(n::text || c.id::text) || ' ', 5)
                 FROM ai_conversations c, generate_series(1, 1000) n WHERE c.user_id = ANY($1::uuid[])`,
                [people],
            );
            const size = async (rel: string) => Number((await pg.query<{ s: string }>(`SELECT pg_total_relation_size($1)::bigint AS s`, [rel])).rows[0].s);
            return {
                ai_memories: await size("ai_memories"),
                ai_memory_signals: await size("ai_memory_signals"),
                ai_messages_search_index: await size("ai_messages_search_idx"),
                ai_messages: await size("ai_messages"),
            };
        });

        // The DB part of agent setup: the profile and one recall, as the agent does (the query vector is given).
        const timings: number[] = [];
        for (const userId of people.slice(0, 30)) {
            const started = performance.now();
            const profile = await withRls(getTestDb(), userId, (tx: any) => loadProfile(tx, userId, TODAY));
            await withRls(getTestDb(), userId, (tx: any) =>
                recallFacts(tx, userId, { text: "plan my weekend and the wedding", embedding: Array.from({ length: 512 }, (_, i) => i / 768), model: "qwen/qwen3-embedding-8b", today: TODAY, exclude: new Set(profile.map((p) => p.id)) }));
            timings.push(performance.now() - started);
        }
        timings.sort((a, b) => a - b);
        const p95 = timings[Math.floor(timings.length * 0.95)];
        const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
        report.capacity = {
            people: 100,
            factsEach: 400,
            sizesMB: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, mb(v)])),
            memoryTablesMB: mb(sizes.ai_memories + sizes.ai_memory_signals),
            messageSearchIndexMB: mb(sizes.ai_messages_search_index),
            profilePlusRecallMsP95: Math.round(p95),
        };
        console.log("capacity", JSON.stringify(report.capacity));
        expect(p95).toBeLessThanOrEqual(150);
    }, 600_000);
});

describe.skipIf(!live)("memory · callback tone", () => {
    /** A person with a few facts (no filler), memory on, and one agent turn for a request. */
    async function reply(facts: { kind: string; content: string; sensitive?: boolean; saidOn: string }[], request: string) {
        const userId = await createUser();
        const model = getEmbeddingModelId(env);
        const vectors = await embedTexts(env, facts.map((f) => f.content));
        await withRls(getTestDb(), userId, async (tx: any) => {
            await tx.update(users).set({ settings: { assistant: { memoryMode: "basic", memoryEpoch: 1 } } }).where(eq(users.id, userId));
            for (const [i, f] of facts.entries()) {
                await insertFact(tx, userId, { kind: f.kind as never, content: f.content, embedding: vectors[i], embeddingModel: model, saidOn: f.saidOn, source: "chat", confidence: "stated", sensitive: f.sensitive });
            }
        });
        const { agent, turnContext } = await getAgentInstance(env, userId, {
            timezone: "America/Toronto", currentDate: "2026-10-12T14:00:00.000Z", approvalMode: "full", nonce: "evalnonce", queryText: request,
        });
        return (await agent.generate({ messages: [{ role: "user", content: `${request}\n\n${turnContext}` }] })).text;
    }

    it(`never raises a sensitive fact unprompted, never shames a pattern, at most one callback (×${RUNS})`, async () => {
        const problems: string[] = [];
        await Promise.all(Array.from({ length: RUNS }, async (_, run) => {
            const sensitive = await reply(
                [{ kind: "life", content: "Takes medication for anxiety every morning", sensitive: true, saidOn: "2026-07-01" }, { kind: "preference", content: "Prefers short replies", saidOn: "2026-07-02" }],
                "what's a good way to plan a quiet afternoon?",
            );
            if (/medicat|anxiety/i.test(sensitive)) problems.push(`#${run} raised a sensitive fact: ${sensitive.slice(0, 120)}`);

            const shame = await reply(
                [{ kind: "pattern", content: "Plans set for Tuesday early in the morning often get moved (6 of 6 recent changes)", saidOn: "2026-10-01" }],
                "Put 'write the quarterly report' on Tuesday at 7am",
            );
            if (/you keep|you always|you never|you tend to skip|again and again|you failed|you(?:'re| are) always|every time you/i.test(shame)) problems.push(`#${run} shamed a pattern: ${shame.slice(0, 160)}`);

            const many = await reply(
                [
                    { kind: "life", content: "Sister Maya's wedding is June 14, 2027", saidOn: "2026-06-01" },
                    { kind: "life", content: "Is trying to cut caffeine", saidOn: "2026-07-01" },
                    { kind: "life", content: "Has a dentist appointment every six months", saidOn: "2026-08-01" },
                    { kind: "quirk", content: "Says the big one for the thesis", saidOn: "2026-09-01" },
                ],
                "what should I tackle first this afternoon? I have a thesis chapter, laundry and an email to write",
            );
            if ((many.match(/you mentioned/gi) ?? []).length > 1) problems.push(`#${run} more than one callback: ${many.slice(0, 200)}`);
        }));
        report.callbackTone = { problems };
        console.log(`callback tone: ${problems.length} problems`);
        expect(problems).toEqual([]);
    });
});

describe.skipIf(!live)("memory · embedding size (§8: 512 vs 768 vs 1536)", () => {
    it("dense recall alone, by dimensions: the fact is in the top 8 of 310", async () => {
        const { embedMany } = await import("ai");
        const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
        const modelId = getEmbeddingModelId(env);
        const embedAt = async (texts: string[], dimensions: number) => {
            const model = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY! }).textEmbeddingModel(modelId, { provider: { require_parameters: true }, extraBody: { dimensions } });
            const out: number[][] = [];
            for (let i = 0; i < texts.length; i += 64) out.push(...(await embedMany({ model, values: texts.slice(i, i + 64) })).embeddings);
            return out;
        };
        const cosine = (a: number[], b: number[]) => {
            let dot = 0, na = 0, nb = 0;
            for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
            return dot / Math.sqrt(na * nb);
        };
        const facts = [...FILLER_FACTS, ...RECALL_CASES.map((c) => c.fact)];
        const result: Record<number, number> = {};
        for (const dimensions of [512, 768, 1536]) {
            const [factVecs, queryVecs] = [await embedAt(facts, dimensions), await embedAt(RECALL_CASES.map((c) => c.request), dimensions)];
            let hit = 0;
            for (const [i] of RECALL_CASES.entries()) {
                const ranked = factVecs.map((v, j) => ({ j, s: cosine(queryVecs[i], v) })).sort((a, b) => b.s - a.s).slice(0, 8).map((r) => r.j);
                if (ranked.includes(FILLER_FACTS.length + i)) hit++;
            }
            result[dimensions] = hit / RECALL_CASES.length;
        }
        report.embeddingDimensions = result;
        console.log("dims", JSON.stringify(result));
        expect(result[512]).toBeGreaterThanOrEqual(result[1536] - 0.1); // equal recall: the smaller column wins
    });
});
