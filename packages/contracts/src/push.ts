import { z } from "zod";
import { instantSchema } from "./common";

const base64url = (max: number) =>
    z
        .string()
        .min(1)
        .max(max)
        .regex(/^[A-Za-z0-9_-]+$/);

export const deviceKindSchema = z.enum(["phone", "computer", "desktop-app"]);
export type DeviceKind = z.infer<typeof deviceKindSchema>;

export const pushSubscriptionInputSchema = z.object({
    endpoint: z.url().max(2048),
    keys: z.object({ p256dh: base64url(128), auth: base64url(48) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const deviceRegistrationSchema = z.object({
    installId: z.uuid(),
    kind: deviceKindSchema,
    label: z.string().min(1).max(60),
    subscription: pushSubscriptionInputSchema.nullable().optional(),
});
export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;

export const devicePatchSchema = z.object({ enabled: z.boolean() });

export const deviceSchema = z.object({
    installId: z.uuid(),
    kind: deviceKindSchema,
    label: z.string(),
    enabled: z.boolean(),
    push: z.boolean(),
    lastSeenAt: instantSchema.nullable(),
    createdAt: instantSchema,
});
export type Device = z.infer<typeof deviceSchema>;

export const pushConfigSchema = z.object({ publicKey: z.string().nullable() });
export type PushConfig = z.infer<typeof pushConfigSchema>;

export const pushTestSchema = z.object({ installId: z.uuid() });
export const pushTestResultSchema = z.object({ outcome: z.enum(["accepted", "gone", "failed"]) });
export type PushTestResult = z.infer<typeof pushTestResultSchema>;
