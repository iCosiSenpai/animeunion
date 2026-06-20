'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { Folder, FolderOpen, Loader2 } from 'lucide-react';
import { useState } from 'react';

/**
 * Campo cartella: input testuale + "Sfoglia" che apre un browser delle cartelle
 * montate nel container (via config.browseDir). Riusato da Impostazioni e wizard.
 */
export function FolderInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const browseQuery = trpc.config.browseDir.useQuery(
    { path: browsePath || undefined },
    { enabled: open },
  );

  const navigateInto = (name: string) => {
    if (browseQuery.data) {
      setBrowsePath(`${browseQuery.data.path.replace(/\/$/, '')}/${name}`);
    }
  };
  const navigateUp = () => {
    if (browseQuery.data?.parent) {
      setBrowsePath(browseQuery.data.parent);
    }
  };
  const selectCurrent = () => {
    if (browseQuery.data) {
      onChange(browseQuery.data.path);
    }
    setOpen(false);
  };

  return (
    <div className="flex gap-2">
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label="Sfoglia"
        onClick={() => {
          setBrowsePath(value || '');
          setOpen(true);
        }}
      >
        <Folder className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scegli una cartella</DialogTitle>
            <DialogDescription className="break-all font-mono text-xs">
              {browseQuery.data?.path ?? '…'}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {browseQuery.isLoading ? (
              <div className="flex items-center justify-center p-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <ul className="divide-y text-sm">
                {browseQuery.data?.parent ? (
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted"
                      onClick={navigateUp}
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      .. (cartella superiore)
                    </button>
                  </li>
                ) : null}
                {(browseQuery.data?.dirs ?? []).map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted"
                      onClick={() => navigateInto(name)}
                    >
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      {name}
                    </button>
                  </li>
                ))}
                {browseQuery.data && browseQuery.data.dirs.length === 0 ? (
                  <li className="p-3 text-xs text-muted-foreground">Nessuna sottocartella.</li>
                ) : null}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button onClick={selectCurrent} disabled={!browseQuery.data}>
              Usa questa cartella
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
