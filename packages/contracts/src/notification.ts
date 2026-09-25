import { z } from "zod";
import { isoDateTimeSchema } from "./common";

export const notificationObjectTypeSchema = z.enum(["task", "habit", "event"]);

/** When a reminder was shown, dismissed or deferred, per object and trigger. */
export const notificationStateRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    objectType: z.string(),
    objectId: z.uuid(),
    triggerId: z.string(),
    firstPresentedAt: isoDateTimeSchema.nullable(),
    lastPresentedAt: isoDateTimeSchema.nullable(),
    dismissedAt: isoDateTimeSchema.nullable(),
    deferredUntil: isoDateTimeSchema.nullable(),
    actionTaken: z.string().nullable(),
    presentationCount: z.number().int(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});

export const notificationStateSchema = notificationStateRowSchema.extend({
    objectType: notificationObjectTypeSchema,
});
export type NotificationState = z.infer<typeof notificationStateSchema>;

/** POST /settings/notification-state. Omitted fields keep their stored value. */
export const upsertNotificationStateSchema = z.object({
    objectType: notificationObjectTypeSchema,
    objectId: z.uuid(),
    triggerId: z.string().min(1).max(200),
    firstPresentedAt: isoDateTimeSchema.nullable().optional(),
    lastPresentedAt: isoDateTimeSchema.nullable().optional(),
    dismissedAt: isoDateTimeSchema.nullable().optional(),
    deferredUntil: isoDateTimeSchema.nullable().optional(),
    actionTaken: z.string().max(64).nullable().optional(),
    presentationCountIncrement: z.number().int().min(0).max(100).optional(),
});
export type UpsertNotificationState = z.infer<typeof upsertNotificationStateSchema>;
