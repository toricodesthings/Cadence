import { z } from "zod";
import { instantSchema, zoneSchema } from "./common";

/** What a person types to confirm account deletion. The server checks it too, so a stray request can't delete anything. */
export const ACCOUNT_DELETE_PHRASE = "delete my account";

/**
 * Deletion also needs proof the person is really here, not just a valid session: the account password, or (for
 * Google/GitHub accounts without one) a code emailed to them. The server checks whichever is given.
 */
export const deleteAccountSchema = z.object({
    confirmation: z.literal(ACCOUNT_DELETE_PHRASE),
    password: z.string().min(1).max(256).optional(),
    otp: z.string().trim().min(4).max(12).optional(),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** One data-export request: the record of where and when a copy of someone's data was emailed. */
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

/** What Settings shows of a request. */
export const dataExportSchema = dataExportRowSchema.omit({ userId: true, bytes: true });
export type DataExport = z.infer<typeof dataExportSchema>;

/** The device's zone, sent so the server's one source of the user's zone (`users.time_zone`) follows it. */
export const setTimeZoneSchema = z.object({ timeZone: zoneSchema });
export type SetTimeZoneInput = z.infer<typeof setTimeZoneSchema>;
