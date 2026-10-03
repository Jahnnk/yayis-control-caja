import { formatMonto } from '@/lib/utils';
import { fechaCorta } from '@/lib/compras';
import { formatPorcentaje, precioUnitario, variacionPrecio, type PrecioHabitual } from '@/lib/precios';
import { baseDePrecio } from '@/lib/precio-linea';
import { TrendingDown, TrendingUp } from 'lucide-react';

/** Debajo de cada producto al registrar una compra: precio habitual y, al escribir el precio, si subió o bajó. */
export function AvisoPrecio({ habitual, cantidad, precio, unidad }: {
  habitual: PrecioHabitual | undefined;
  cantidad: string;
  precio: string;
  unidad: string;
}) {
  // Gramos y ml se muestran por kg / por litro (igual que al escribir el precio).
  const { factor, etiqueta } = baseDePrecio(unidad);
  const cant = parseFloat(cantidad);
  const total = parseFloat(precio);
  const unitario = precio.trim() === '' ? null : precioUnitario(total, cant);

  if (!habitual) {
    return unitario !== null
      ? <p className="w-full text-xs text-muted-foreground">Primera compra de este producto en {unidad}: {formatMonto(unitario * factor)} por {etiqueta} será su precio de referencia.</p>
      : null;
  }

  const referencia = `habitual ${formatMonto(habitual.unitario * factor)} por ${etiqueta}`;
  if (unitario === null) {
    return (
      <p className="w-full text-xs text-muted-foreground">
        Precio habitual: <strong>{formatMonto(habitual.unitario * factor)} por {etiqueta}</strong> · última compra a {habitual.ultimoProveedor}, {fechaCorta(habitual.ultimaFecha)}
      </p>
    );
  }

  const v = variacionPrecio(unitario, habitual.unitario, cant);
  if (!v || v.tipo === 'normal') {
    return <p className="w-full text-xs text-muted-foreground">Precio normal: {formatMonto(unitario * factor)} por {etiqueta} ({referencia}).</p>;
  }
  if (v.tipo === 'sube') {
    return (
      <p className="flex w-full items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
        <TrendingUp size={14} className="shrink-0" />
        <span><strong>{formatPorcentaje(v.porcentaje)} más caro</strong>: {formatMonto(unitario * factor)} por {etiqueta} ({referencia}) · {formatMonto(v.diferencia)} de más. Revisa el precio o anota el motivo en la observación.</span>
      </p>
    );
  }
  return (
    <p className="flex w-full items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
      <TrendingDown size={14} className="shrink-0" />
      <span><strong>{formatPorcentaje(v.porcentaje)} más barato</strong>: {formatMonto(unitario * factor)} por {etiqueta} ({referencia}) · ahorro de {formatMonto(-v.diferencia)}.</span>
    </p>
  );
}
