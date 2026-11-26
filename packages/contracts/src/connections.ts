import { z } from "zod";
import { instantSchema } from "./common";

export const MCP_SCOPES = ["cadence:read", "cadence:capture", "cadence:write"] as const;
export const mcpScopeSchema = z.enum(MCP_SCOPES);
export type McpScope = z.infer<typeof mcpScopeSchema>;

export const mcpConnectionRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    clientId: z.string(),
    clientName: z.string(),
    redirectUri: z.string(),
    scopes: z.array(z.string()),
    createdAt: instantSchema,
    lastUsedAt: instantSchema.nullable(),
    revokedAt: instantSchema.nullable(),
});
export type McpConnectionRow = z.infer<typeof mcpConnectionRowSchema>;

export const mcpConnectionSchema = mcpConnectionRowSchema
    .pick({
        id: true,
        clientName: true,
        createdAt: true,
        lastUsedAt: true,
    })
    .extend({
        scopes: z.array(mcpScopeSchema),
        redirectHost: z.string(),
    });
export type McpConnection = z.infer<typeof mcpConnectionSchema>;

export const mcpConnectRequestSchema = z.object({
    clientName: z.string(),
    publisher: z.string().nullable(),
    redirectHost: z.string(),
    localRedirect: z.boolean(),
    scopes: z.array(mcpScopeSchema),
});
export type McpConnectRequest = z.infer<typeof mcpConnectRequestSchema>;

export const approveMcpConnectSchema = z.object({
    scopes: z.array(mcpScopeSchema).min(1),
    timezone: z.string().min(1).max(64),
});
export type ApproveMcpConnect = z.infer<typeof approveMcpConnectSchema>;
