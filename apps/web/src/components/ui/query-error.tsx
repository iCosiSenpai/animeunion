import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertCircle } from 'lucide-react';

/** Stato d'errore coerente per una query fallita: messaggio + "Riprova". */
export function QueryError({
  onRetry,
  title = 'Impossibile caricare i dati',
  description = 'Controlla la connessione e riprova.',
}: {
  onRetry?: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={AlertCircle}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="outline" onClick={() => onRetry()}>
            Riprova
          </Button>
        ) : undefined
      }
    />
  );
}
