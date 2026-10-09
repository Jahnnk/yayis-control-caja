import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useCategorias } from '@/hooks/useCategorias';
import { CATEGORIAS_PRESUPUESTO, nombreCategoria } from '@/lib/presupuesto';
import { useFondos } from '@/hooks/useFondos';
import { useSedes } from '@/hooks/useSedes';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Desplegable } from '@/components/ui/desplegable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { formatMonto } from '@/lib/utils';
import type { TipoGasto } from '@/types';
import { DIAS_SEMANA } from '@/lib/dates';
import { Plus, Check, X, ToggleLeft, ToggleRight, MapPin, CalendarDays } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export function ConfiguracionPage() {
  const { profile } = useAuth();
  const { sedeId, sedeActiva, recargarSedes } = useSedeActiva();
  const { categorias, fetchCategorias, createCategoria, updateCategoria, updateTipoGasto, updateCategoriaPresupuesto } = useCategorias();
  const { fondos, updateFondos, fetchHistorial, historialFondos } = useFondos();
  const { sedes, createSede, updateSede } = useSedes();
  const { addToast } = useToast();

  const [newCat, setNewCat] = useState('');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');

  const [fondoEfectivo, setFondoEfectivo] = useState('');
  const [fondoCuentas, setFondoCuentas] = useState('');
  const [fondoVigente, setFondoVigente] = useState('');

  const [newSede, setNewSede] = useState('');

  useEffect(() => {
    fetchCategorias(false);
    fetchHistorial();
  }, [fetchCategorias, fetchHistorial]);

  useEffect(() => {
    setFondoEfectivo(fondos ? String(fondos.fondo_efectivo) : '');
    setFondoCuentas(fondos ? String(fondos.fondo_cuentas) : '');
  }, [fondos]);

  if (profile?.rol !== 'owner') return <Navigate to="/gastos" replace />;

  async function handleAddCategoria() {
    if (!newCat.trim() || !sedeId) return;
    const { error } = await createCategoria(newCat, sedeId);
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Categoría creada', 'success');
      setNewCat('');
    }
  }

  async function handleTopeSinBoleta(id: string, valor: string, actual: number) {
    const nuevo = parseFloat(valor);
    if (Number.isNaN(nuevo) || nuevo < 0) return addToast('Escribe un monto válido', 'error');
    if (nuevo === actual) return;
    const { error } = await updateSede(id, { tope_sin_comprobante: nuevo });
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast('Tope guardado', 'success');
  }

  async function handleMontoSemanal(id: string, valor: string, actual: number | null) {
    const nuevo = valor.trim() === '' ? null : parseFloat(valor);
    if (nuevo !== null && (Number.isNaN(nuevo) || nuevo < 0)) return addToast('Escribe un monto válido', 'error');
    if (nuevo === actual) return;
    const { error } = await updateSede(id, { monto_semanal_compras: nuevo });
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast('Monto semanal guardado', 'success');
  }

  async function handleSaveCategoria(id: string) {
    if (!editCatName.trim()) return;
    const { error } = await updateCategoria(id, { nombre: editCatName.trim() });
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Categoría actualizada', 'success');
      setEditingCat(null);
    }
  }

  async function handleTipoGasto(nombre: string, valor: string) {
    const { error } = await updateTipoGasto(nombre, valor === '' ? null : valor as TipoGasto);
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast(`«${nombre}» quedó como ${valor === '' ? 'por definir' : `gasto ${valor}`} en las 3 sedes`, 'success');
  }

  async function handleCategoriaPresupuesto(nombre: string, valor: string) {
    const { error } = await updateCategoriaPresupuesto(nombre, valor || null);
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast(valor ? `«${nombre}» cuenta para «${nombreCategoria(valor)}» del presupuesto en las 3 sedes` : `«${nombre}» quedó sin emparejar: no consume ningún tope`, 'success');
  }

  async function handleToggleCategoria(id: string, activa: boolean) {
    const { error } = await updateCategoria(id, { activa: !activa });
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast(activa ? 'Categoría desactivada' : 'Categoría activada', 'success');
  }

  async function handleSaveFondos() {
    if (!sedeId || !fondoVigente) {
      addToast('Selecciona la fecha desde cuando aplican los nuevos fondos', 'error');
      return;
    }
    const { error } = await updateFondos(
      sedeId,
      parseFloat(fondoEfectivo) || 0,
      parseFloat(fondoCuentas) || 0,
      fondoVigente,
    );
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Fondos actualizados', 'success');
      setFondoVigente('');
      fetchHistorial();
    }
  }

  async function handleAddSede() {
    if (!newSede.trim()) return;
    const { error } = await createSede(newSede);
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Sede creada', 'success');
      setNewSede('');
      recargarSedes();
    }
  }

  async function handleToggleSede(id: string, activa: boolean) {
    const { error } = await updateSede(id, { activa: !activa });
    if (error) addToast(`Error: ${error}`, 'error');
    else recargarSedes();
  }

  async function handleToggleDiaCompra(id: string, diasActuales: number[], dia: number) {
    const dias = diasActuales.includes(dia)
      ? diasActuales.filter(d => d !== dia)
      : [...diasActuales, dia].sort((a, b) => a - b);
    const { error } = await updateSede(id, { dias_compra: dias });
    if (error) addToast(`Error: ${error}`, 'error');
    else recargarSedes();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-yayis-dark">Configuración</h1>
        <p className="text-sm text-muted-foreground">Se usa pocas veces: cada sección está plegada con su resumen. Tócala para cambiarla.</p>
      </div>

      {/* Categorías */}
      <Desplegable titulo={`Categorías de gasto${sedeActiva ? ` — ${sedeActiva.nombre}` : ''}`} resumen={<span>{categorias.filter(c => c.activa).length} activas{categorias.some(c => c.activa && !c.tipo_gasto) ? ` · ${categorias.filter(c => c.activa && !c.tipo_gasto).length} sin fijo/variable` : ''}{categorias.some(c => c.activa && !c.categoria_presupuesto) ? ` · ${categorias.filter(c => c.activa && !c.categoria_presupuesto).length} sin presupuesto` : ''}</span>}>
      <div className="[&>*]:border-0 [&>*]:shadow-none [&_.p-6]:px-0"><Card>
        <CardHeader>

          <p className="text-xs text-muted-foreground">El tipo (gasto fijo o variable) se usa en el Excel de gastos por categoría y se aplica igual en las 3 sedes.</p>
          <p className="text-xs text-muted-foreground">«En el presupuesto» dice a qué barra del presupuesto suma cada gasto (la lista única de Cash Control). Sin emparejar, el gasto se ve pero no consume ningún tope.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Nueva categoría..."
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategoria()}
            />
            <Button onClick={handleAddCategoria} size="sm">
              <Plus size={16} className="mr-1" /> Agregar
            </Button>
          </div>

          <div className="divide-y">
            {categorias.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2">
                {editingCat === c.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editCatName}
                      onChange={e => setEditCatName(e.target.value)}
                      className="max-w-xs"
                      onKeyDown={e => e.key === 'Enter' && handleSaveCategoria(c.id)}
                    />
                    <Button size="icon" variant="ghost" onClick={() => handleSaveCategoria(c.id)}>
                      <Check size={16} className="text-emerald-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingCat(null)}>
                      <X size={16} className="text-red-500" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className={`text-sm ${!c.activa ? 'text-muted-foreground line-through' : ''}`}>
                      {c.nombre}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Select
                        value={c.categoria_presupuesto ?? ''}
                        onChange={e => handleCategoriaPresupuesto(c.nombre, e.target.value)}
                        className={`h-8 w-44 text-xs ${c.categoria_presupuesto ? '' : 'border-amber-400 text-amber-800'}`}
                        aria-label={`Categoría del presupuesto de ${c.nombre}`}
                        title="En el presupuesto"
                      >
                        <option value="">Sin emparejar</option>
                        {CATEGORIAS_PRESUPUESTO.map(cp => <option key={cp} value={cp}>{nombreCategoria(cp)}</option>)}
                      </Select>
                      <Select
                        value={c.tipo_gasto ?? ''}
                        onChange={e => handleTipoGasto(c.nombre, e.target.value)}
                        className={`h-8 w-32 text-xs ${c.tipo_gasto ? '' : 'border-amber-400 text-amber-800'}`}
                        aria-label={`Tipo de gasto de ${c.nombre}`}
                      >
                        <option value="">Por definir</option>
                        <option value="fijo">Gasto fijo</option>
                        <option value="variable">Gasto variable</option>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditingCat(c.id); setEditCatName(c.nombre); }}
                      >
                        Editar
                      </Button>
                      <button onClick={() => handleToggleCategoria(c.id, c.activa)} title={c.activa ? 'Desactivar' : 'Activar'}>
                        {c.activa ? (
                          <ToggleRight size={24} className="text-emerald-500" />
                        ) : (
                          <ToggleLeft size={24} className="text-gray-400" />
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card></div>
      </Desplegable>

      {/* Fondos */}
      <Desplegable titulo={`Fondo de caja chica${sedeActiva ? ` — ${sedeActiva.nombre}` : ''}`} resumen={<span>{fondos ? `Efectivo ${formatMonto(Number(fondos.fondo_efectivo))} · cuentas ${formatMonto(Number(fondos.fondo_cuentas))}` : 'Sin configurar'}</span>}>
      <div className="[&>*]:border-0 [&>*]:shadow-none [&_.p-6]:px-0"><Card>
        <CardHeader>

          <p className="text-xs text-muted-foreground">Para cambiar de sede, usa el selector de arriba.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Fondo Efectivo (S/)</label>
              <Input
                type="number"
                step="0.01"
                value={fondoEfectivo}
                onChange={e => setFondoEfectivo(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Fondo Cuentas (S/)</label>
              <Input
                type="number"
                step="0.01"
                value={fondoCuentas}
                onChange={e => setFondoCuentas(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Vigente desde</label>
              <Input
                type="date"
                value={fondoVigente}
                onChange={e => setFondoVigente(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <Button onClick={handleSaveFondos}>Guardar Fondos</Button>

          {historialFondos.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Historial de Fondos</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">Vigente desde</th>
                    <th className="text-right py-1">Efectivo</th>
                    <th className="text-right py-1">Cuentas</th>
                  </tr>
                </thead>
                <tbody>
                  {historialFondos.map(f => (
                    <tr key={f.id} className="border-b">
                      <td className="py-1">{f.vigente_desde}</td>
                      <td className="text-right py-1">{formatMonto(Number(f.fondo_efectivo))}</td>
                      <td className="text-right py-1">{formatMonto(Number(f.fondo_cuentas))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card></div>
      </Desplegable>

      {/* Sedes */}
      <Desplegable titulo="Sedes, días de compra y montos" resumen={<span>{sedes.filter(x => x.activa).map(x => `${x.nombre} ${DIAS_SEMANA.filter(d => (x.dias_compra ?? []).includes(d.valor)).map(d => d.corto).join('/') || 'sin días'}`).join(' · ')}</span>}>
      <div className="[&>*]:border-0 [&>*]:shadow-none [&_.p-6]:px-0"><Card>
        <CardHeader>

          <p className="text-xs text-muted-foreground">Marca los días en que Compras sale a comprar para cada sede. Así las compras y los pagos no se juntan en un solo día. El <strong>monto semanal para compras</strong> es el dinero que el administrador maneja para Compras cada semana. El <strong>tope sin boleta</strong> es lo máximo que Compras puede comprar en efectivo, por compra, cuando no le dan boleta.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Nueva sede..."
              value={newSede}
              onChange={e => setNewSede(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddSede()}
            />
            <Button onClick={handleAddSede} size="sm">
              <MapPin size={16} className="mr-1" /> Agregar
            </Button>
          </div>
          <div className="divide-y">
            {sedes.map(s => {
              const dias = s.dias_compra ?? [];
              return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className={`text-sm font-medium min-w-[6rem] ${!s.activa ? 'text-muted-foreground line-through' : ''}`}>
                  {s.nombre}
                </span>
                <div className="flex items-center gap-1" role="group" aria-label={`Días de compra de ${s.nombre}`}>
                  <CalendarDays size={15} className="text-muted-foreground mr-1" />
                  {DIAS_SEMANA.map(d => {
                    const activo = dias.includes(d.valor);
                    return (
                      <button
                        key={d.valor}
                        type="button"
                        onClick={() => handleToggleDiaCompra(s.id, dias, d.valor)}
                        aria-pressed={activo}
                        title={`Compra los ${d.largo}`}
                        className={`w-10 rounded-md border px-1 py-1 text-xs font-medium transition-colors ${activo ? 'border-yayis-green bg-yayis-green text-white' : 'border-gray-200 text-muted-foreground hover:bg-gray-50'}`}
                      >
                        {d.corto}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Dinero semanal que el administrador maneja para las compras (Compras)">
                  Monto semanal para compras S/
                  <Input
                    key={`${s.id}-${s.monto_semanal_compras ?? ''}`}
                    type="number" inputMode="decimal" min="0" step="0.01" className="h-8 w-24"
                    defaultValue={s.monto_semanal_compras ?? ''}
                    onBlur={e => handleMontoSemanal(s.id, e.target.value, s.monto_semanal_compras ?? null)}
                    aria-label={`Monto semanal para compras de ${s.nombre}`}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Hasta cuánto puede comprar Compras en efectivo sin boleta, por compra, en esta sede">
                  Tope sin boleta S/
                  <Input
                    key={`tope-${s.id}-${s.tope_sin_comprobante ?? ''}`}
                    type="number" inputMode="decimal" min="0" step="1" className="h-8 w-20"
                    defaultValue={s.tope_sin_comprobante ?? 50}
                    onBlur={e => handleTopeSinBoleta(s.id, e.target.value, Number(s.tope_sin_comprobante ?? 50))}
                    aria-label={`Tope sin boleta de ${s.nombre}`}
                  />
                </label>
                <button onClick={() => handleToggleSede(s.id, s.activa)} title={s.activa ? 'Desactivar sede' : 'Activar sede'}>
                  {s.activa ? (
                    <ToggleRight size={24} className="text-emerald-500" />
                  ) : (
                    <ToggleLeft size={24} className="text-gray-400" />
                  )}
                </button>
              </div>
              );
            })}
          </div>
        </CardContent>
      </Card></div>
      </Desplegable>
    </div>
  );
}
