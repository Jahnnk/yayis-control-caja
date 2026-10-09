/** Una cifra con su etiqueta y una nota corta (tarjetas de «cómo vas»). */
export function Dato({ etiqueta, valor, nota, alerta }: { etiqueta: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${alerta ? 'text-red-600' : 'text-yayis-dark'}`}>{valor}</p>
      {nota && <p className="text-[11px] leading-tight text-muted-foreground">{nota}</p>}
    </div>
  );
}
