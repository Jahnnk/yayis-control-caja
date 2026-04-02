import { Loader2 } from 'lucide-react';

export function Loading({ text = 'Cargando...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-yayis-accent mr-2" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}
