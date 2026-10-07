import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { usePresupuestoCaja } from '@/hooks/usePresupuestoCaja';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { BarraPresupuesto } from '@/components/presupuesto/BarraPresupuesto';
import { getTodayLima } from '@/lib/dates';
import { formatMonto, roundTwo } from '@/lib/utils';
import { estadoBarra, nombreCategoria, ordenarUso, SIN_CATEGORIA, SIN_EMPAREJAR, UMBRAL_OJO } from '@/lib/presupuesto';
import { ChevronLeft, ChevronRight, Gauge } from 'lucide-react';
import type { Sede } from '@/types';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

function PresupuestoSede({ sede, mes, responsable }: { sede: Sede; mes: string; responsable?: string | null }) {
  const { uso, hayTopes, loading, error } = usePresupuestoCaja(sede.id, mes);
  if (loading && uso.length === 0) return <Loading text={`Cargando ${sede.nombre}...`} />;

  const conTope = ordenarUso(uso.filter(u => u.tope !== null));
  const sinTope = ordenarUso(uso.filter(u => u.tope === null && u.gastado > 0));
  const tope = roundTwo(conTope.reduce((s, u) => s + (u.tope ?? 0), 0));
  const gastadoConTope = roundTwo(conTope.reduce((s, u) => s + u.gastado, 0));
  const pasadas = conTope.filter(u => estadoBarra(u.gastado, u.tope) === 'pasado').length;
  const enOjo = conTope.filter(u => estadoBarra(u.gastado, u.tope) === 'ojo').length;
  const enviado = conTope.find(u => u.enviadoEl)?.enviadoEl ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{sede.nombre}{responsable ? ` · ${responsable}` : ''}</CardTitle>
          {hayTopes && (
            <span className="text-sm tabular-nums text-yayis-dark">
              <strong>{formatMonto(gastadoConTope)}</strong> de {formatMonto(tope)}
            </span>
          )}
        </div>
        {hayTopes && (pasadas > 0 || enOjo > 0) && (
          <p className="text-xs">
            {pasadas > 0 && <span className="font-medium text-red-700">{pasadas} categoría{pasadas > 1 ? 's' : ''} pasada{pasadas > 1 ? 's' : ''} del tope. </span>}
            {enOjo > 0 && <span className="text-amber-800">{enOjo} desde {Math.round(UMBRAL_OJO * 100)}%.</span>}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-muted-foreground">El presupuesto todavía no está activado en esta app (falta correr su SQL en Supabase).</p>
        ) : !hayTopes ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Todavía no hay presupuesto aprobado para {nombreMes(mes)}. Cuando Gerencia lo apruebe en Cash Control, aquí aparecen los topes de cada categoría.
          </p>
        ) : (
          conTope.map(u => <BarraPresupuesto key={u.categoria} uso={u} />)
        )}

        {sinTope.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Gastado en categorías sin tope este mes</p>
            {sinTope.map(u => (
              <div key={u.categoria} className="flex justify-between text-sm">
                <span>
                  {u.categoria === SIN_EMPAREJAR ? 'Categorías sin emparejar con el presupuesto'
                    : u.categoria === SIN_CATEGORIA ? 'Compras sin categoría todavía'
                    : nombreCategoria(u.categoria)}
                </span>
                <span className="tabular-nums">{formatMonto(u.gastado)}</span>
              </div>
            ))}
          </div>
        )}
        {enviado && (
          <p className="text-xs text-muted-foreground">
            Topes aprobados en Cash Control el {new Date(enviado).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' })}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * «Mi presupuesto del mes»: una barra por categoría que se llena con los gastos del
 * administrador y las compras de Fabio. Gerencia ve las tres sedes.
 */
export function PresupuestoPage() {
  const { profile } = useAuth();
  const { sedeActiva, sedes, responsable } = useSedeActiva();
  const mesActual = getTodayLima().slice(0, 7);
  const [mes, setMes] = useState(mesActual);
  const esGerencia = profile?.rol === 'owner';
  const lista = esGerencia ? sedes : sedeActiva ? [sedeActiva] : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-yayis-dark"><Gauge size={22} /> {esGerencia ? 'Presupuesto por sede' : 'Mi presupuesto del mes'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada barra se llena con los gastos de la sede y lo que compra Compras. Verde: vas bien · Ámbar: desde {Math.round(UMBRAL_OJO * 100)}% · Rojo: te pasaste.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border bg-white p-1">
          <button type="button" onClick={() => setMes(mesMas(mes, -1))} className="rounded p-1.5 hover:bg-gray-100" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
          <span className="min-w-32 px-2 text-center text-sm font-medium capitalize">{nombreMes(mes)}</span>
          <button type="button" onClick={() => setMes(mesMas(mes, 1))} disabled={mes >= mesActual} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-30" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
        </div>
      </div>
      {lista.map(s => <PresupuestoSede key={s.id} sede={s} mes={mes} responsable={esGerencia ? null : responsable} />)}
    </div>
  );
}
