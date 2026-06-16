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

// --- Social login (device flow, v1.1.x) ---

export const socialProviderSchema = z.enum(['google', 'discord']);
export type SocialProvider = z.infer<typeof socialProviderSchema>;

export const socialStartInputSchema = z.object({
  provider: socialProviderSchema,
});
export type SocialStartInput = z.infer<typeof socialStartInputSchema>;

/** Dati pubblici da mostrare all'utente. Il `device_code` resta segreto lato backend. */
export const socialStartOutputSchema = z.object({
  userCode: z.string(),
  verificationUri: z.string(),
  verificationUriComplete: z.string(),
  expiresIn: z.number().int(),
  interval: z.number().int(),
});
export type SocialStartOutput = z.infer<typeof socialStartOutputSchema>;

export const socialPollStatusSchema = z.enum([
  'pending',
  'slow_down',
  'denied',
  'expired',
  'approved',
]);
export type SocialPollStatus = z.infer<typeof socialPollStatusSchema>;

/** `auth` valorizzato solo quando `status === 'approved'`. */
export const socialPollOutputSchema = z.object({
  status: socialPollStatusSchema,
  auth: authStatusSchema.nullable(),
});
export type SocialPollOutput = z.infer<typeof socialPollOutputSchema>;
