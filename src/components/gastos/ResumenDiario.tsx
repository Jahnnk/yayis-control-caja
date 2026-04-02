import { useEffect, useState } from 'react';
import { useGastos } from '@/hooks/useGastos';
import { formatMonto } from '@/lib/utils';
import { getTodayLima } from '@/lib/dates';
import { Wallet, CreditCard, DollarSign } from 'lucide-react';

export function ResumenDiario() {
  const { fetchResumenDiario } = useGastos();
  const [resumen, setResumen] = useState({ efectivo: 0, cuentas: 0, total: 0 });

  useEffect(() => {
    loadResumen();
  }, []);

  async function loadResumen() {
    const r = await fetchResumenDiario(getTodayLima());
    setResumen(r);
  }

  // Expose reload so parent can call it
  (window as unknown as Record<string, unknown>).__reloadResumenDiario = loadResumen;

  return (
    <div className="flex flex-wrap gap-4 mb-6">
      <div className="flex items-center gap-2 bg-white rounded-lg border px-4 py-2 shadow-sm">
        <Wallet size={16} className="text-yayis-accent" />
        <span className="text-xs text-muted-foreground">Efectivo hoy:</span>
        <span className="text-sm font-bold text-yayis-dark">{formatMonto(resumen.efectivo)}</span>
      </div>
      <div className="flex items-center gap-2 bg-white rounded-lg border px-4 py-2 shadow-sm">
        <CreditCard size={16} className="text-yayis-accent" />
        <span className="text-xs text-muted-foreground">Cuentas hoy:</span>
        <span className="text-sm font-bold text-yayis-dark">{formatMonto(resumen.cuentas)}</span>
      </div>
      <div className="flex items-center gap-2 bg-white rounded-lg border px-4 py-2 shadow-sm">
        <DollarSign size={16} className="text-yayis-accent" />
        <span className="text-xs text-muted-foreground">Total hoy:</span>
        <span className="text-sm font-bold text-yayis-green">{formatMonto(resumen.total)}</span>
      </div>
    </div>
  );
}
