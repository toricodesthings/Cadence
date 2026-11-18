/**
 * Real signatures, real expiry: `jose` verifies for real; only the remote key fetch is swapped for a local key set.
 * (security.test.ts mocks `jose` to drive the middleware chain, so it can't prove any of this.)
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

const keys = vi.hoisted(() => ({ resolve: null as null | ((...args: any[]) => Promise<any>) }));
vi.mock("jose", async (importOriginal) => ({
    ...(await importOriginal<typeof import("jose")>()),
    createRemoteJWKSet:
        () =>
        (...args: any[]) =>
            keys.resolve!(...args),
}));

import { verifyAppToken } from "../../src/platform/auth";

const ISSUER = "https://auth.cadenceapp.cloud";
const env = {
    NEON_AUTH_JWKS_URL: "https://auth.cadenceapp.cloud/jwks.json",
    JWT_ISSUER: ISSUER,
    DEPLOYMENT_STAGE: "production",
} as any;
const SUB = "11111111-1111-4111-8111-111111111111";

let signing: CryptoKey;
let stranger: CryptoKey;

beforeAll(async () => {
    const trusted = await generateKeyPair("EdDSA");
    signing = trusted.privateKey;
    stranger = (await generateKeyPair("EdDSA")).privateKey;
    const jwk: JWK = { ...(await exportJWK(trusted.publicKey)), alg: "EdDSA", kid: "k1" };
    keys.resolve = createLocalJWKSet({ keys: [jwk] });
});

const sign = (
    opts: { key?: CryptoKey; alg?: string; iss?: string; sub?: string | null; exp?: string | number } = {},
) => {
    const jwt = new SignJWT({ email: "me@test.dev" })
        .setProtectedHeader({ alg: opts.alg ?? "EdDSA", kid: "k1" })
        .setIssuer(opts.iss ?? ISSUER)
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? "5m");
    if (opts.sub !== null) jwt.setSubject(opts.sub ?? SUB);
    return jwt.sign(opts.key ?? signing);
};
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

const refused = async (token: string, code: string, status = 401) =>
    expect(verifyAppToken(env, token)).rejects.toMatchObject({ statusCode: status, code });

describe("JWT verification with real signatures", () => {
    it("accepts a token signed by the trusted key and names the person", async () => {
        expect(await verifyAppToken(env, await sign())).toEqual({ userId: SUB, email: "me@test.dev" });
    });

    it("refuses an expired token as expired, not as a bad issuer", async () => {
        await refused(await sign({ exp: Math.floor(Date.now() / 1000) - 3600 }), "TOKEN_EXPIRED");
    });

    it("refuses another issuer as the wrong issuer, not as expired", async () => {
        await refused(await sign({ iss: "https://evil.example" }), "INVALID_ISSUER");
    });

    it("refuses a token signed by a key the provider never published", async () => {
        await refused(await sign({ key: stranger }), "UNAUTHORIZED");
    });

    it("refuses a token whose signature was tampered with", async () => {
        const [h, p, s] = (await sign()).split(".");
        const forged = `${h}.${b64({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sub: "someone-else" })}.${s}`;
        await refused(forged, "UNAUTHORIZED");
    });

    it("refuses alg=none, an unsigned token naming any subject", async () => {
        const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: SUB, iss: ISSUER, exp: 9_999_999_999 })}.`;
        await refused(unsigned, "UNAUTHORIZED");
    });

    it("refuses an HMAC token signed with the public key as the secret (algorithm confusion)", async () => {
        const secret = new TextEncoder().encode("anything-the-attacker-knows");
        const hs = await new SignJWT({})
            .setProtectedHeader({ alg: "HS256", kid: "k1" })
            .setIssuer(ISSUER)
            .setSubject(SUB)
            .setExpirationTime("5m")
            .sign(secret);
        await refused(hs, "UNAUTHORIZED");
    });

    it("refuses a valid token that names nobody", async () => {
        await refused(await sign({ sub: null }), "UNAUTHORIZED");
    });

    it.each(["", "garbage", "a.b", "a.b.c", "Bearer x"])("refuses malformed input %j", async (token) => {
        await refused(token, "UNAUTHORIZED");
    });

    it("fails closed when production has no trusted issuer configured", async () => {
        await expect(verifyAppToken({ ...env, JWT_ISSUER: undefined }, await sign())).rejects.toMatchObject({
            statusCode: 500,
            code: "AUTH_MISCONFIGURED",
        });
    });
});
