import { Select } from '@/components/ui/select-native';
import { UNIDADES, UNIDAD_SOLES, esUnidadValida } from '@/lib/compras';

/**
 * La unidad SIEMPRE se elige de la lista única (nunca se escribe). Si un dato viejo trae otra unidad,
 * se muestra como «Elige…» para que la persona escoja la real.
 * `delProducto`: la unidad del producto en el catálogo. Un producto «por soles» solo se pide en soles y uno
 * «por cantidad» nunca en soles. Sin producto (nuevo) o con `libre` (Gerencia), se puede elegir cualquiera.
 */
export function SelectorUnidad({ value, onChange, className, id, ariaLabel, onKeyDown, delProducto, libre }: {
  value: string;
  onChange: (unidad: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLSelectElement>;
  delProducto?: string | null;
  libre?: boolean;
}) {
  const valida = esUnidadValida(value);
  const conocido = !libre && esUnidadValida(delProducto) ? delProducto : null;
  const verCantidad = conocido === null || conocido !== UNIDAD_SOLES;
  const verSoles = conocido === null || conocido === UNIDAD_SOLES;
  return (
    <Select id={id} value={valida ? value : ''} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
      className={`${className ?? ''} ${valida ? '' : 'border-amber-500 text-amber-800'}`} aria-label={ariaLabel}>
      {!valida && <option value="" disabled>{value ? `Elige (era «${value}»)` : 'Elige la unidad'}</option>}
      {valida && (value === UNIDAD_SOLES ? !verSoles : !verCantidad) && <option value={value}>{value}</option>}
      {verCantidad && UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
      {verSoles && <option value={UNIDAD_SOLES}>soles (por monto)</option>}
    </Select>
  );
}
