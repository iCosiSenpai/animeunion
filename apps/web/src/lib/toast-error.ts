import { toast } from 'sonner';

/**
 * Mostra un toast d'errore coerente: usa il messaggio dell'errore (per gli errori tRPC è già il
 * messaggio mappato dal server, vedi `mapTrpcError`) oppure il fallback se assente/non un Error.
 */
export function toastError(error: unknown, fallback = 'Operazione non riuscita'): void {
  const message =
    error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
  toast.error(message);
}
