export type Rol = 'owner' | 'admin' | 'compras' | 'viewer';
export type MetodoPago = 'efectivo' | 'cuentas';
export type EstadoGasto = 'pagado' | 'pendiente';

export interface Sede {
  id: string;
  nombre: string;
  activa: boolean;
  /** Dias de compra programados (0 = domingo ... 6 = sabado). Vacio si aun no se configuro. */
  dias_compra?: number[] | null;
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
  reposicion_id: string | null;
  constancia_path: string | null;
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

export interface Reposicion {
  id: string;
  sede_id: string;
  fecha: string;
  metodo_pago: MetodoPago;
  monto: number;
  notas: string | null;
  registrado_por: string;
  created_at: string;
}

export type TipoValorRevisado = 'duplicado' | 'mismo_monto';

export interface ValorRevisado {
  id: string;
  sede_id: string;
  tipo: TipoValorRevisado;
  gasto_ids: string[];
  monto_unitario: number;
  descripcion_preview: string | null;
  verificado_por: string;
  verificado_en: string;
  notas: string | null;
}

export interface ValorRevisadoConPerfil extends ValorRevisado {
  profiles: { nombre: string } | null;
}

export type DesgloseCategoria = {
  categoriaId: string;
  categoriaNombre: string;
  monto: number;
  porcentaje: number; // 0-100 con 2 decimales
};

export interface SaldoReposicion {
  deudaEfectivo: number;
  deudaCuentas: number;
  repuestoEfectivo: number;
  repuestoCuentas: number;
  saldoEfectivo: number;
  saldoCuentas: number;
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

// ===== Compras (Fase 2) =====
export type CondicionPago = 'contado' | 'credito';

export interface Proveedor {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  condicion_pago: CondicionPago;
  dias_credito: number;
  notas: string | null;
  activo: boolean;
  created_at: string;
}

export interface Producto {
  id: string;
  nombre: string;
  unidad: string;
  /** Proveedor habitual: a quien se le suele comprar. */
  proveedor_id: string | null;
  activo: boolean;
  created_at: string;
}

export type EstadoPedido = 'borrador' | 'enviado' | 'comprado' | 'recibido' | 'cancelado';
export type EstadoItemPedido = 'pendiente' | 'comprado' | 'no_habia';

export interface Pedido {
  id: string;
  sede_id: string;
  fecha_compra: string;
  urgente: boolean;
  motivo_urgente: string | null;
  estado: EstadoPedido;
  notas: string | null;
  creado_por: string;
  enviado_at: string | null;
  comprado_at: string | null;
  recibido_at: string | null;
  recibido_por: string | null;
  observacion_recepcion: string | null;
  created_at: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  unidad: string;
  nota: string | null;
  proveedor_id: string | null;
  estado: EstadoItemPedido;
  created_at: string;
}

export interface PedidoItemDetalle extends PedidoItem {
  productos: { nombre: string } | null;
  proveedores: { nombre: string } | null;
}

export interface PedidoConItems extends Pedido {
  pedido_items: PedidoItemDetalle[];
}
