import { z } from "zod";
import { instantSchema } from "./common";

export const notificationObjectTypeSchema = z.enum(["task", "habit", "event"]);

/** When a reminder was shown, dismissed or deferred, per object and trigger. */
export const notificationStateRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    objectType: z.string(),
    objectId: z.uuid(),
    triggerId: z.string(),
    firstPresentedAt: instantSchema.nullable(),
    lastPresentedAt: instantSchema.nullable(),
    dismissedAt: instantSchema.nullable(),
    deferredUntil: instantSchema.nullable(),
    actionTaken: z.string().nullable(),
    presentationCount: z.number().int(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});

export type NotificationStateRow = z.infer<typeof notificationStateRowSchema>;

export const notificationStateSchema = notificationStateRowSchema.extend({
    objectType: notificationObjectTypeSchema,
});
export type NotificationState = z.infer<typeof notificationStateSchema>;

/** POST /settings/notification-state. Omitted fields keep their stored value. */
export const upsertNotificationStateSchema = z.object({
    objectType: notificationObjectTypeSchema,
    objectId: z.uuid(),
    triggerId: z.string().min(1).max(200),
    firstPresentedAt: instantSchema.nullable().optional(),
    lastPresentedAt: instantSchema.nullable().optional(),
    dismissedAt: instantSchema.nullable().optional(),
    deferredUntil: instantSchema.nullable().optional(),
    actionTaken: z.string().max(64).nullable().optional(),
    presentationCountIncrement: z.number().int().min(0).max(100).optional(),
});
export type UpsertNotificationState = z.infer<typeof upsertNotificationStateSchema>;
