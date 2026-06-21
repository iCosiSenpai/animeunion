import { FileManager } from '@/components/library/file-manager';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function LibraryFilesPage() {
  return (
    <div className="space-y-2">
      <PageHeader
        eyebrow="Libreria"
        title="Gestore file"
        description="Sfoglia, rinomina, sposta (trascina) ed elimina i file scaricati, o collega un file orfano a un episodio."
        actions={
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/library">
              <ChevronLeft className="h-4 w-4" />
              Libreria
            </Link>
          </Button>
        }
      />
      <FileManager />
    </div>
  );
}
