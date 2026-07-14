import { request } from 'undici';
import type { Logger } from './logger';

export interface DiscordNotifier {
  /** True se il webhook URL e' configurato (config-DB o env). */
  isConfigured(): boolean;
  /** Invia un messaggio (best-effort: non lancia, logga e basta). */
  send(text: string): Promise<void>;
  /** Invio di prova che RIPORTA l'esito (per il bottone "Invia test"). Se passi un
   *  webhook URL, usa quello (test del valore digitato prima del salvataggio). */
  sendTest(overrideUrl?: string): Promise<{ ok: boolean; error?: string }>;
}

export function createDiscordNotifier(deps: {
  // Lazy: il webhook viene riletto ad ogni uso (cambio live, niente restart).
  getWebhookUrl: () => string | undefined;
  logger?: Logger;
}): DiscordNotifier {
  const { getWebhookUrl, logger } = deps;

  // Effettua la POST al webhook Discord; ritorna l'esito senza lanciare.
  async function post(
    url: string | undefined,
    text: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!url) {
      return { ok: false, error: 'Webhook URL mancante' };
    }
    try {
      const res = await request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.statusCode >= 400) {
        const body = await res.body.text().catch(() => '');
        // Non logghiamo l'URL (contiene il token del webhook): solo status + corpo troncato.
        logger?.debug(
          { status: res.statusCode, body: body.slice(0, 200) },
          'Discord: invio fallito',
        );
        return { ok: false, error: `Discord ha risposto ${res.statusCode}` };
      }
      // Discord risponde 204 No Content su successo: svuota comunque il corpo.
      await res.body.dump().catch(() => {});
      return { ok: true };
    } catch (error) {
      logger?.debug({ err: error }, 'Discord: errore di rete');
      return { ok: false, error: 'Errore di rete verso Discord' };
    }
  }

  return {
    isConfigured(): boolean {
      return !!getWebhookUrl();
    },

    async send(text: string): Promise<void> {
      const url = getWebhookUrl();
      if (!url) {
        return;
      }
      await post(url, text);
    },

    async sendTest(overrideUrl?: string): Promise<{ ok: boolean; error?: string }> {
      const url = overrideUrl || getWebhookUrl();
      return post(url, 'AnimeUnion Docker: messaggio di test. Le notifiche Discord funzionano! 🎉');
    },
  };
}
