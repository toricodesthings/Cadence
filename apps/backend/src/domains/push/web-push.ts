/**
 * Web Push sender on WebCrypto: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291).
 * Edge-safe, no dependencies. Never log or return an endpoint or its keys.
 */
import type { Env } from "../../types/env";

const encoder = new TextEncoder();

/** WebCrypto wants buffers it can prove are not shared. */
type Bytes = Uint8Array<ArrayBuffer>;
const utf8 = (text: string): Bytes => new Uint8Array(encoder.encode(text));

export const toBase64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromBase64Url = (text: string): Bytes => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

const concat = (...parts: Uint8Array[]): Bytes => {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
};

// The push services browsers use today: Chrome/Android/Edge-on-FCM, Firefox, Safari/iOS, Edge on Windows.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

/** A subscription endpoint must be https on a known push service, so a stored endpoint can never aim the Worker at something else. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
    try {
        const url = new URL(endpoint);
        return url.protocol === "https:" && !url.username && !url.password && !url.port && PUSH_HOSTS.some((host) => host.test(url.hostname));
    } catch {
        return false;
    }
}

/** A p256dh key is an uncompressed P-256 point (65 bytes, 0x04 first); an auth secret is 16 bytes. */
export function hasValidPushKeys(keys: { p256dh: string; auth: string }): boolean {
    try {
        const p256dh = fromBase64Url(keys.p256dh);
        return p256dh.length === 65 && p256dh[0] === 4 && fromBase64Url(keys.auth).length === 16;
    } catch {
        return false;
    }
}

export const vapidConfigured = (env: Env): boolean => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

async function vapidHeader(env: Env, endpoint: string): Promise<string> {
    const publicKey = fromBase64Url(env.VAPID_PUBLIC_KEY!);
    const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: toBase64Url(publicKey.slice(1, 33)), y: toBase64Url(publicKey.slice(33)), d: env.VAPID_PRIVATE_KEY! },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
    );
    const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:support@cadenceapp.cloud" };
    const unsigned = `${toBase64Url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${toBase64Url(utf8(JSON.stringify(claims)))}`;
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(unsigned)));
    return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** The aes128gcm body for one push (RFC 8291). */
export async function encryptPayload(keys: { p256dh: string; auth: string }, payload: string): Promise<Bytes> {
    const userAgentPublic = fromBase64Url(keys.p256dh);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const serverPublic = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
    const peer = await crypto.subtle.importKey("raw", userAgentPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: peer } as unknown as SubtleCryptoDeriveKeyAlgorithm, pair.privateKey, 256));

    const ikm = await hkdf(fromBase64Url(keys.auth), secret, concat(utf8("WebPush: info\0"), userAgentPublic, serverPublic), 32);
    const cek = await crypto.subtle.importKey("raw", await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["encrypt"]);
    const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cek, concat(utf8(payload), new Uint8Array([2]))));

    const header = new Uint8Array(21);
    header.set(salt);
    new DataView(header.buffer).setUint32(16, 4096);
    header[20] = serverPublic.length;
    return concat(header, serverPublic, sealed);
}

export interface PushMessage {
    title: string;
    body: string;
    /** Same-origin path (with query) the tap opens. */
    route: string | null;
    /** Notifications with the same tag replace each other. */
    tag: string;
}

/** accepted: the push service took it · gone: the device is unregistered (drop it) · failed: try again later. */
export type PushOutcome = "accepted" | "gone" | "failed";

/** Sends one push. Redirects are refused (a push service never needs one); `ttl` is how long the service may hold it for an offline device. */
export async function sendWebPush(
    env: Env,
    subscription: { endpoint: string; p256dh: string; auth: string },
    message: PushMessage,
    ttlSeconds = 900,
): Promise<PushOutcome> {
    if (!vapidConfigured(env) || !isAllowedPushEndpoint(subscription.endpoint)) return "failed";
    try {
        const body = await encryptPayload(subscription, JSON.stringify({
            title: message.title.slice(0, 120),
            body: message.body.slice(0, 240),
            route: message.route && message.route.startsWith("/") && !message.route.startsWith("//") ? message.route : "/",
            tag: message.tag.slice(0, 200),
        }));
        const response = await fetch(subscription.endpoint, {
            method: "POST",
            redirect: "manual",
            headers: {
                Authorization: await vapidHeader(env, subscription.endpoint),
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                TTL: String(ttlSeconds),
                Urgency: "high",
            },
            body,
            signal: AbortSignal.timeout(10_000),
        });
        if (response.status >= 200 && response.status < 300) return "accepted";
        return response.status === 404 || response.status === 410 ? "gone" : "failed";
    } catch {
        return "failed";
    }
}
