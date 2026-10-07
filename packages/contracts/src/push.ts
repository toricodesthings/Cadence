import { z } from "zod";

const base64url = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/);

/** PUT /push/subscription: a browser's PushSubscription (`subscription.toJSON()`). */
export const pushSubscriptionInputSchema = z.object({
    endpoint: z.url().max(2048),
    keys: z.object({ p256dh: base64url(128), auth: base64url(48) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

/** DELETE /push/subscription and POST /push/test name the device by its endpoint. */
export const pushEndpointSchema = z.object({ endpoint: z.url().max(2048) });

/** GET /push/config. No key means the server can't send push yet. */
export const pushConfigSchema = z.object({ publicKey: z.string().nullable() });
export type PushConfig = z.infer<typeof pushConfigSchema>;

/** accepted = the push service took it (not proof it was shown); gone = the device was unregistered. */
export const pushTestResultSchema = z.object({ outcome: z.enum(["accepted", "gone", "failed"]) });
export type PushTestResult = z.infer<typeof pushTestResultSchema>;
