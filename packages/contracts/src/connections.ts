import { z } from "zod";
import { instantSchema } from "./common";

/** What an outside assistant may do. Capture alone never reads existing data; write changes it like Cadence's assistant does. */
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

/** A connected assistant as Settings lists it (active ones only). */
export const mcpConnectionSchema = mcpConnectionRowSchema.pick({
    id: true,
    clientName: true,
    createdAt: true,
    lastUsedAt: true,
}).extend({
    scopes: z.array(mcpScopeSchema),
    /** Where its access goes: the redirect URI's host. */
    redirectHost: z.string(),
});
export type McpConnection = z.infer<typeof mcpConnectionSchema>;

/** The consent page's view of a waiting authorization request. */
export const mcpConnectRequestSchema = z.object({
    clientName: z.string(),
    /** The domain that published the client's metadata document (CIMD), or null when it registered itself. */
    publisher: z.string().nullable(),
    redirectHost: z.string(),
    /** The access goes to an app on this computer (a localhost redirect). */
    localRedirect: z.boolean(),
    scopes: z.array(mcpScopeSchema),
});
export type McpConnectRequest = z.infer<typeof mcpConnectRequestSchema>;

export const approveMcpConnectSchema = z.object({
    scopes: z.array(mcpScopeSchema).min(1),
    /** The browser's IANA zone: keeps `users.time_zone` current (unless Settings pins one). */
    timezone: z.string().min(1).max(64),
});
export type ApproveMcpConnect = z.infer<typeof approveMcpConnectSchema>;
