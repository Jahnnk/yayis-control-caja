import { Button } from '@/components/ui/button';

/** Botones de opción grandes, del mismo ancho, para elegir con el pulgar. */
export function Segmentado({ etiqueta, opciones, valor, onCambiar }: {
  etiqueta: string;
  opciones: { valor: string; texto: string; deshabilitado?: boolean }[];
  valor: string;
  onCambiar: (v: string) => void;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label={etiqueta}>
      {opciones.map(o => (
        <Button key={o.valor} type="button" variant={valor === o.valor ? 'default' : 'outline'} aria-pressed={valor === o.valor}
          disabled={o.deshabilitado} onClick={() => onCambiar(o.valor)} className="h-10 flex-1 px-2 text-sm">
          {o.texto}
        </Button>
      ))}
    </div>
  );
}
