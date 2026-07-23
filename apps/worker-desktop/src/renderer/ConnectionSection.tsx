import { useCallback, useEffect, useState } from 'react';
import type { ConnectionInfo, EnrollOutcome, FirewallResult } from '../shared/ipc';

// Pannello di connessione al NAS: mostra l'indirizzo LAN del worker, consente di aprire la porta sul
// firewall, cerca il NAS in rete (scan) e completa il collegamento (enrollment). Nessun codice né
// token da digitare: è il worker a collegarsi al NAS.
export function ConnectionSection(): JSX.Element {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [animeunionUrl, setAnimeunionUrl] = useState('');

  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<string[] | null>(null);

  const [enrolling, setEnrolling] = useState(false);
  const [outcome, setOutcome] = useState<EnrollOutcome | null>(null);

  const [firewallBusy, setFirewallBusy] = useState(false);
  const [firewall, setFirewall] = useState<FirewallResult | null>(null);

  useEffect(() => {
    void window.workerApi.getConnectionInfo().then((i) => {
      setInfo(i);
      setAnimeunionUrl(i.animeunionUrl);
    });
  }, []);

  const onScan = useCallback(async () => {
    setScanning(true);
    setScanResults(null);
    try {
      const found = await window.workerApi.discoverNas();
      setScanResults(found);
      if (found.length === 1 && found[0]) {
        setAnimeunionUrl(found[0]);
      }
    } finally {
      setScanning(false);
    }
  }, []);

  const onEnroll = useCallback(async () => {
    setEnrolling(true);
    setOutcome(null);
    try {
      setOutcome(await window.workerApi.enroll({ animeunionUrl }));
    } finally {
      setEnrolling(false);
    }
  }, [animeunionUrl]);

  const onAllowFirewall = useCallback(async () => {
    setFirewallBusy(true);
    setFirewall(null);
    try {
      setFirewall(await window.workerApi.allowFirewall());
    } finally {
      setFirewallBusy(false);
    }
  }, []);

  const canEnroll = animeunionUrl.trim().length > 0 && !enrolling;

  return (
    <section className="rounded-2xl bg-slate-900 p-6">
      <h2 className="text-sm font-semibold text-slate-300">Collegamento al NAS</h2>
      <p className="mt-1 text-sm text-slate-400">
        Cerca AnimeUnion sulla rete (o incolla l'indirizzo), poi premi Collega. Il PC si registra
        sul NAS in automatico: niente codici né token da digitare.
      </p>

      {info && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-400">Indirizzo di questo worker</span>
            <span className="font-mono text-slate-200">
              {info.workerUrl ?? `porta ${info.port}`}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-slate-400">Nome</span>
            <span className="font-mono text-slate-200">{info.workerName}</span>
          </div>
        </div>
      )}

      {info?.needsFirewallHint && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onAllowFirewall()}
            disabled={firewallBusy}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            {firewallBusy ? 'Attendi il consenso…' : 'Consenti sulla rete (firewall)'}
          </button>
          {firewall && (
            <span className={firewall.ok ? 'text-sm text-emerald-400' : 'text-sm text-amber-400'}>
              {firewall.message}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onScan()}
          disabled={scanning}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
        >
          {scanning ? 'Ricerca in corso…' : 'Cerca AnimeUnion in rete'}
        </button>
        {scanResults && scanResults.length === 0 && (
          <span className="text-sm text-slate-400">
            Nessun NAS trovato: incolla l'indirizzo qui sotto.
          </span>
        )}
      </div>

      {scanResults && scanResults.length > 1 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-slate-400">Trovati sulla rete:</p>
          {scanResults.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setAnimeunionUrl(url)}
              className={`block w-full rounded-lg border px-3 py-2 text-left font-mono text-sm transition ${
                animeunionUrl === url
                  ? 'border-indigo-500 bg-indigo-500/10 text-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {url}
            </button>
          ))}
        </div>
      )}

      <label className="mt-4 block text-xs font-medium text-slate-400" htmlFor="au-url">
        Indirizzo AnimeUnion (lo stesso che apri nel browser)
      </label>
      <input
        id="au-url"
        type="text"
        placeholder="http://192.168.1.10:7979"
        value={animeunionUrl}
        onChange={(e) => setAnimeunionUrl(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
      />

      <button
        type="button"
        onClick={() => void onEnroll()}
        disabled={!canEnroll}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {enrolling ? 'Collegamento…' : 'Collega al NAS'}
      </button>

      {outcome && (
        <p className={`mt-3 text-sm ${outcome.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {outcome.ok
            ? outcome.ffmpegCapable
              ? 'Collegato! Il NAS raggiunge il worker e la GPU è pronta.'
              : 'Collegato! Il NAS raggiunge il worker (verifica lo stato GPU qui sopra).'
            : (outcome.message ?? 'Collegamento fallito')}
        </p>
      )}
    </section>
  );
}
