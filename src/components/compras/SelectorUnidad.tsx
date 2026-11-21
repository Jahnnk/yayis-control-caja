import { Select } from '@/components/ui/select-native';
import { UNIDADES, esUnidadValida } from '@/lib/compras';

/**
 * La unidad SIEMPRE se elige de la lista única (nunca se escribe). Si un dato viejo trae otra unidad
 * (por ejemplo «sol»), se muestra como «Elige la unidad» para que la persona escoja la real.
 */
export function SelectorUnidad({ value, onChange, className, id, ariaLabel, onKeyDown }: {
  value: string;
  onChange: (unidad: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLSelectElement>;
}) {
  const valida = esUnidadValida(value);
  return (
    <Select id={id} value={valida ? value : ''} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
      className={`${className ?? ''} ${valida ? '' : 'border-amber-500 text-amber-800'}`} aria-label={ariaLabel}>
      {!valida && <option value="" disabled>{value ? `Elige (era «${value}»)` : 'Elige la unidad'}</option>}
      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
    </Select>
  );
}
