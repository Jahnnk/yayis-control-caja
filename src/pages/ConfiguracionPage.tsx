import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useCategorias } from '@/hooks/useCategorias';
import { useFondos } from '@/hooks/useFondos';
import { useSedes } from '@/hooks/useSedes';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMonto } from '@/lib/utils';
import { DIAS_SEMANA } from '@/lib/dates';
import { Plus, Check, X, ToggleLeft, ToggleRight, MapPin, CalendarDays } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export function ConfiguracionPage() {
  const { profile } = useAuth();
  const { sedeId, sedeActiva, recargarSedes } = useSedeActiva();
  const { categorias, fetchCategorias, createCategoria, updateCategoria } = useCategorias();
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
      addToast('Categoria creada', 'success');
      setNewCat('');
    }
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
      addToast('Categoria actualizada', 'success');
      setEditingCat(null);
    }
  }

  async function handleToggleCategoria(id: string, activa: boolean) {
    const { error } = await updateCategoria(id, { activa: !activa });
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast(activa ? 'Categoria desactivada' : 'Categoria activada', 'success');
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
      <h1 className="text-2xl font-bold text-yayis-dark">Configuracion</h1>

      {/* Categorías */}
      <Card>
        <CardHeader>
          <CardTitle>Categorías de gasto{sedeActiva ? ` — ${sedeActiva.nombre}` : ''}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Nueva categoria..."
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
                    <div className="flex items-center gap-2">
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
      </Card>

      {/* Fondos */}
      <Card>
        <CardHeader>
          <CardTitle>Fondo de caja chica{sedeActiva ? ` — ${sedeActiva.nombre}` : ''}</CardTitle>
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
      </Card>

      {/* Sedes */}
      <Card>
        <CardHeader>
          <CardTitle>Sedes y días de compra</CardTitle>
          <p className="text-xs text-muted-foreground">Marca los días en que Compras sale a comprar para cada sede. Así las compras y los pagos no se juntan en un solo día. El <strong>monto semanal para compras</strong> es el dinero que el administrador maneja para Fabio cada semana.</p>
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
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Dinero semanal que el administrador maneja para las compras de Fabio">
                  Monto semanal para compras S/
                  <Input
                    key={`${s.id}-${s.monto_semanal_compras ?? ''}`}
                    type="number" inputMode="decimal" min="0" step="0.01" className="h-8 w-24"
                    defaultValue={s.monto_semanal_compras ?? ''}
                    onBlur={e => handleMontoSemanal(s.id, e.target.value, s.monto_semanal_compras ?? null)}
                    aria-label={`Monto semanal para compras de ${s.nombre}`}
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
      </Card>
    </div>
  );
}
