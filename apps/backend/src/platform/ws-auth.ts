import { WS_CLOSE } from "@cadence/contracts/live";
import { verifyAppToken } from "./auth";
import { AppError } from "./errors";
import type { Env } from "../types/env";

export function offeredProtocols(request: Request): string[] {
    return (request.headers.get("Sec-WebSocket-Protocol") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Accept and immediately close a WebSocket upgrade with an application close code. */
export function refuseWs(protocol: string, code: number, reason: string): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    server.close(code, reason);
    return new Response(null, {
        status: 101,
        webSocket: client,
        headers: { "Sec-WebSocket-Protocol": protocol },
    });
}

/**
 * Shared WebSocket upgrade validation for DO endpoints: checks Upgrade header, subprotocol,
 * IP + user rate limits, and verifies the Bearer JWT passed via `Sec-WebSocket-Protocol`.
 */
export async function authenticateWsRequest(
    request: Request,
    env: Env,
    expectedProtocol: string,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return { ok: false, response: new Response("Expected a WebSocket", { status: 426 }) };
    }
    const [protocol, token] = offeredProtocols(request);
    if (protocol !== expectedProtocol || !token) {
        return { ok: false, response: new Response("Bad protocol", { status: 400 }) };
    }

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: ip })).success) {
        return { ok: false, response: refuseWs(expectedProtocol, WS_CLOSE.rateLimited, "slow down") };
    }

    let userId: string;
    try {
        ({ userId } = await verifyAppToken(env, token));
    } catch (err) {
        return {
            ok: false,
            response:
                err instanceof AppError && err.statusCode === 401
                    ? refuseWs(expectedProtocol, WS_CLOSE.badToken, "sign in again")
                    : refuseWs(expectedProtocol, WS_CLOSE.error, "unavailable"),
        };
    }

    if (env.RATE_LIMITER_READ && !(await env.RATE_LIMITER_READ.limit({ key: userId })).success) {
        return { ok: false, response: refuseWs(expectedProtocol, WS_CLOSE.rateLimited, "slow down") };
    }
    return { ok: true, userId };
}
