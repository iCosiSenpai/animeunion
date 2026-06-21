import { z } from 'zod';

export const pushPublicKeySchema = z.object({ publicKey: z.string() });
export type PushPublicKey = z.infer<typeof pushPublicKeySchema>;

// Sottoscrizione push del browser (PushSubscription.toJSON()).
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeInputSchema = z.object({ endpoint: z.string() });
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeInputSchema>;
