import { MissingView } from '@/components/library/missing-view';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ChevronLeft, FolderTree } from 'lucide-react';
import Link from 'next/link';

export default function LibraryMissingPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Libreria"
        title="Episodi mancanti"
        description="Serie per serie, gli episodi segnati come scaricati ma non più presenti su disco. Correggi la classificazione se serve, poi ri-scaricali."
        actions={
          <>
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/library/files">
                <FolderTree className="h-4 w-4" />
                Gestore file
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/library">
                <ChevronLeft className="h-4 w-4" />
                Libreria
              </Link>
            </Button>
          </>
        }
      />
      <MissingView />
    </div>
  );
}
