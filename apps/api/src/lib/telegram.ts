import { request } from 'undici';
import type { Logger } from './logger';

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export interface TelegramNotifier {
  /** True se token e chat id sono configurati. */
  isConfigured(): boolean;
  /** Invia un messaggio (best-effort: non lancia, logga e basta). */
  send(text: string): Promise<void>;
}

export function createTelegramNotifier(deps: {
  config: TelegramConfig;
  logger?: Logger;
}): TelegramNotifier {
  const { botToken, chatId } = deps.config;
  const logger = deps.logger;

  return {
    isConfigured(): boolean {
      return !!botToken && !!chatId;
    },

    async send(text: string): Promise<void> {
      if (!botToken || !chatId) {
        return;
      }
      try {
        const res = await request(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        });
        if (res.statusCode >= 400) {
          const body = await res.body.text().catch(() => '');
          logger?.debug(
            { status: res.statusCode, body: body.slice(0, 200) },
            'Telegram: invio fallito',
          );
        } else {
          await res.body.dump().catch(() => {});
        }
      } catch (error) {
        logger?.debug({ err: error }, 'Telegram: errore di rete');
      }
    },
  };
}
