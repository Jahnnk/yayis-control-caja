export type Rol = 'owner' | 'admin' | 'viewer';
export type MetodoPago = 'efectivo' | 'cuentas';
export type EstadoGasto = 'pagado' | 'pendiente';

export interface Sede {
  id: string;
  nombre: string;
  activa: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  sede_id: string | null;
  activo: boolean;
  created_at: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  sede_id: string;
  activa: boolean;
  orden: number;
  created_at: string;
}

export interface Gasto {
  id: string;
  numero_registro: number;
  fecha: string;
  descripcion: string;
  categoria_id: string;
  metodo_pago: MetodoPago;
  monto: number;
  estado: EstadoGasto;
  notas: string | null;
  semana: number;
  mes: string;
  sede_id: string;
  registrado_por: string;
  created_at: string;
  updated_at: string;
}

export interface GastoConCategoria extends Gasto {
  categorias: { nombre: string } | null;
  profiles: { nombre: string } | null;
}

export interface ConfiguracionFondos {
  id: string;
  sede_id: string;
  fondo_efectivo: number;
  fondo_cuentas: number;
  vigente_desde: string;
  created_at: string;
}

export interface ArqueoSemanal {
  id: string;
  sede_id: string;
  semana: number;
  mes: string;
  anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  fondo_inicial_efectivo: number;
  fondo_inicial_cuentas: number;
  total_gastado_efectivo: number;
  total_gastado_cuentas: number;
  ventas_efectivo_pos: number;
  efectivo_entregado_luis: number;
  monto_reponer_efectivo: number;
  monto_reponer_cuentas: number;
  diferencia_caja: number;
  cerrado: boolean;
  cerrado_por: string | null;
  cerrado_at: string | null;
  created_at: string;
}

export interface GastoFormData {
  fecha: string;
  descripcion: string;
  categoria_id: string;
  metodo_pago: MetodoPago;
  monto: string;
  estado: EstadoGasto;
  notas: string;
}

export interface ResumenSemanalData {
  totalGastado: number;
  totalPagado: number;
  totalPendiente: number;
  disponibleEfectivo: number;
  disponibleCuentas: number;
  gastosPorCategoria: {
    categoria: string;
    efectivo: number;
    cuentas: number;
    total: number;
    porcentaje: number;
  }[];
  pendientesPorCategoria: {
    categoria: string;
    efectivo: number;
    cuentas: number;
    total: number;
  }[];
}
