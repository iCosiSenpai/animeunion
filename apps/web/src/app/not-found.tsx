import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-2xl font-semibold">404 &mdash; Pagina non trovata</h2>
      <p className="text-muted-foreground">La pagina che cerchi non esiste.</p>
      <Button asChild>
        <Link href="/catalog">Torna al catalogo</Link>
      </Button>
    </div>
  );
}
