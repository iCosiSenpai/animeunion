// Marchi ufficiali (colori brand) per i link esterni della scheda anime.
// MyAnimeList: riquadro blu con "MAL" (come la favicon ufficiale).
// AniList: logomark ufficiale (path simple-icons) in blu AniList.

export function MalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="MyAnimeList">
      <rect width="24" height="24" rx="4" fill="#2E51A2" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="8.5"
        fill="#ffffff"
      >
        MAL
      </text>
    </svg>
  );
}

export function AniListIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="AniList">
      <path
        fill="#02A9FF"
        d="M6.361 2.943 0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H22.9c.71 0 1.1-.392 1.1-1.101V17.53c0-.71-.39-1.101-1.1-1.101h-6.483V3.91c0-.71-.392-1.101-1.101-1.101h-2.422c-.71 0-1.101.392-1.101 1.101v1.064l-.667-2.03h-4.04zm2.151 4.485 1.61 4.82H6.9l1.611-4.82z"
      />
    </svg>
  );
}
