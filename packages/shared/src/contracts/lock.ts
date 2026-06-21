import { z } from 'zod';

// Stato del blocco web UI: enabled = passcode impostato; unlocked = sessione valida (o blocco off).
export const lockStatusSchema = z.object({
  enabled: z.boolean(),
  unlocked: z.boolean(),
});
export type LockStatus = z.infer<typeof lockStatusSchema>;

// Esito di unlock/setPasscode: token di sessione da salvare (null se non applicabile).
export const lockTokenResultSchema = z.object({
  ok: z.boolean(),
  token: z.string().nullable(),
});
export type LockTokenResult = z.infer<typeof lockTokenResultSchema>;

export const lockUnlockInputSchema = z.object({ passcode: z.string().min(1) });
export type LockUnlockInput = z.infer<typeof lockUnlockInputSchema>;

export const lockSetPasscodeInputSchema = z.object({
  next: z.string().min(4, 'Almeno 4 caratteri'),
  current: z.string().optional(),
});
export type LockSetPasscodeInput = z.infer<typeof lockSetPasscodeInputSchema>;

export const lockDisableInputSchema = z.object({ current: z.string().min(1) });
export type LockDisableInput = z.infer<typeof lockDisableInputSchema>;
