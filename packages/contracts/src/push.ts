import { z } from "zod";
import { instantSchema } from "./common";

const base64url = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/);

/** Where a device sits: a phone, a computer's browser, or the installed Cadence app. */
export const deviceKindSchema = z.enum(["phone", "computer", "desktop-app"]);
export type DeviceKind = z.infer<typeof deviceKindSchema>;

/** A browser's PushSubscription (`subscription.toJSON()`). Absent for the desktop app, which has no Web Push. */
export const pushSubscriptionInputSchema = z.object({
    endpoint: z.url().max(2048),
    keys: z.object({ p256dh: base64url(128), auth: base64url(48) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

/** PUT /push/devices — registers or refreshes the calling device. `installId` is its stable identity. */
export const deviceRegistrationSchema = z.object({
    installId: z.uuid(),
    kind: deviceKindSchema,
    label: z.string().min(1).max(60),
    subscription: pushSubscriptionInputSchema.nullable().optional(),
});
export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;

/** PATCH /push/devices/:installId */
export const devicePatchSchema = z.object({ enabled: z.boolean() });

/** One of the account's devices. Keys and endpoints never leave the server. */
export const deviceSchema = z.object({
    installId: z.uuid(),
    kind: deviceKindSchema,
    label: z.string(),
    enabled: z.boolean(),
    /** Whether the server can reach it while Cadence is closed. */
    push: z.boolean(),
    lastSeenAt: instantSchema.nullable(),
    createdAt: instantSchema,
});
export type Device = z.infer<typeof deviceSchema>;

/** GET /push/config. No key means the server can't send push yet. */
export const pushConfigSchema = z.object({ publicKey: z.string().nullable() });
export type PushConfig = z.infer<typeof pushConfigSchema>;

/** POST /push/test. accepted = the push service took it (not proof it was shown); gone = the device was unregistered. */
export const pushTestSchema = z.object({ installId: z.uuid() });
export const pushTestResultSchema = z.object({ outcome: z.enum(["accepted", "gone", "failed"]) });
export type PushTestResult = z.infer<typeof pushTestResultSchema>;
