import { request } from 'undici';
import type { Logger } from './logger';

export interface TelegramCredentials {
  botToken?: string;
  chatId?: string;
}

export interface TelegramNotifier {
  /** True se token e chat id sono configurati (config-DB o env). */
  isConfigured(): boolean;
  /** Invia un messaggio (best-effort: non lancia, logga e basta). */
  send(text: string): Promise<void>;
  /** Invio di prova che RIPORTA l'esito (per il bottone "Invia test"). Se passi
   *  delle credenziali, usa quelle (test dei valori digitati prima del salvataggio). */
  sendTest(override?: TelegramCredentials): Promise<{ ok: boolean; error?: string }>;
}

export function createTelegramNotifier(deps: {
  // Lazy: le credenziali vengono rilette ad ogni uso (cambio live, niente restart).
  getCredentials: () => TelegramCredentials;
  logger?: Logger;
}): TelegramNotifier {
  const { getCredentials, logger } = deps;

  // Effettua la POST a Telegram; ritorna l'esito senza lanciare.
  async function post(
    creds: TelegramCredentials,
    text: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const { botToken, chatId } = creds;
    if (!botToken || !chatId) {
      return { ok: false, error: 'Token o chat id mancanti' };
    }
    try {
      const res = await request(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      if (res.statusCode >= 400) {
        const body = await res.body.text().catch(() => '');
        // Non logghiamo l'URL (contiene il token): solo status + corpo troncato.
        logger?.debug(
          { status: res.statusCode, body: body.slice(0, 200) },
          'Telegram: invio fallito',
        );
        return { ok: false, error: `Telegram ha risposto ${res.statusCode}` };
      }
      await res.body.dump().catch(() => {});
      return { ok: true };
    } catch (error) {
      logger?.debug({ err: error }, 'Telegram: errore di rete');
      return { ok: false, error: 'Errore di rete verso Telegram' };
    }
  }

  return {
    isConfigured(): boolean {
      const { botToken, chatId } = getCredentials();
      return !!botToken && !!chatId;
    },

    async send(text: string): Promise<void> {
      const creds = getCredentials();
      if (!creds.botToken || !creds.chatId) {
        return;
      }
      await post(creds, text);
    },

    async sendTest(override?: TelegramCredentials): Promise<{ ok: boolean; error?: string }> {
      const fallback = getCredentials();
      const creds: TelegramCredentials = {
        botToken: override?.botToken || fallback.botToken,
        chatId: override?.chatId || fallback.chatId,
      };
      return post(
        creds,
        'AnimeUnion Docker: messaggio di test. Le notifiche Telegram funzionano! 🎉',
      );
    },
  };
}
