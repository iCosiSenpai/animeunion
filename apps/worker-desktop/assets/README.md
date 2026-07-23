# Asset dell'app

Icone (segnaposto professionali, versionate — `build/` è gitignorato, quindi gli asset stanno qui):

- `icon.png` (256x256) — `directories.buildResources: assets` in `electron-builder.yml`: viene
  rilevata e convertita nell'`.ico` di installer/exe (Windows).
- `tray.png` (32x32) — icona del tray a runtime (imbarcata come extraResource in `resources/`).

Generate da `scripts/gen-icons.mjs` (logo gradiente + triangolo play, nessuna dipendenza). Per
rigenerarle o dopo aver cambiato il logo: `node scripts/gen-icons.mjs`. Sostituiscile pure con il
branding definitivo mantenendo gli stessi nomi/dimensioni.
