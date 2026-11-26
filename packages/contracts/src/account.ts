import { z } from "zod";
import { instantSchema, zoneSchema } from "./common";

export const ACCOUNT_DELETE_PHRASE = "delete my account";

export const deleteAccountSchema = z.object({
    confirmation: z.literal(ACCOUNT_DELETE_PHRASE),
    password: z.string().min(1).max(256).optional(),
    otp: z.string().trim().min(4).max(12).optional(),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const dataExportRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    email: z.string(),
    status: z.enum(["pending", "sent", "failed"]),
    bytes: z.number().int().nullable(),
    requestedAt: instantSchema,
    completedAt: instantSchema.nullable(),
});
export type DataExportRow = z.infer<typeof dataExportRowSchema>;

export const dataExportSchema = dataExportRowSchema.omit({ userId: true, bytes: true });
export type DataExport = z.infer<typeof dataExportSchema>;

export const setTimeZoneSchema = z.object({ timeZone: zoneSchema });
export type SetTimeZoneInput = z.infer<typeof setTimeZoneSchema>;
