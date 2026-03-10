import { z } from "zod";

export const jwtPayloadSchema = z.object({
    sub: z.string().uuid(),
    iss: z.string(),
    exp: z.number(),
    iat: z.number(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
