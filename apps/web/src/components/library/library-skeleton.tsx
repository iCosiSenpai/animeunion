import { Skeleton } from '@/components/ui/skeleton';

export function LibrarySkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={String(index)} className="flex gap-4 rounded-lg border p-4">
          <Skeleton className="aspect-[2/3] h-32 w-24 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
