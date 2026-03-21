import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodSchema } from "zod";
import { createErrorBody } from "./errors";
import { logValidationFailure, setRequestErrorCode, type ValidationIssueSummary } from "./request-log";

function formatIssues(issues: Array<{ code: string; message: string; path?: PropertyKey[] }>): ValidationIssueSummary[] {
    return issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path?.join(".") ?? "",
    }));
}

export function apiValidator<T extends keyof ValidationTargets, S extends ZodSchema>(
    target: T,
    schema: S,
) {
    return zValidator(target, schema, async (result, c) => {
        if (result.success) {
            return;
        }

        const issues = formatIssues(result.error.issues);
        setRequestErrorCode(c as any, "INVALID_REQUEST");
        await logValidationFailure(c as any, target, issues, result.data);

        return c.json(
            createErrorBody({
                code: "INVALID_REQUEST",
                message: "Request validation failed",
                status: 400,
                requestId: (c as any).get("requestId"),
                issues,
            }),
            400,
        );
    });
}
