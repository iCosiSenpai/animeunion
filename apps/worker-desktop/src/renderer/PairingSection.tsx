import { useCallback, useEffect, useState } from 'react';
import type { PairOutcome } from '../shared/pairing';

// Schermata di abbinamento col NAS: l'utente incolla l'indirizzo di AnimeUnion (lo stesso del
// browser) e il codice mostrato in Impostazioni. Il main rileva l'IP LAN, costruisce l'URL del
// worker e chiama `pair` sul NAS. Nessun URL/token da digitare a mano.
export function PairingSection(): JSX.Element {
  const [animeunionUrl, setAnimeunionUrl] = useState('');
  const [suggestedWorkerUrl, setSuggestedWorkerUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PairOutcome | null>(null);

  useEffect(() => {
    void window.workerApi.getPairingInfo().then((info) => {
      setAnimeunionUrl(info.animeunionUrl);
      setSuggestedWorkerUrl(info.suggestedWorkerUrl);
    });
  }, []);

  const onPair = useCallback(async () => {
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await window.workerApi.pair({ animeunionUrl, code }));
    } finally {
      setBusy(false);
    }
  }, [animeunionUrl, code]);

  const canPair = animeunionUrl.trim().length > 0 && code.trim().length >= 4 && !busy;

  return (
    <section className="rounded-2xl bg-slate-900 p-6">
      <h2 className="text-sm font-semibold text-slate-300">Abbina al NAS</h2>
      <p className="mt-1 text-sm text-slate-400">
        Inserisci l'indirizzo di AnimeUnion e il codice mostrato in Impostazioni › Download Neurale.
      </p>

      <label className="mt-4 block text-xs font-medium text-slate-400" htmlFor="au-url">
        Indirizzo AnimeUnion
      </label>
      <input
        id="au-url"
        type="text"
        placeholder="http://nas:7979"
        value={animeunionUrl}
        onChange={(e) => setAnimeunionUrl(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
      />

      <label className="mt-3 block text-xs font-medium text-slate-400" htmlFor="au-code">
        Codice di abbinamento
      </label>
      <input
        id="au-code"
        inputMode="numeric"
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="mt-1 w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-lg tracking-[0.3em] text-slate-100 outline-none focus:border-indigo-500"
      />

      {suggestedWorkerUrl && (
        <p className="mt-3 text-xs text-slate-500">Il NAS contatterà: {suggestedWorkerUrl}</p>
      )}

      <button
        type="button"
        onClick={() => void onPair()}
        disabled={!canPair}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? 'Abbinamento…' : 'Abbina'}
      </button>

      {outcome && (
        <p className={`mt-3 text-sm ${outcome.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {outcome.ok
            ? outcome.ffmpegCapable
              ? 'Abbinato! Il NAS raggiunge il worker e la GPU è pronta.'
              : 'Abbinato! Il NAS raggiunge il worker (verifica GPU/ffmpeg dallo stato).'
            : (outcome.message ?? 'Abbinamento fallito')}
        </p>
      )}
    </section>
  );
}
