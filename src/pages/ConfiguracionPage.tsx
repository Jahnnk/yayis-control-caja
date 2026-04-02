import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCategorias } from '@/hooks/useCategorias';
import { useFondos } from '@/hooks/useFondos';
import { useSedes } from '@/hooks/useSedes';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMonto } from '@/lib/utils';
import { Plus, Check, X, ToggleLeft, ToggleRight, MapPin } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export function ConfiguracionPage() {
  const { profile } = useAuth();
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
  }, []);

  useEffect(() => {
    if (fondos) {
      setFondoEfectivo(String(fondos.fondo_efectivo));
      setFondoCuentas(String(fondos.fondo_cuentas));
    }
  }, [fondos]);

  if (profile?.rol !== 'owner') return <Navigate to="/gastos" replace />;

  async function handleAddCategoria() {
    if (!newCat.trim() || !profile?.sede_id) return;
    const { error } = await createCategoria(newCat, profile.sede_id);
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Categoria creada', 'success');
      setNewCat('');
    }
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
    if (!profile?.sede_id || !fondoVigente) {
      addToast('Selecciona la fecha desde cuando aplican los nuevos fondos', 'error');
      return;
    }
    const { error } = await updateFondos(
      profile.sede_id,
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
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-yayis-dark">Configuracion</h1>

      {/* Categorías */}
      <Card>
        <CardHeader>
          <CardTitle>Gestion de Categorias</CardTitle>
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
          <CardTitle>Configuracion de Fondos</CardTitle>
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
          <CardTitle>Gestion de Sedes</CardTitle>
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
            {sedes.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2">
                <span className={`text-sm ${!s.activa ? 'text-muted-foreground line-through' : ''}`}>
                  {s.nombre}
                </span>
                <button onClick={() => updateSede(s.id, { activa: !s.activa })}>
                  {s.activa ? (
                    <ToggleRight size={24} className="text-emerald-500" />
                  ) : (
                    <ToggleLeft size={24} className="text-gray-400" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
