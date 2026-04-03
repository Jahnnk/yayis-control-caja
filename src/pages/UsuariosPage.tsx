import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUsuarios } from '@/hooks/useUsuarios';
import { useSedes } from '@/hooks/useSedes';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { Loading } from '@/components/ui/loading';
import { Navigate } from 'react-router-dom';
import { UserPlus, ToggleLeft, ToggleRight, Loader2, Pencil, X, Check } from 'lucide-react';
import type { Rol, Profile } from '@/types';

export function UsuariosPage() {
  const { profile } = useAuth();
  const { usuarios, loading, fetchUsuarios, createUsuario, updateUsuario } = useUsuarios();
  const { sedes } = useSedes();
  const { addToast } = useToast();

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('admin');
  const [sedeId, setSedeId] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editRol, setEditRol] = useState<Rol>('admin');
  const [editSedeId, setEditSedeId] = useState('');

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  useEffect(() => {
    if (sedes.length > 0 && !sedeId) {
      setSedeId(sedes[0]!.id);
    }
  }, [sedes]);

  if (profile?.rol !== 'owner') return <Navigate to="/gastos" replace />;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!email || !password || !nombre || !sedeId) {
      addToast('Completa todos los campos', 'error');
      return;
    }
    setSaving(true);
    const { error } = await createUsuario(email, password, nombre, rol, sedeId);
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Usuario creado exitosamente', 'success');
      setEmail('');
      setPassword('');
      setNombre('');
      setRol('admin');
      setShowForm(false);
      fetchUsuarios();
    }
    setSaving(false);
  }

  function startEdit(u: Profile) {
    setEditingId(u.id);
    setEditNombre(u.nombre);
    setEditRol(u.rol);
    setEditSedeId(u.sede_id ?? '');
  }

  async function saveEdit() {
    if (!editingId || !editNombre.trim()) return;
    const { error } = await updateUsuario(editingId, {
      nombre: editNombre.trim(),
      rol: editRol,
      sede_id: editSedeId,
    });
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Usuario actualizado', 'success');
      setEditingId(null);
    }
  }

  async function handleToggleActivo(id: string, activo: boolean) {
    const { error } = await updateUsuario(id, { activo: !activo });
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast(activo ? 'Usuario desactivado' : 'Usuario activado', 'success');
  }

  if (loading) return <Loading />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yayis-dark">Gestion de Usuarios</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          <UserPlus size={16} className="mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Crear Usuario</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Nombre</label>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Contrasena</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Rol</label>
                <Select value={rol} onChange={e => setRol(e.target.value as Rol)} className="mt-1">
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                  <option value="owner">Owner</option>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Sede</label>
                <Select value={sedeId} onChange={e => setSedeId(e.target.value)} className="mt-1">
                  {sedes.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear Usuario
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Rol</th>
                  <th className="text-left px-4 py-3 font-medium">Sede</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => {
                  const isEditing = editingId === u.id;
                  const isSelf = u.id === profile?.id;
                  const sedeName = sedes.find(s => s.id === u.sede_id)?.nombre ?? '-';

                  return (
                    <tr key={u.id} className="border-b">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Input
                            value={editNombre}
                            onChange={e => setEditNombre(e.target.value)}
                            className="h-8 text-sm w-40"
                          />
                        ) : (
                          <span className="font-medium">{u.nombre}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Select
                            value={editRol}
                            onChange={e => setEditRol(e.target.value as Rol)}
                            className="w-28 h-8 text-xs"
                          >
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
                            <option value="owner">Owner</option>
                          </Select>
                        ) : (
                          <span className={`capitalize font-medium ${isSelf ? 'text-yayis-green' : ''}`}>{u.rol}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Select
                            value={editSedeId}
                            onChange={e => setEditSedeId(e.target.value)}
                            className="w-32 h-8 text-xs"
                          >
                            {sedes.map(s => (
                              <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{sedeName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {isEditing ? (
                            <>
                              <Button size="icon" variant="ghost" onClick={saveEdit} title="Guardar">
                                <Check size={16} className="text-emerald-500" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} title="Cancelar">
                                <X size={16} className="text-red-500" />
                              </Button>
                            </>
                          ) : (
                            <>
                              {!isSelf && (
                                <Button size="icon" variant="ghost" onClick={() => startEdit(u)} title="Editar">
                                  <Pencil size={14} />
                                </Button>
                              )}
                              {!isSelf && (
                                <button onClick={() => handleToggleActivo(u.id, u.activo)} title={u.activo ? 'Desactivar' : 'Activar'}>
                                  {u.activo ? (
                                    <ToggleRight size={24} className="text-emerald-500" />
                                  ) : (
                                    <ToggleLeft size={24} className="text-gray-400" />
                                  )}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
