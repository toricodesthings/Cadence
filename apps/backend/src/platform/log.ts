export type LogLevel = "error" | "warn" | "info";

export type LogSource = "http" | "auth" | "cron" | "proxy" | "ai" | "storage" | "mcp" | "frontend";

export type LogFields = Record<string, unknown>;

export type IssueSummary = {
    code: string;
    message: string;
    path: string;
};

const MESSAGE_MAX_LENGTH = 120;

export function shorten(value: string): string {
    return value.length > MESSAGE_MAX_LENGTH ? `${value.slice(0, MESSAGE_MAX_LENGTH - 3)}...` : value;
}

export async function hashIdentifier(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
}

export function issuesFromError(error: unknown): IssueSummary[] | undefined {
    if (!(error instanceof Error)) return undefined;
    const issues: IssueSummary[] = [{ code: error.name || "Error", message: shorten(error.message), path: "" }];
    if (error.cause instanceof Error) {
        issues.push({
            code: error.cause.name || "Cause",
            message: shorten(error.cause.message),
            path: "cause",
        });
    }
    return issues;
}

function formatIssues(issues: IssueSummary[]): string {
    return issues.map((i) => `${i.path ? `${i.path} ` : ""}${i.code}: ${i.message}`).join("; ");
}

function emit(level: LogLevel, source: LogSource, event: string, fields: LogFields) {
    const { issues } = fields;
    const payload = {
        event,
        level,
        source,
        origin: "backend",
        ...fields,
        ...(Array.isArray(issues) ? { issues: formatIssues(issues as IssueSummary[]) } : {}),
    };
    console[level](payload);
}

export const logger = {
    error: (source: LogSource, event: string, fields: LogFields = {}) => emit("error", source, event, fields),
    warn: (source: LogSource, event: string, fields: LogFields = {}) => emit("warn", source, event, fields),
    info: (source: LogSource, event: string, fields: LogFields = {}) => emit("info", source, event, fields),
};
