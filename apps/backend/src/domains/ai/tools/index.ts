import { asSchema, jsonSchema } from "ai";
import type { Env } from "../../../types/env";
import type { ApprovalMode } from "@cadence/contracts/ai";
import { logger, hashIdentifier } from "../../../platform/log";
import { AppError } from "../../../platform/errors";
import { checkIdempotency, recordMutation, storedResult } from "../../../platform/idempotency";
import { DomainError } from "@cadence/domain/errors";
import type { Tx } from "../../../types/db";
import { taskTools } from "./tasks";
import { projectTools } from "./projects";
import { tagTools } from "./tags";
import { habitTools } from "./habits";
import { inboxTools } from "./inbox";
import { calendarTools } from "./calendar";
import { eventTools } from "./events";
import { metricTools } from "./metrics";
import { focusViewTools } from "./focus-views";
import { helpTools } from "./help";
import { askTools } from "./ask";

/**
 * Runtime context captured per request when the tool registry is built.
 * Carries the user's clock/locale so the model can resolve relative dates
 * ("tomorrow", "next Tuesday") into the ISO-8601 values tools expect.
 * `userId` is intentionally NOT part of this — it is passed separately to every
 * factory and is never a model-supplied argument (doc 05 §1, §5).
 */
export interface AgentContext {
    /** The user's IANA timezone, validated (falls back to "UTC"), e.g. "America/Toronto". */
    timezone: string;
    /** The current instant from the user's clock, ISO-8601. */
    currentDate: string;
    /** The user's local calendar date, `YYYY-MM-DD` — what "today" means for every tool. */
    today: string;
    /** First day of the week, e.g. "Sunday" | "Monday" — informs week windows. */
    weekStart?: string;
    /** BCP-47 locale, e.g. "en-CA". */
    locale?: string;
    /** The turn's data-fence nonce, for user text a tool returns (notes). */
    nonce?: string;
    /** Return note text unfenced (MCP: the outside model owns its injection defence). */
    rawNotes?: boolean;
    /** Keeps post-commit metrics alive after the response (the Worker's `waitUntil`). */
    waitUntil?: (promise: Promise<unknown>) => void;
    /** The chat's approval mode, so a tool knows when the user tapped to approve its call. Unset off the chat (MCP). */
    approvalMode?: ApprovalMode;
}

/**
 * The minimal, recoverable error object handed back to the model when a tool's
 * `execute` throws. It never carries raw row data — only a stable code the model
 * can reason about and apologize/recover from (doc 05 §5 "per-tool failure isolation").
 */
export interface ToolErrorResult {
    ok: false;
    error: string;
    tool: string;
}

/**
 * Wraps a tool `execute` body so a throw is converted into a structured error
 * result (instead of crashing the agent loop) and logged with a HASHED userId.
 * Raw user data is never logged. Reuse this in EVERY tool `execute`.
 * An unexpected failure (a dropped connection, a timeout) runs once more: each run is
 * its own transaction, rolled back on a throw, and writes replay through {@link once}.
 */
export async function safeExecute<T>(
    toolName: string,
    userId: string,
    fn: () => Promise<T>,
): Promise<T | ToolErrorResult> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            // Our own 4xx messages ("Project not found", a stale note) are safe and tell
            // the model what to fix, and would fail the same way again; anything else stays generic.
            const known = (error instanceof AppError && error.statusCode < 500) || error instanceof DomainError;
            const retry = !known && attempt === 1 && !(error instanceof Error && error.name === "AbortError");
            logger.warn("ai", "ai_tool_failed", {
                tool: toolName,
                userHash: await hashIdentifier(userId),
                // Only the error class/name — never the message body or row data.
                code: error instanceof Error ? error.name : "UnknownError",
                attempt,
            });
            if (retry) continue;
            return {
                ok: false,
                tool: toolName,
                error: known
                    ? `${(error as Error).message}. Nothing was changed.`
                    : `The "${toolName}" tool failed twice. Tell the user it didn't work and offer to try again.`,
            };
        }
    }
}

/**
 * Run a write once per tool call, keyed by the call id: a replayed call gets the
 * first call's result (its ids) plus `deduped: true` instead of writing again.
 * `id` is any row the write touched.
 */
export async function once<T>(
    tx: Tx,
    userId: string,
    toolCallId: string,
    write: () => Promise<{ result: T; id: string }>,
): Promise<T | { deduped: true }> {
    if (await checkIdempotency(tx, userId, toolCallId)) {
        return { ...(await storedResult(tx, userId, toolCallId) as object | undefined), deduped: true } as T & { deduped: true };
    }
    const { result, id } = await write();
    await recordMutation(tx, userId, toolCallId, id, result);
    return result;
}

/**
 * Hard, server-side cap applied to every list/read tool's `limit`, independent
 * of (and after) the model's argument. The model's argument is clamped again
 * here so a hallucinated huge limit can never widen the result set.
 */
export const MAX_LIST_LIMIT = 50;

/** Clamp a (possibly model-supplied) limit into [1, MAX_LIST_LIMIT]. */
export function clampLimit(limit: number | undefined, fallback = 20): number {
    const value = limit ?? fallback;
    if (!Number.isFinite(value)) return fallback;
    return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.trunc(value)));
}

/**
 * Assembles the full RLS-scoped tool surface for a single request. No global
 * state — call this once per turn with the authenticated `userId` (doc 05 §6).
 * The integration in agent.ts spreads the result into `streamText({ tools })`.
 */
export function buildToolRegistry(env: Env, userId: string, ctx: AgentContext) {
    return withoutPatterns({
        ...taskTools(env, userId, ctx),
        ...projectTools(env, userId, ctx),
        ...tagTools(env, userId, ctx),
        ...habitTools(env, userId, ctx),
        ...inboxTools(env, userId, ctx),
        ...calendarTools(env, userId, ctx),
        ...eventTools(env, userId, ctx),
        ...metricTools(env, userId, ctx),
        ...focusViewTools(env, userId, ctx),
        ...helpTools(),
        ...askTools(),
    });
}

/** Drop regex `pattern`s (and `$schema`) from a JSON schema, recursively. */
export function dropPatterns(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(dropPatterns);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(
        Object.entries(node).filter(([key]) => key !== "pattern" && key !== "$schema").map(([key, value]) => [key, dropPatterns(value)]),
    );
}

/** Validation-only bounds the model can't act on; batch caps are already stated in each description. */
const BOUNDS = new Set(["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems"]);

/**
 * Shrink a JSON schema for the model (validation still runs on the full zod schema): drop
 * {@link BOUNDS}, fold `anyOf: [X, null]` into `type: [X, "null"]` and a union of same-type
 * literals into an `enum`. `$ref`/`$defs` are left alone: providers handle them inconsistently.
 */
export function slimSchema(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(slimSchema);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
        if (BOUNDS.has(key)) continue;
        // `properties` maps field names to schemas: recurse per field, never filter the names.
        out[key] = key === "properties" && value && typeof value === "object"
            ? Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, slimSchema(schema)]))
            : slimSchema(value);
    }
    const { anyOf, ...rest } = out;
    if (!Array.isArray(anyOf) || anyOf.length < 2) return out;
    const literals = anyOf.every((b) => b && "const" in b && typeof b.type === "string" && b.type === anyOf[0].type && Object.keys(b).length === 2);
    if (literals) return { ...rest, type: anyOf[0].type, enum: anyOf.map((b) => b.const) };
    const nonNull = anyOf.filter((b) => b?.type !== "null");
    const [only] = nonNull;
    if (nonNull.length === 1 && typeof only.type === "string" && !("enum" in only) && !("const" in only)) {
        return { ...only, ...rest, type: [only.type, "null"] };
    }
    return { ...rest, anyOf };
}

/** `schema` that also takes null. */
function orNull(schema: unknown): unknown {
    if (!isRecord(schema)) return schema;
    if (typeof schema.type === "string") {
        return { ...schema, type: [schema.type, "null"], ...(Array.isArray(schema.enum) && { enum: [...schema.enum, null] }) };
    }
    if (Array.isArray(schema.type)) return schema.type.includes("null") ? schema : { ...schema, type: [...schema.type, "null"] };
    if (Array.isArray(schema.anyOf)) return schema.anyOf.some((b) => isRecord(b) && b.type === "null") ? schema : { ...schema, anyOf: [...schema.anyOf, { type: "null" }] };
    return schema;
}

/**
 * Models trained on strict function calling send every field and say "not used" with
 * null; offered nothing else, they invent a plausible value (a list id from context, a
 * day). So every optional field the model sees also takes null. On a field that can't
 * be null, {@link validateLenient} drops it as left out; on one that can, null keeps its
 * meaning (it clears), as that field's description says.
 */
export function nullableOptionals(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(nullableOptionals);
    if (!isRecord(node)) return node;
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
        out[key] = key === "properties" && isRecord(value)
            ? Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, nullableOptionals(schema)]))
            : nullableOptionals(value);
    }
    if (!isRecord(out.properties)) return out;
    const required = new Set(Array.isArray(out.required) ? out.required : []);
    for (const [name, schema] of Object.entries(out.properties)) if (!required.has(name)) out.properties[name] = orNull(schema);
    return out;
}

/** Never a real row id: models that fill every field send it to mean "none". */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const isPlaceholder = (v: unknown) =>
    v === "" || v === 0 || v === false || v === null || (Array.isArray(v) && !v.length) ||
    (!!v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** What {@link validateLenient} dropped from a call, carried on the validated input (symbols never serialize). */
const IGNORED = Symbol("ignored");

/** A copy without nil uuids (keys and array items), noting each dropped key's path. */
function withoutNilIds(value: unknown, path: string, ignored: string[]): unknown {
    if (Array.isArray(value)) return value.filter((item) => item !== NIL_UUID).map((item) => withoutNilIds(item, path, ignored));
    if (!isRecord(value)) return value;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
        const at = path ? `${path}.${key}` : key;
        if (v === NIL_UUID) ignored.push(at);
        else out[key] = withoutNilIds(v, at, ignored);
    }
    return out;
}

/**
 * Some models fill every optional field ("", 0, false, null, the nil uuid) instead of
 * leaving it out. The nil uuid always goes. Any other placeholder goes only where
 * validation rejects it (a real value there still fails the call), then the call is
 * checked again. What was dropped rides on the input for the tool's result to report.
 */
export async function validateLenient<R extends { success: boolean; value?: unknown; error?: unknown }>(
    validate: (value: unknown) => PromiseLike<R> | R,
    value: unknown,
): Promise<R> {
    const ignored: string[] = [];
    let input = withoutNilIds(value, "", ignored);
    for (let pass = 0; ; pass++) {
        const result = await validate(input);
        if (result.success) {
            if (ignored.length && isRecord(result.value)) (result.value as Record<symbol, unknown>)[IGNORED] = ignored;
            return result;
        }
        const err = result.error as { cause?: { issues?: unknown }; issues?: unknown } | undefined;
        const issues = (err?.cause?.issues ?? err?.issues ?? []) as { path?: PropertyKey[] }[];
        // Step through objects and arrays alike: `tasks.0.subtasks` is one draft's field.
        const at = (path: PropertyKey[]) => path.reduce<any>((node, key) => (node && typeof node === "object" ? node[key as string] : undefined), input);
        const paths = issues.map((issue) => issue.path ?? []);
        // A rule across fields (a refine) names the object, not a field: its stand-ins go, but never a null, which can clear.
        for (const path of [...paths]) {
            const target = at(path);
            // Not an empty object either: a rule like "nothing to change" names an empty patch, and dropping it would hide why.
            if (isRecord(target)) paths.push(...Object.entries(target).filter(([, v]) => v !== null && !isRecord(v) && isPlaceholder(v)).map(([key]) => [...path, key]));
        }
        // Up to three passes: a nested placeholder, then a refine that only runs once the fields pass.
        const fixes = pass < 2 ? paths.filter((path, i) => {
            if (!path.length || paths.findIndex((p) => p.join(".") === path.join(".")) !== i) return false;
            const parent = at(path.slice(0, -1));
            return isRecord(parent) && String(path.at(-1)) in parent && isPlaceholder(parent[String(path.at(-1))]);
        }) : [];
        if (!fixes.length) return result;
        input = structuredClone(input);
        for (const path of fixes) {
            const parent = path.slice(0, -1).reduce<any>((node, key) => node[key as string], input);
            // A null where null isn't allowed is the model's "not used": drop it without remark.
            if (parent[String(path.at(-1))] !== null) ignored.push(path.join("."));
            delete parent[String(path.at(-1))];
        }
    }
}

/** Tell the model what was dropped from its call, so it stops sending it this conversation. */
function reportIgnored(output: unknown, input: unknown): unknown {
    const ignored = isRecord(input) ? (input as Record<symbol, unknown>)[IGNORED] as string[] | undefined : undefined;
    if (!ignored?.length || !isRecord(output)) return output;
    return { ...output, ignored: `Dropped placeholder values for ${ignored.join(", ")}. Leave out every field you don't mean.` };
}

/** True when a (full, zod-made) JSON schema accepts null. */
const admitsNull = (schema: unknown): boolean =>
    isRecord(schema) && (schema.type === "null" || (Array.isArray(schema.type) && schema.type.includes("null")) || (Array.isArray(schema.anyOf) && schema.anyOf.some(admitsNull)));

/** The `patch` fields a null empties (a reminder, a date, a list), read from the full schema. */
export function clearableFields(schema: unknown): string[] {
    const patch = isRecord(schema) && isRecord(schema.properties) ? schema.properties.patch : undefined;
    return isRecord(patch) && isRecord(patch.properties) ? Object.entries(patch.properties).filter(([, field]) => admitsNull(field)).map(([name]) => name) : [];
}

/** A field description's null clause ("…; null clears.", "…, or null for none."): in the model's patch null changes nothing. */
const NULL_CLAUSE = /[;,]\s*(?:or\s+)?null\b[^.;]*/g;

/**
 * The model's view of a patch: null (or []) on a field changes nothing, as it does
 * everywhere else, and emptying a field is naming it in `clear`. A model that fills every
 * field sends null and `clear: []`, which change nothing, instead of wiping the task.
 */
function withClear(schema: unknown, clearable: string[]): unknown {
    if (!clearable.length || !isRecord(schema) || !isRecord(schema.properties) || !isRecord(schema.properties.patch)) return schema;
    const patch = schema.properties.patch as Record<string, any>;
    const properties: Record<string, unknown> = Object.fromEntries(Object.entries(patch.properties).map(([name, field]) => [
        name, isRecord(field) && typeof field.description === "string" ? { ...field, description: field.description.replace(NULL_CLAUSE, "") } : field,
    ]));
    properties.clear = {
        type: ["array", "null"],
        items: { type: "string", enum: clearable },
        description: "Fields to empty, removing their value. Only what the user asked to remove; null or [] on a field leaves it as it is.",
    };
    return { ...schema, properties: { ...schema.properties, patch: { ...patch, properties } } };
}

/** The `clear` names the model sent that a null can empty. */
const clearNames = (value: unknown, clearable: string[]): string[] => {
    const clear = isRecord(value) && isRecord(value.patch) ? value.patch.clear : undefined;
    return Array.isArray(clear) ? [...new Set(clear.filter((name): name is string => typeof name === "string" && clearable.includes(name)))] : [];
};

/** Back to the tools' shape: null and [] in a patch are "unchanged", and each `clear` field becomes null. */
export function applyClear(value: unknown, clearable: string[]): unknown {
    if (!clearable.length || !isRecord(value) || !isRecord(value.patch)) return value;
    const { clear: _clear, ...fields } = value.patch;
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length)));
    for (const name of clearNames(value, clearable)) patch[name] = null;
    return { ...value, patch };
}

/**
 * The model sees each input schema without the long regex `pattern`s that zod
 * emits for dates and uuids (`format` already says "date"/"uuid"), which were
 * most of the tool tokens, and slimmed further by {@link slimSchema}. Calls are
 * still validated against the full zod schema, leniently ({@link validateLenient}).
 */
function withoutPatterns<T extends Record<string, { inputSchema: unknown; execute?: unknown }>>(tools: T): T {
    for (const t of Object.values(tools)) {
        const full = asSchema(t.inputSchema as Parameters<typeof asSchema>[0]);
        let clearable: Promise<string[]> | undefined;
        const clearableOnce = () => (clearable ??= Promise.resolve(full.jsonSchema).then(clearableFields));
        t.inputSchema = jsonSchema(async () => withClear(nullableOptionals(slimSchema(dropPatterns(await full.jsonSchema))), await clearableOnce()) as never, {
            validate: async (value) => {
                const fields = await clearableOnce();
                const result = await validateLenient(full.validate!, applyClear(value, fields));
                // `clear` stays on the call so later turns read what was emptied; execute never sees it.
                const names = clearNames(value, fields);
                if (result.success && names.length && isRecord(result.value) && isRecord(result.value.patch)) result.value.patch.clear = names;
                return result;
            },
        });
        const run = t.execute as ((input: unknown, options: unknown) => Promise<unknown>) | undefined;
        if (run) {
            t.execute = async (input: unknown, options: unknown) => {
                const { clear: _clear, ...patch } = isRecord(input) && isRecord(input.patch) ? input.patch : {};
                const forTool = isRecord(input) && isRecord(input.patch) && "clear" in input.patch ? { ...input, patch } : input;
                return reportIgnored(await run(forTool, options), input);
            };
        }
    }
    return tools;
}
