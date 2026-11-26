import { asSchema, jsonSchema, type InferUITools } from "ai";
import type { Env } from "../../../types/env";
import type { ApprovalMode } from "@cadence/contracts/ai";
import { logger, hashIdentifier } from "../../../platform/log";
import { AppError } from "../../../platform/errors";
import { checkIdempotency, recordMutation, storedResult } from "../../../platform/idempotency";
import { DomainError } from "@cadence/domain/errors";
import type { ApiIssue, ErrorCode } from "@cadence/contracts/common";
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
import { memoryTools } from "./memory";
import { settingsTools } from "./settings";

export interface AgentContext {
    timezone: string;
    currentDate: string;
    today: string;
    weekStart?: string;
    locale?: string;
    nonce?: string;
    rawNotes?: boolean;
    waitUntil?: (promise: Promise<unknown>) => void;
    userTexts?: string[];
    answeredField?: "priority" | "effort";
    approvalMode?: ApprovalMode;
    nullableOptionals?: boolean;
    seenTaskUpdatedAt?: Map<string, string>;
}

export interface ToolErrorResult {
    ok: false;
    error: string;
    tool: string;
    code: ErrorCode;
    status: number;
    isRetryable: boolean;
    issues?: ApiIssue[];
}

export const refuse = <X extends object = object>(code: ErrorCode, message: string, status = 400, extra?: X) => ({
    ok: false as const,
    error: message,
    code,
    status,
    isRetryable: false,
    ...(extra as X),
});

export const DRY_RUN_PREFIX = "dry:";

export class DryRun extends Error {
    constructor(readonly result: unknown) {
        super("dry run");
        this.name = "DryRun";
    }
}

function errorFields(error: unknown): Pick<ToolErrorResult, "code" | "status" | "isRetryable" | "issues"> {
    if (error instanceof AppError && error.statusCode < 500)
        return {
            code: error.code,
            status: error.statusCode,
            isRetryable: error.isRetryable,
            ...(error.issues && { issues: error.issues }),
        };
    if (error instanceof DomainError) return { code: error.code, status: error.status, isRetryable: false };
    return { code: "AI_TOOL_FAILED", status: 500, isRetryable: false };
}

export async function safeExecute<T>(
    toolName: string,
    userId: string,
    fn: () => Promise<T>,
): Promise<T | ToolErrorResult> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error instanceof DryRun) return { ...(error.result as object), dryRun: true } as T;
            const known = (error instanceof AppError && error.statusCode < 500) || error instanceof DomainError;
            const retry = !known && attempt === 1 && !(error instanceof Error && error.name === "AbortError");
            logger.warn("ai", "ai_tool_failed", {
                tool: toolName,
                userHash: await hashIdentifier(userId),
                code: error instanceof Error ? error.name : "UnknownError",
                attempt,
            });
            if (retry) continue;
            return {
                ok: false,
                tool: toolName,
                ...errorFields(error),
                error: known
                    ? `${(error as Error).message}. Nothing was changed.`
                    : `The "${toolName}" tool failed twice. Tell the user it didn't work and offer to try again.`,
            };
        }
    }
}

export async function once<T>(
    tx: Tx,
    userId: string,
    toolCallId: string,
    write: () => Promise<{ result: T; id: string }>,
): Promise<T | { deduped: true }> {
    if (await checkIdempotency(tx, userId, toolCallId)) {
        return { ...((await storedResult(tx, userId, toolCallId)) as object | undefined), deduped: true } as T & {
            deduped: true;
        };
    }
    const { result, id } = await write();
    if (toolCallId.startsWith(DRY_RUN_PREFIX)) throw new DryRun(result);
    await recordMutation(tx, userId, toolCallId, id, result);
    return result;
}

export const MAX_LIST_LIMIT = 50;

export function clampLimit(limit: number | undefined, fallback = 20): number {
    const value = limit ?? fallback;
    if (!Number.isFinite(value)) return fallback;
    return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.trunc(value)));
}

export function buildToolRegistry(env: Env, userId: string, ctx: AgentContext) {
    return withoutPatterns(ctx.nullableOptionals !== false, {
        ...coreTools(env, userId, ctx),
        ...askTools(env, userId, ctx),
    });
}

export const coreTools = (env: Env, userId: string, ctx: AgentContext) => ({
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
    ...settingsTools(env, userId),
    ...memoryTools(env, userId, ctx),
});

export type ToolIO = InferUITools<ReturnType<typeof buildToolRegistry>>;

export function dropPatterns(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(dropPatterns);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(
        Object.entries(node)
            .filter(([key]) => key !== "pattern" && key !== "$schema")
            .map(([key, value]) => [key, dropPatterns(value)]),
    );
}

const BOUNDS = new Set(["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "default"]);

export function slimSchema(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(slimSchema);
    if (!node || typeof node !== "object") return node;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
        if (BOUNDS.has(key) || (key === "additionalProperties" && value === false)) continue;
        out[key] =
            key === "properties" && value && typeof value === "object"
                ? Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, slimSchema(schema)]))
                : slimSchema(value);
    }
    return foldAnyOf(out);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
function foldAnyOf(node: Record<string, any>): Record<string, any> {
    const { anyOf, ...rest } = node;
    if (!Array.isArray(anyOf) || anyOf.length < 2) return node;
    const literals = anyOf.every(
        (b) =>
            b && "const" in b && typeof b.type === "string" && b.type === anyOf[0].type && Object.keys(b).length === 2,
    );
    if (literals) return { ...rest, type: anyOf[0].type, enum: anyOf.map((b) => b.const) };
    const nonNull = anyOf.filter((b) => b?.type !== "null");
    const [only] = nonNull;
    if (nonNull.length === 1 && typeof only.type === "string" && !("enum" in only) && !("const" in only)) {
        return { ...only, ...rest, type: [only.type, "null"] };
    }
    return { ...rest, anyOf };
}

function orNull(schema: unknown): unknown {
    if (!isRecord(schema)) return schema;
    if (typeof schema.type === "string") {
        return {
            ...schema,
            type: [schema.type, "null"],
            ...(Array.isArray(schema.enum) && { enum: [...schema.enum, null] }),
        };
    }
    if (Array.isArray(schema.type))
        return schema.type.includes("null") ? schema : { ...schema, type: [...schema.type, "null"] };
    if (Array.isArray(schema.anyOf))
        return schema.anyOf.some((b) => isRecord(b) && b.type === "null")
            ? schema
            : { ...schema, anyOf: [...schema.anyOf, { type: "null" }] };
    return schema;
}

export function nullableOptionals(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(nullableOptionals);
    if (!isRecord(node)) return node;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
        out[key] =
            key === "properties" && isRecord(value)
                ? Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, nullableOptionals(schema)]))
                : nullableOptionals(value);
    }
    if (!isRecord(out.properties)) return out;
    const required = new Set(Array.isArray(out.required) ? out.required : []);
    for (const [name, schema] of Object.entries(out.properties))
        if (!required.has(name)) out.properties[name] = orNull(schema);
    return out;
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const isPlaceholder = (v: unknown) =>
    v === "" ||
    v === 0 ||
    v === false ||
    v === null ||
    (Array.isArray(v) && !v.length) ||
    (!!v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const IGNORED = Symbol("ignored");

function withoutNilIds(value: unknown, path: string, ignored: string[]): unknown {
    if (Array.isArray(value))
        return value.filter((item) => item !== NIL_UUID).map((item) => withoutNilIds(item, path, ignored));
    if (!isRecord(value)) return value;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
        const at = path ? `${path}.${key}` : key;
        if (v === NIL_UUID) ignored.push(at);
        else out[key] = withoutNilIds(v, at, ignored);
    }
    return out;
}

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
        const at = (path: PropertyKey[]) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
            path.reduce<any>(
                (node, key) => (node && typeof node === "object" ? node[key as string] : undefined),
                input,
            );
        const paths = issues.map((issue) => issue.path ?? []);
        // oxlint-disable-next-line unicorn/no-useless-spread -- the loop pushes onto `paths`
        for (const path of [...paths]) {
            const target = at(path);
            if (isRecord(target))
                paths.push(
                    ...Object.entries(target)
                        .filter(([, v]) => v !== null && !isRecord(v) && isPlaceholder(v))
                        .map(([key]) => [...path, key]),
                );
        }
        const fixes =
            pass < 2
                ? paths.filter((path, i) => {
                      if (!path.length || paths.findIndex((p) => p.join(".") === path.join(".")) !== i) return false;
                      const parent = at(path.slice(0, -1));
                      return (
                          isRecord(parent) &&
                          String(path.at(-1)) in parent &&
                          isPlaceholder(parent[String(path.at(-1))])
                      );
                  })
                : [];
        if (!fixes.length) return result;
        input = structuredClone(input);
        for (const path of fixes) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
            const parent = path.slice(0, -1).reduce<any>((node, key) => node[key as string], input);
            if (parent[String(path.at(-1))] !== null) ignored.push(path.join("."));
            delete parent[String(path.at(-1))];
        }
    }
}

function reportIgnored(output: unknown, input: unknown): unknown {
    const ignored = isRecord(input) ? ((input as Record<symbol, unknown>)[IGNORED] as string[] | undefined) : undefined;
    if (!ignored?.length || !isRecord(output)) return output;
    const note = `Dropped placeholder values for ${ignored.join(", ")}. Leave out every field you don't mean.`;
    return { ...output, ignored: Array.isArray(output.ignored) ? [...output.ignored, note] : note };
}

const admitsNull = (schema: unknown): boolean =>
    isRecord(schema) &&
    (schema.type === "null" ||
        (Array.isArray(schema.type) && schema.type.includes("null")) ||
        (Array.isArray(schema.anyOf) && schema.anyOf.some(admitsNull)));

export function clearableFields(schema: unknown): string[] {
    const patch = isRecord(schema) && isRecord(schema.properties) ? schema.properties.patch : undefined;
    return isRecord(patch) && isRecord(patch.properties)
        ? Object.entries(patch.properties)
              .filter(([, field]) => admitsNull(field))
              .map(([name]) => name)
        : [];
}

const NULL_CLAUSE = /[;,]\s*(?:or\s+)?null\b[^.;]*/g;

function withClear(schema: unknown, clearable: string[]): unknown {
    if (!clearable.length || !isRecord(schema) || !isRecord(schema.properties) || !isRecord(schema.properties.patch))
        return schema;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    const patch = schema.properties.patch as Record<string, any>;
    const properties: Record<string, unknown> = Object.fromEntries(
        Object.entries(patch.properties).map(([name, field]) => [
            name,
            isRecord(field) && typeof field.description === "string"
                ? { ...field, description: field.description.replace(NULL_CLAUSE, "") }
                : field,
        ]),
    );
    properties.clear = {
        type: ["array", "null"],
        items: { type: "string", enum: clearable },
        description:
            "Fields to empty, removing their value. Only what the user asked to remove; null or [] on a field leaves it as it is.",
    };
    return { ...schema, properties: { ...schema.properties, patch: { ...patch, properties } } };
}

const clearNames = (value: unknown, clearable: string[]): string[] => {
    const clear = isRecord(value) && isRecord(value.patch) ? value.patch.clear : undefined;
    return Array.isArray(clear)
        ? [...new Set(clear.filter((name): name is string => typeof name === "string" && clearable.includes(name)))]
        : [];
};

export function applyClear(value: unknown, clearable: string[]): unknown {
    if (!clearable.length || !isRecord(value) || !isRecord(value.patch)) return value;
    const { clear: _clear, ...fields } = value.patch;
    const patch: Record<string, unknown> = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length)),
    );
    for (const name of clearNames(value, clearable)) patch[name] = null;
    return { ...value, patch };
}

function withoutPatterns<T extends Record<string, { inputSchema: unknown; execute?: unknown }>>(
    nullable: boolean,
    tools: T,
): T {
    for (const t of Object.values(tools)) {
        const full = asSchema(t.inputSchema as Parameters<typeof asSchema>[0]);
        let clearable: Promise<string[]> | undefined;
        const clearableOnce = () => (clearable ??= Promise.resolve(full.jsonSchema).then(clearableFields));
        t.inputSchema = jsonSchema(
            async () => {
                const slim = slimSchema(dropPatterns(await full.jsonSchema));
                return withClear(nullable ? nullableOptionals(slim) : slim, await clearableOnce()) as never;
            },
            {
                validate: async (value) => {
                    const fields = await clearableOnce();
                    const result = await validateLenient(full.validate!, applyClear(value, fields));
                    const names = clearNames(value, fields);
                    if (result.success && names.length && isRecord(result.value) && isRecord(result.value.patch))
                        result.value.patch.clear = names;
                    return result;
                },
            },
        );
        const run = t.execute as ((input: unknown, options: unknown) => Promise<unknown>) | undefined;
        if (run) {
            t.execute = async (input: unknown, options: unknown) => {
                const { clear: _clear, ...patch } = isRecord(input) && isRecord(input.patch) ? input.patch : {};
                const forTool =
                    isRecord(input) && isRecord(input.patch) && "clear" in input.patch ? { ...input, patch } : input;
                return reportIgnored(await run(forTool, options), input);
            };
        }
    }
    return tools;
}
