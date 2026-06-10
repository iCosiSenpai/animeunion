import { Construction } from 'lucide-react';

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Construction className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">Questa sezione e in arrivo.</p>
    </div>
  );
}
