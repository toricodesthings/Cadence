import { describe, expect, it, vi } from "vitest";
import { encryptPayload, fromBase64Url, hasValidPushKeys, isAllowedPushEndpoint, sendWebPush, toBase64Url } from "../../src/domains/push/web-push";
import type { Env } from "../../src/types/env";

const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));

/** A browser's side of RFC 8291: decrypts what the server encrypted. */
async function browser() {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey) as ArrayBuffer);
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const keys = { p256dh: toBase64Url(publicRaw), auth: toBase64Url(authSecret) };
    const decrypt = async (body: Uint8Array) => {
        const salt = body.slice(0, 16);
        const serverPublic = body.slice(21, 21 + body[20]);
        const peer = await crypto.subtle.importKey("raw", serverPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
        const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: peer } as never, pair.privateKey, 256));
        const enc = new TextEncoder();
        const ikm = await hkdf(authSecret, secret, concat(enc.encode("WebPush: info\0"), publicRaw, serverPublic), 32);
        const cek = await crypto.subtle.importKey("raw", await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["decrypt"]);
        const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
        const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, cek, body.slice(21 + body[20])));
        return new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2)));
    };
    return { keys, decrypt };
}

async function vapidEnv(): Promise<Env> {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey) as JsonWebKey;
    const publicRaw = concat(new Uint8Array([4]), fromBase64Url(jwk.x!), fromBase64Url(jwk.y!));
    return { VAPID_PUBLIC_KEY: toBase64Url(publicRaw), VAPID_PRIVATE_KEY: jwk.d! } as Env;
}

describe("encryptPayload", () => {
    it("is decryptable by the subscribed browser only", async () => {
        const target = await browser();
        const body = await encryptPayload(target.keys, '{"title":"Pay rent"}');
        expect(await target.decrypt(body)).toBe('{"title":"Pay rent"}');
        const other = await browser();
        await expect(other.decrypt(body)).rejects.toThrow();
    });
});

describe("sendWebPush", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    const message = { title: "t", body: "b", route: "/project/1", tag: "k" };

    it("signs a VAPID request with a verifiable key and a decryptable body", async () => {
        const env = await vapidEnv();
        const target = await browser();
        const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
        vi.stubGlobal("fetch", fetchMock);
        expect(await sendWebPush(env, { endpoint, ...target.keys }, message)).toBe("accepted");

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(endpoint);
        expect(init.redirect).toBe("manual");
        const header = (init.headers as Record<string, string>).Authorization;
        const [, jwt] = /t=([^,]+), k=(.+)$/.exec(header)!;
        const [head, claims, signature] = jwt.split(".");
        const key = await crypto.subtle.importKey("raw", fromBase64Url(env.VAPID_PUBLIC_KEY!), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromBase64Url(signature), new TextEncoder().encode(`${head}.${claims}`))).toBe(true);
        expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims))).aud).toBe("https://fcm.googleapis.com");
        expect(JSON.parse(await target.decrypt(init.body as Uint8Array))).toMatchObject({ title: "t", route: "/project/1", tag: "k" });
        vi.unstubAllGlobals();
    });

    it("maps push-service answers and never calls a disallowed host", async () => {
        const env = await vapidEnv();
        const target = await browser();
        vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 410 })));
        expect(await sendWebPush(env, { endpoint, ...target.keys }, message)).toBe("gone");
        vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302 })));
        expect(await sendWebPush(env, { endpoint, ...target.keys }, message)).toBe("failed");
        const never = vi.fn();
        vi.stubGlobal("fetch", never);
        expect(await sendWebPush(env, { endpoint: "https://evil.example/x", ...target.keys }, message)).toBe("failed");
        expect(never).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});

describe("subscription validation", () => {
    it("allows only https on the browsers' push services", () => {
        for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
            expect(isAllowedPushEndpoint(ok)).toBe(true);
        }
        for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/", "https://fcm.googleapis.com.evil.example/x", "https://u:p@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "not a url"]) {
            expect(isAllowedPushEndpoint(bad)).toBe(false);
        }
    });

    it("checks key sizes", async () => {
        const target = await browser();
        expect(hasValidPushKeys(target.keys)).toBe(true);
        expect(hasValidPushKeys({ ...target.keys, auth: "AAAA" })).toBe(false);
        expect(hasValidPushKeys({ p256dh: toBase64Url(new Uint8Array(65)), auth: target.keys.auth })).toBe(false);
    });
});
