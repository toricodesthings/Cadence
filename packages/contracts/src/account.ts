import { z } from "zod";

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
