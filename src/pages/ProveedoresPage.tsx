import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProveedores } from '@/hooks/useProveedores';
import { useProductos } from '@/hooks/useProductos';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { Loading } from '@/components/ui/loading';
import { UNIDADES } from '@/lib/compras';
import { Check, ChevronDown, Loader2, Package, Pencil, Plus, Store, ToggleLeft, ToggleRight, X } from 'lucide-react';
import type { CondicionPago, Proveedor } from '@/types';

interface FormProveedor {
  nombre: string;
  telefono: string;
  direccion: string;
  condicion_pago: CondicionPago;
  dias_credito: string;
}

const VACIO: FormProveedor = { nombre: '', telefono: '', direccion: '', condicion_pago: 'contado', dias_credito: '0' };

function aForm(p: Proveedor): FormProveedor {
  return {
    nombre: p.nombre,
    telefono: p.telefono ?? '',
    direccion: p.direccion ?? '',
    condicion_pago: p.condicion_pago,
    dias_credito: String(p.dias_credito),
  };
}

export function ProveedoresPage() {
  const { profile } = useAuth();
  const esGerencia = profile?.rol === 'owner';
  const { proveedores, loading, crearProveedor, actualizarProveedor } = useProveedores();
  const { productos, actualizarProducto } = useProductos();
  const { addToast } = useToast();

  const [form, setForm] = useState<FormProveedor>(VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<FormProveedor>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [filtroProducto, setFiltroProducto] = useState('');

  function aDatos(f: FormProveedor) {
    const credito = esGerencia && f.condicion_pago === 'credito';
    return {
      nombre: f.nombre.trim(),
      telefono: f.telefono.trim() || null,
      direccion: f.direccion.trim() || null,
      condicion_pago: (credito ? 'credito' : 'contado') as CondicionPago,
      dias_credito: credito ? Math.max(0, parseInt(f.dias_credito) || 0) : 0,
    };
  }

  async function handleCrear() {
    if (!form.nombre.trim()) return addToast('Escribe el nombre del proveedor', 'error');
    setGuardando(true);
    const { error } = await crearProveedor(aDatos(form));
    setGuardando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast('Proveedor registrado', 'success');
    setForm(VACIO);
  }

  async function handleGuardarEdicion(id: string) {
    if (!edicion.nombre.trim()) return addToast('El nombre no puede quedar vacío', 'error');
    const { error } = await actualizarProveedor(id, aDatos(edicion));
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast('Proveedor actualizado', 'success');
    setEditandoId(null);
  }

  async function handleToggle(p: Proveedor) {
    const { error } = await actualizarProveedor(p.id, { activo: !p.activo });
    if (error) addToast(`Error: ${error}`, 'error');
  }

  async function handleProducto(id: string, cambios: { unidad?: string; proveedor_id?: string | null }) {
    const { error } = await actualizarProducto(id, cambios);
    if (error) addToast(`Error: ${error}`, 'error');
  }

  // Compras no puede tocar proveedores a crédito (lo define Gerencia).
  const puedeEditar = (p: Proveedor) => esGerencia || p.condicion_pago === 'contado';
  const productosFiltrados = productos.filter(p => p.nombre.toLowerCase().includes(filtroProducto.trim().toLowerCase()));
  const nombreProveedor = (id: string | null) => proveedores.find(p => p.id === id)?.nombre;

  if (loading && proveedores.length === 0) return <Loading text="Cargando proveedores..." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-yayis-dark">Proveedores</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Plus size={18} /> Registrar proveedor</CardTitle>
          {!esGerencia && <p className="text-xs text-muted-foreground">Se registra al contado. Si trabaja a crédito, avisa a Gerencia para que lo configure.</p>}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Nombre *" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} aria-label="Nombre del proveedor" />
            <Input placeholder="Teléfono" inputMode="tel" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} aria-label="Teléfono" />
            <Input placeholder="Dónde queda (mercado, puesto...)" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} aria-label="Dirección" />
            {esGerencia && (
              <div className="flex gap-2">
                <Select value={form.condicion_pago} onChange={e => setForm({ ...form, condicion_pago: e.target.value as CondicionPago })} aria-label="Condición de pago">
                  <option value="contado">Al contado</option>
                  <option value="credito">A crédito</option>
                </Select>
                {form.condicion_pago === 'credito' && (
                  <Input type="number" min="0" className="w-24" value={form.dias_credito} onChange={e => setForm({ ...form, dias_credito: e.target.value })} aria-label="Días de crédito" title="Días de crédito" />
                )}
              </div>
            )}
          </div>
          <Button className="mt-3" size="sm" onClick={handleCrear} disabled={guardando}>
            {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
            Registrar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Store size={18} /> Lista de proveedores ({proveedores.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {proveedores.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Aún no hay proveedores registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 font-medium">Proveedor</th>
                    <th className="px-4 py-2 font-medium">Teléfono</th>
                    <th className="px-4 py-2 font-medium">Dónde queda</th>
                    <th className="px-4 py-2 font-medium">Pago</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map(p => editandoId === p.id ? (
                    <tr key={p.id} className="border-b bg-yayis-cream/40">
                      <td className="px-4 py-2"><Input className="h-8" value={edicion.nombre} onChange={e => setEdicion({ ...edicion, nombre: e.target.value })} aria-label="Nombre" /></td>
                      <td className="px-4 py-2"><Input className="h-8" value={edicion.telefono} onChange={e => setEdicion({ ...edicion, telefono: e.target.value })} aria-label="Teléfono" /></td>
                      <td className="px-4 py-2"><Input className="h-8" value={edicion.direccion} onChange={e => setEdicion({ ...edicion, direccion: e.target.value })} aria-label="Dónde queda" /></td>
                      <td className="px-4 py-2">
                        {esGerencia ? (
                          <div className="flex gap-1">
                            <Select className="h-8 text-xs" value={edicion.condicion_pago} onChange={e => setEdicion({ ...edicion, condicion_pago: e.target.value as CondicionPago })} aria-label="Condición">
                              <option value="contado">Contado</option>
                              <option value="credito">Crédito</option>
                            </Select>
                            {edicion.condicion_pago === 'credito' && (
                              <Input type="number" min="0" className="h-8 w-16" value={edicion.dias_credito} onChange={e => setEdicion({ ...edicion, dias_credito: e.target.value })} aria-label="Días de crédito" />
                            )}
                          </div>
                        ) : 'Contado'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => handleGuardarEdicion(p.id)} aria-label="Guardar"><Check size={16} className="text-emerald-600" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditandoId(null)} aria-label="Cancelar"><X size={16} className="text-red-500" /></Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} className={`border-b ${!p.activo ? 'text-muted-foreground' : ''}`}>
                      <td className={`px-4 py-2 font-medium ${!p.activo ? 'line-through' : ''}`}>{p.nombre}</td>
                      <td className="px-4 py-2">{p.telefono ? <a href={`tel:${p.telefono}`} className="hover:text-yayis-green">{p.telefono}</a> : '—'}</td>
                      <td className="px-4 py-2 text-xs">{p.direccion ?? '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.condicion_pago === 'credito' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                          {p.condicion_pago === 'credito' ? `Crédito ${p.dias_credito} días` : 'Contado'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        {puedeEditar(p) && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => { setEditandoId(p.id); setEdicion(aForm(p)); }} aria-label={`Editar ${p.nombre}`}><Pencil size={14} /></Button>
                            <button onClick={() => handleToggle(p)} title={p.activo ? 'Desactivar' : 'Activar'} aria-label={p.activo ? `Desactivar ${p.nombre}` : `Activar ${p.nombre}`} className="align-middle">
                              {p.activo ? <ToggleRight size={24} className="text-emerald-500" /> : <ToggleLeft size={24} className="text-gray-400" />}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Catalogo de productos: plegado por defecto */}
      <details className="group rounded-lg border bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4">
          <span className="flex items-center gap-2 text-base font-bold text-yayis-dark"><Package size={18} /> Catálogo de productos ({productos.length})</span>
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t p-4">
          <p className="text-xs text-muted-foreground">
            El catálogo se arma solo con lo que piden las sedes. Aquí puedes corregir la unidad y elegir el proveedor habitual de cada producto: así la ruta de compras ya sale agrupada.
          </p>
          <Input placeholder="Buscar producto..." value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} className="max-w-xs" aria-label="Buscar producto" />
          {productosFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay productos{filtroProducto ? ' con ese nombre' : ' todavía'}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Producto</th>
                    <th className="py-2 font-medium">Unidad</th>
                    <th className="py-2 font-medium">Proveedor habitual</th>
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.map(prod => (
                    <tr key={prod.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-2 font-medium">{prod.nombre}</td>
                      <td className="py-2 pr-2">
                        <Select className="h-8 w-28 text-xs" value={prod.unidad} onChange={e => handleProducto(prod.id, { unidad: e.target.value })} aria-label={`Unidad de ${prod.nombre}`}>
                          {!UNIDADES.includes(prod.unidad as typeof UNIDADES[number]) && <option value={prod.unidad}>{prod.unidad}</option>}
                          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </Select>
                      </td>
                      <td className="py-2">
                        <Select
                          className="h-8 w-56 text-xs"
                          value={prod.proveedor_id ?? ''}
                          onChange={e => handleProducto(prod.id, { proveedor_id: e.target.value || null })}
                          aria-label={`Proveedor habitual de ${prod.nombre}`}
                        >
                          <option value="">Sin asignar</option>
                          {proveedores.filter(p => p.activo || p.id === prod.proveedor_id).map(p => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                          ))}
                        </Select>
                        {prod.proveedor_id && !nombreProveedor(prod.proveedor_id) && <span className="ml-2 text-xs text-muted-foreground">(proveedor no disponible)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
