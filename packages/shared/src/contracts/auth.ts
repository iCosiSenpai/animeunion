import { z } from 'zod';

export const authStatusSchema = z.object({
  authenticated: z.boolean(),
  expiresAt: z.string().nullable(),
  userEmail: z.string().nullable(),
});
export type AuthStatus = z.infer<typeof authStatusSchema>;

export const authLoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
