/**
 * Web Push sender: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291) via
 * `@block65/webcrypto-web-push` (WebCrypto, edge-safe; bodies padded to 4 KB).
 * Never log or return an endpoint or its keys.
 */
import { encryptNotification, vapidHeaders } from "@block65/webcrypto-web-push";
import { appOrigin, type Env } from "../../types/env";

type Bytes = Uint8Array<ArrayBuffer>;

export const toBase64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromBase64Url = (text: string): Bytes => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

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

export interface PushMessage {
    title: string;
    body: string;
    /** Same-origin path (with query) the tap opens. */
    route: string | null;
    /** Notifications with the same tag replace each other. */
    tag: string;
}

/**
 * A Declarative Web Push message: Safari 18.4+ can show it with no service worker running, and a tap
 * opens `navigate`. `mutable` still hands it to sw.js first, which keeps in-app tap routing and the
 * icon badge; other browsers always hand it to sw.js. The flat copy is the payload service workers from
 * before this format read.
 * ponytail: drop the flat fields once installed apps have all updated their sw.js.
 */
export function pushPayload(env: Env, message: PushMessage) {
    const title = message.title.slice(0, 120) || "Cadence";
    const body = message.body.slice(0, 240);
    const route = message.route && message.route.startsWith("/") && !message.route.startsWith("//") ? message.route : "/";
    const tag = message.tag.slice(0, 200);
    return {
        web_push: 8030,
        mutable: true,
        notification: { title, body, navigate: `${appOrigin(env)}${route}`, tag },
        title, body, route, tag,
    };
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
        const sub = { endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: subscription.p256dh, auth: subscription.auth } };
        const [{ headers }, body] = await Promise.all([
            vapidHeaders(sub, { subject: env.VAPID_SUBJECT || "mailto:support@cadenceapp.cloud", publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }),
            encryptNotification(sub, new TextEncoder().encode(JSON.stringify(pushPayload(env, message)))),
        ]);
        const response = await fetch(subscription.endpoint, {
            method: "POST",
            redirect: "manual",
            headers: {
                Authorization: headers.authorization,
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
