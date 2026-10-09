# AGENTS.md — Yayi's Control de Caja

> Documento de contexto para cualquier agente de IA (Codex, Claude, etc.) que continúe este proyecto.
> Léelo completo antes de tocar nada. Última actualización: 29 de septiembre de 2026 (seguimiento de precios).

---

## 1. Sobre el dueño (cómo trabajar con él)

- El dueño es **Jahnn Karlo**, dueño de **Yayi's**, una cadena de panaderías en Cajamarca, Perú.
- **NO es programador.** Explícale todo en **español**, simple, sin jerga técnica. Si usas un término técnico, aclára­lo entre paréntesis.
- **Antes de cambios importantes** (varios archivos, base de datos, o producción), explícale en 1-2 oraciones qué vas a hacer y por qué. Para ediciones pequeñas/obvias no hace falta pedir permiso.
- **Cuando encuentres un error, explícale qué significa en palabras simples** además del error técnico. Ej: "Error de autenticación" → "la app no puede verificar tu usuario porque falta la clave secreta".
- **No añadas features ni refactors que no pidió.** Si ves algo que mejorar, pregúntale antes.
- **Cuando algo afecte dinero real** (deuda con proveedores/socios, saldos), sé extra riguroso: primero explícale el impacto, verifica los datos, y no des números por hechos sin comprobarlos.
- Moneda: **Soles peruanos (S/)**. UI, labels y mensajes de error hacia el usuario: **en español**.

---

## 2. Qué es este proyecto

**Yayi's Control de Caja** es una app web para registrar y controlar los **gastos de caja chica** de las 3 sedes de la panadería. El flujo del negocio:

- Cada sede tiene un **administrador** que maneja su caja chica y **paga los gastos** del día a día:
  **Luis → Atelier**, **Sol → Fonavi**, **Chari → Centro**.
- Cada admin tiene un **fondo de caja chica** (ej. S/ 800). Paga gastos de ahí.
- **Gerencia de Finanzas (Kelly)** — y Jahnn como dueño — les repone lo gastado para que su caja vuelva al fondo.
- La app registra los **gastos** y las **reposiciones** por sede, y calcula cuánto falta reponer.
- **Fabio (Compras)** se incorpora en la Fase 2: hace las compras programadas a proveedores para las 3 sedes (ver sección 8).

**Está en producción, funcionando, usado a diario.** Cualquier cambio va a la app real que Jahnn y su equipo usan.

---

## 3. Stack técnico

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS** (colores de marca: `yayis-green` #098B5F, `yayis-dark` #004C40, `yayis-accent`, `yayis-cream`)
- **Supabase** (Postgres + Auth + RLS) como backend — cliente en `src/lib/supabase.ts`
- **lucide-react** para iconos, **recharts** para gráficos
- **Deploy en Vercel** (auto-despliega al hacer push a `main`)
- **GitHub**: repo `Jahnnk/yayis-control-caja`. Se trabaja en ramas + Pull Request hacia `main`.
- Cálculos financieros: helper `roundTwo` en `src/lib/utils.ts` (redondeo a 2 decimales). Formato de moneda: `formatMonto` (mismo archivo).

### Variables de entorno (`.env`, NO está en el repo)
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Solo existe la clave **pública** (anon). **No hay service_role key.** Por eso un agente **no puede** modificar la base de datos por su cuenta (RLS exige que el usuario esté logueado). Los cambios de datos los hace Jahnn desde la app (logueado) o desde el SQL Editor de Supabase.

---

## 4. Cómo correr y desplegar

```bash
npm install          # instalar dependencias
npm run build        # tsc -b && vite build — SIEMPRE correr esto antes de pushear
npm run dev          # servidor de desarrollo (necesita .env con credenciales)
```

- **Nota de entorno del dueño:** su caché de npm (`~/.npm`) tiene permisos rotos de una instalación vieja con sudo. Si `npm install` falla con `EACCES`, usar una caché temporal: `npm install --cache /tmp/npm-cache-yayis`. No usar sudo.
- **Reglas de despliegue (IMPORTANTE, vigente desde ago-2026):**
  1. Correr `npm run build` **completo** (no solo `tsc --noEmit`) y que pase sin errores.
  2. Trabajar en una rama, abrir un **Pull Request** y **el agente hace el merge él mismo** (`gh pr merge <n> --merge`). Jahnn pidió explícitamente no pedirle que mergee.
  3. Las **migraciones SQL** (carpeta `supabase/`) las ejecuta Jahnn en el SQL Editor de Supabase (no hay credenciales de base de datos en el `.env`). Darle el archivo exacto y qué debe ver al final.
  4. Seguir pidiendo confirmación antes de cualquier cambio de datos de producción que no venga de una migración del propio PR.
  5. Mensajes de commit descriptivos, en español.
- **Supabase está en plan gratuito**: el proyecto se **pausa solo** tras ~7 días sin uso (pasó en jul y sep-2026). Síntoma: nadie puede entrar y la app muestra "No se pudo verificar tu sesión". Arreglo: supabase.com → proyecto → botón "Resume project" (en español sale mal traducido como "Proyecto de currículum"). Con 5+ usuarios diarios ya no debería pasar.
- **Crear usuarios**: el plan gratuito limita los correos de confirmación ("email rate limit exceeded"). Desactivar "Confirm email" en Authentication → Providers → Email antes de crear varios usuarios.
- `npm audit`: hay 2 vulnerabilidades moderadas en dependencias transitivas de `exceljs` (export a Excel). No tienen fix no-breaking a jul-2026; riesgo bajo. No romper el build por eso.

---

## 5. Estructura del código

```
src/
├── App.tsx                  # rutas (react-router). ResumenPage carga con lazy()
├── main.tsx                 # entry, envuelto en <ErrorBoundary>
├── contexts/
│   ├── AuthContext.tsx       # login, perfil del usuario
│   └── SedeActivaContext.tsx # ★ sede con la que se trabaja (ver sección 6)
├── lib/
│   ├── supabase.ts          # cliente Supabase
│   ├── utils.ts             # formatMonto, roundTwo, cn
│   ├── dates.ts             # getTodayLima, calcularSemana, getMesLabel, semanas del mes, DIAS_SEMANA
│   ├── roles.ts             # nombres de roles en español (ROL_LABEL) y roles asignables
│   └── exportGastos.ts      # export a Excel (exceljs) y PDF (jspdf) — carga dinámica
├── types/index.ts           # todos los tipos (Gasto, Reposicion, SaldoReposicion, etc.)
├── hooks/                   # un hook por entidad (useGastos, useReposiciones, useArqueo...)
├── components/
│   ├── gastos/              # GastoForm, GastosTable, ResumenDiario
│   ├── layout/              # AppLayout, Header, Sidebar
│   ├── ui/                  # button, card, input, select, toast, confirm-dialog, loading
│   └── ErrorBoundary.tsx
└── pages/
    ├── LoginPage.tsx
    ├── RegistroGastosPage.tsx   # donde Luis/equipo registran gastos
    ├── ResumenPage.tsx          # ★ PÁGINA PRINCIPAL (~1500 líneas): KPIs, gráficos,
    │                            #   desglose por categoría, valores a revisar,
    │                            #   histórico, arqueo semanal, y Reposiciones a Luis
    ├── ConfiguracionPage.tsx
    ├── UsuariosPage.tsx
    ├── PedidosPage.tsx          # admins arman la lista del día de compra (o urgente) y la envían
    ├── RutaComprasPage.tsx      # Compras: lo del día agrupado por proveedor, marca comprado/no había
    ├── ProveedoresPage.tsx      # proveedores: Gerencia, Compras y administradores los registran al contado (el crédito solo lo define Gerencia); el catálogo de productos solo lo ven Gerencia y Compras
    ├── RendicionPage.tsx        # Compras: su dinero entregado, compras cargadas, rendir con vuelto
    ├── RecepcionPage.tsx        # Admin: entregar dinero, cerrar rendiciones, confirmar mercadería recibida
    ├── DeliverysPage.tsx        # Fabio: registra deliverys y ve su efectivo por entregar. Admin/Gerencia: reciben el efectivo y ven el resumen de la sede
    └── FinanzasPage.tsx         # ★ Gerencia (entra aquí): alertas, cuentas por pagar a crédito, dinero en Compras, deliverys

Pantallas protegidas por rol con `<SoloRoles>` (`components/layout/SoloRoles.tsx`); `/inicio` manda a cada rol a su pantalla.

supabase/                    # scripts SQL de referencia (esquema, seed, tablas)
```

Roles de usuario (en pantalla se muestran en español):
- `owner` = **Gerencia** (Jahnn, Kelly): ve y maneja todas las sedes, repone cajas, administra usuarios.
- `admin` = **Administrador de sede** (Luis, Sol, Chari): registra gastos y ve solo su sede.
- `compras` = **Compras** (Fabio): sin sede (trabaja para las 3). Ve Ruta de compras y Proveedores; no ve cajas ni gastos. Arranca en `/ruta`.
- `viewer` = **Solo lectura**.
La seguridad (RLS) filtra por `sede_id`: admin/viewer solo su sede; owner todas.

---

## 6. Modelo de datos y conceptos de negocio (LEER CON CUIDADO)

### Tablas principales
- **`gastos`**: cada gasto que paga Luis. Campos clave: `fecha`, `descripcion`, `categoria_id`, `metodo_pago` (`'efectivo'` | `'cuentas'`), `monto`, `estado` (`'pendiente'` | `'pagado'`), `semana`, `mes`, `sede_id`, `reposicion_id` (FK a la reposición que lo pagó, o null).
- **`reposiciones`**: cada vez que Jahnn le repone dinero a Luis. Campos: `fecha`, `metodo_pago`, `monto`, `notas`, `sede_id`.
- Otras: `sedes`, `profiles`, `categorias`, `arqueos_semanales`, `configuracion_fondos` (el fondo de caja de Luis), `valores_revisados`.

### Concepto clave: la "sede activa" (desde la Fase 1)
- Todas las pantallas trabajan con **una sede a la vez**: la que da `useSedeActiva()` (`src/contexts/SedeActivaContext.tsx`).
- **Gerencia** la elige en el selector de arriba (se recuerda en el navegador). **Admins** quedan fijos en su propia sede.
- Nunca usar `profile.sede_id` para filtrar o guardar datos: usar `sedeId` de `useSedeActiva()`. Si una función de un hook usa `sedeId`, debe estar en sus dependencias de `useCallback` (si no, al cambiar de sede seguiría usando la anterior — p. ej. una reposición caería en la caja equivocada).
- `responsable` = nombre del admin de la sede activa; los textos dicen "Caja de Sol", "Reposiciones a Chari", etc.
- `sedes.dias_compra` (`SMALLINT[]`, 0=domingo…6=sábado): calendario de compras por sede, editable en Configuración.
- Historia: la sede original se llamaba "Fonavi" pero sus datos eran de Atelier (Luis). La migración `fase1_multisede.sql` la renombró a **Atelier** y creó **Fonavi** y **Centro** nuevas.

### Concepto clave: qué es la "deuda con Luis"
- **`estado='pendiente'`** = gasto que Luis pagó y Jahnn **aún NO le ha repuesto**.
- **`estado='pagado'`** = gasto que Jahnn **ya le repuso** a Luis.
- **La deuda con Luis = suma de gastos con `estado='pendiente'`** (por método de pago). Es lo que muestra "Reponer Efectivo/Cuentas".
- Cuando Jahnn registra una reposición, la lógica marca gastos pendientes como `pagado` hasta cubrir el monto (ver abajo).

### Lógica crítica: `marcarGastosPagados` (en `src/hooks/useReposiciones.ts`)
Al crear una reposición, marca gastos pendientes del método como `pagado`, **del más antiguo al más nuevo (FIFO)**, tomando gastos completos que quepan en el monto. **NO exige que el monto calce exacto** (pago progresivo). **Un gasto nunca se paga a medias**, así que puede quedar un pequeño resto de la reposición sin aplicar si ningún gasto restante cabe. También guarda el `reposicion_id` en cada gasto marcado.

Borrar una reposición (`deleteReposicion`) **revierte** sus gastos a `pendiente` (y limpia `reposicion_id`), para no descuadrar el saldo.

### El "modelo de dinero neto" NO se usa (decisión tomada)
Se evaluó calcular la deuda como `total_gastos − total_reposiciones` (dinero neto). **Se descartó** porque los datos históricos tienen ruido (backfill con gastos duplicados/mal cargados y reposiciones huérfanas) que inflaba ese cálculo (~S/1,000 falso). El modelo vigente es **"deuda = gastos pendientes"**. Ver sección 8.

### Regla de oro para cuadrar la caja de Luis
Para saber cuánto reponer y dejar la caja en su fondo (ej. 800), **la fuente de verdad es el conteo físico de Luis**, NO el sistema: se le pregunta a Luis cuánto tiene ahora en la cuenta y se repone `fondo − lo que tiene`. El sistema es una guía, pero el conteo real manda.

---

## 7. Qué se hizo en las sesiones recientes (jul-2026)

En orden (ver `git log`):
1. `reposicion_id` en gastos + backfill histórico (51 gastos vinculados, 204 quedaron huérfanos — aceptado).
2. Guardar `reposicion_id` al marcar gastos pagados.
3. Desglose por categoría de la última reposición en el Resumen.
4. Export a **Excel y PDF** de gastos pendientes por categoría (`exportGastos.ts`).
5. `fix`: "Valores a Revisar" (detección de duplicados/montos iguales) solo compara gastos **pendientes** (antes marcaba pares donde uno ya estaba pagado).
6. `refactor` (revisión técnica): borrar reposición revierte gastos a pendiente; confirmación antes de borrar; lectura de gastos por bloques de 1000 (límite Supabase); `ErrorBoundary`; `ResumenPage` con carga diferida (`lazy`); se eliminaron páginas muertas (`ResumenSemanalPage`, `ResumenMensualPage`); `npm audit fix`.
7. `fix`: el "Desglose Pendiente por Reponer" muestra la deuda **total** con Luis (todos los meses, global), para que cuadre con "Reponer". El KPI "Total Pendiente" sí es del mes filtrado (aclarado en la UI).
8. `fix`: pago progresivo FIFO en reposiciones (descrito arriba).
9. **Episodio deuda con Luis**: se detectó que la deuda mostrada no cuadraba con la percepción de Jahnn. Se investigó a fondo (herramientas temporales de validación/auditoría/conciliación, todas ya **retiradas**). Conclusión: Luis hizo el **cuadre físico de su caja** y confirmó la deuda real (S/83.50, ya pagada). Se aplicó un ajuste puntual (botón temporal, ya retirado) que saldó todo lo anterior al 8-jul-2026 y dejó pendiente solo lo del día. **Deuda quedó cuadrada.**

14. **Seguimiento de precios (29-sep-2026)**: reglas en `src/lib/precios.ts`. *Precio habitual* de un producto = el precio por unidad típico (mediana) de sus últimas 3 compras, en la misma unidad, de cualquier sede o proveedor. Una compra ±15% sobre/bajo el habitual se avisa (±30% = fuerte). Se ve (a) en *Registrar compra* debajo de cada producto (`AvisoPrecio` + hook `usePreciosHabituales`): el habitual antes de escribir y, al escribir, rojo "más caro" o verde "más barato / ahorro"; y (b) en el Panel de Finanzas, sección plegada *Cambios de precio · últimos 30 días* con lo pagado de más y lo ahorrado. La alerta "Precio alto" de *Para revisar* usa la misma regla. No requiere migración. (c) En *Proveedores → Catálogo de productos*: columnas *Precio habitual* y *Mejor proveedor (90 días)* = el proveedor cuyo **último** precio en 90 días es el más bajo (hook `useHistorialPrecios`, `ofertasPorProveedor`); en verde si es más barato que el habitual y con el % frente al proveedor habitual. El panel lee hasta 1000 líneas de compra de los últimos 180 días (las más nuevas primero).
13. **Fase 3 panel de Finanzas (29-sep-2026)**: pantalla de inicio de Gerencia con las 3 sedes: números clave, **alertas** (`src/lib/alertas.ts`, umbrales a la vista: factura vencida, rendición descuadrada, dinero sin rendir ≥2 días, rendición sin cerrar ≥1 día, mercadería sin confirmar ≥1 día, urgentes de la semana, **precio +15% / +30%** sobre el precio habitual del producto — ver punto 14), **cuentas por pagar a crédito** agrupadas por día de vencimiento con *Registrar pago* (constancia obligatoria, columna `referencia_pago`), compras del mes por sede y pagos recientes. Trigger `proteger_compra` actualizado: solo Gerencia marca pagada una factura a crédito y, ya pagada, solo Gerencia la modifica. Migración: `supabase/fase3_finanzas.sql`.
12. **Fase 2B dinero, evidencias y recepción (29-sep-2026)**: tablas `entregas` (abierta → rendida → cerrada), `compras` (una por proveedor y sede) y `compra_items` (con precio). Flujo: el admin entrega dinero a Compras → Compras registra cada compra desde la Ruta con fotos → rinde informando su vuelto → el admin revisa, elige la categoría de gasto de cada compra y confirma el vuelto recibido → la función `cerrar_entrega` convierte, **en un solo paso**, cada compra al contado en un **gasto pendiente** de la sede (con la foto como constancia, método = el de la entrega) para que Gerencia lo reponga. Las compras a crédito NO son gastos de caja: quedan `por_pagar` con vencimiento (las paga Finanzas; su panel es la Fase 3). **Reglas de evidencia (en la base, no solo en pantalla)**: con boleta/factura → foto del comprobante (+ captura si pagó por Yape/transferencia); **sin boleta → foto del producto + captura del Yape, y solo se permite pagando por Yape/transferencia**. Triggers: Compras solo puede informar el vuelto de una entrega (no su monto); una compra solo se carga a una entrega abierta de la misma sede; rendida la entrega, sus compras quedan congeladas. Fotos en el bucket `constancias-gastos`, carpeta `<sede>/<usuario>/compras/`. Migración: `supabase/fase2b_compras.sql`.
11. **Fase 2A pedidos y ruta (29-sep-2026)**: tablas `proveedores`, `productos` (catálogo único que se arma solo al pedir; proveedor habitual), `pedidos` (una lista regular por sede y día + urgentes con motivo; estados borrador → enviado → comprado → recibido | cancelado) y `pedido_items` (pendiente / comprado / no_habia). Un pedido pasa solo a "comprado" cuando no le quedan líneas pendientes. Funciones de seguridad `puede_ver_sede` y `puede_pedir_en_sede`. Migración: `supabase/fase2a_pedidos.sql`. Todavía NO se registran montos ni evidencias (eso es la 2B).
10. **Fase 1 multi-sede (29-sep-2026)**: selector de sede para Gerencia, todo filtrado por sede activa, textos con el nombre del admin real, calendario de días de compra, roles en español, rol `compras` en la base, sedes Atelier/Fonavi/Centro, constancias permitidas a Gerencia en cualquier sede. Migración: `supabase/fase1_multisede.sql`.

---

## 8. Estado actual y pendientes (backlog)

### Plan del módulo de Compras (decisiones de Jahnn, 29-sep-2026)
Flujo: **Admin arma pedido → Compras (Fabio) compra → Admin confirma recepción → Finanzas (Kelly) revisa y repone.**
- **Calendario**: Atelier lunes/jueves, Fonavi lunes/miércoles, Centro martes/viernes (para no juntar compras ni pagos en un día).
- **Urgencias**: se permite pedir fuera del día programado marcándolo "urgente"; queda como alerta para Finanzas.
- **Productos urgentes dentro de una lista (2-oct-2026)**: el administrador marca líneas puntuales como ⚡ urgentes (columna Urgente en Pedidos de compra, `pedido_items.urgente`, `supabase/urgente_por_producto.sql`), también en listas ya enviadas. La ruta de Fabio los muestra arriba en una tarjeta roja, con etiqueta en cada línea, y los ordena primero dentro de cada proveedor. No genera alerta a Finanzas (es prioridad dentro del día de compra, no un pedido fuera de calendario).
- **Caja semanal de compras (acuerdo de Gerencia, 2-oct-2026)**: Kelly le da a cada administrador un monto semanal para las compras de Fabio (primer acuerdo: Atelier S/ 800, Fonavi S/ 500, Centro S/ 500; editable en Configuración → `sedes.monto_semanal_compras`). Es aparte de la caja chica de gastos chicos del administrador. Desde el **lunes 5-oct-2026 los montos son Atelier S/ 1,000, Fonavi S/ 500, Centro S/ 500** y cada administrador **reparte a Fabio según necesidad** (puede entregarle todo de una vez o por partes): en «Entregar dinero a Compras» (por defecto «Cuentas», por Yape/Plin) se muestra el monto semanal, lo ya entregado esta semana (lunes a domingo, sin contar el saldo que continúa) y lo que le queda por entregar. Fabio rinde **una vez por semana** (la alerta «dinero sin rendir» salta a los 8 días, `DIAS_PARA_RENDIR`). Lo que sobra puede **pasar a la semana siguiente**: al cerrar, el administrador marca «Fabio se queda con S/ X» y la función `cerrar_entrega_con_saldo` (`supabase/caja_semanal_compras.sql`) cierra la rendición, guarda `entregas.saldo_continua` y abre una entrega nueva con ese saldo; ese saldo NO cuenta como faltante (`diferenciaDeCierre` en `src/lib/compras.ts`). Cada administrador rinde a Kelly con el flujo de reposición de siempre.
- **Gastos pagados con el monto semanal (6-oct-2026, pedido de Sol/Fonavi; corregido 7-oct):** el administrador marca «Lo pagué con el monto semanal» (`gastos.con_monto_semanal`) en los gastos que paga él y no Fabio. La casilla **solo resta del saldo semanal**; el gasto queda **pendiente y se repone igual** que cualquier gasto y que lo de Fabio (decisión de Jahnn: todo gasto se repone; la primera versión lo marcaba «pagado» y era un error). Saldo = monto semanal − entregado a Fabio − pagado directamente, de lunes a hoy (`useSaldoSemanal`, franja `SaldoMontoSemanal` en Registro de Gastos y en Entregas y recepción). `supabase/gastos_con_monto_semanal.sql` creó la columna y `supabase/gastos_monto_semanal_se_repone.sql` quitó la regla de «pagado».
- **Estado «Entregado» por producto y precio pagado (6-oct-2026):** en Pedidos de compra el administrador marca cada producto comprado como «Entregado» cuando llegó a su sede y lo verificó (`pedido_items.entregado_at` / `entregado_por`, `supabase/pedido_item_entregado.sql`). No cambia el estado de compra (pendiente/comprado/no había). La base hace cumplir: solo administrador/Gerencia (no Compras) y solo productos ya comprados; cuando todo lo comprado de una lista está entregado la lista pasa sola a `recibido` (igual que «Recibido conforme» en Entregas y recepción, que ahora también marca sus productos como entregados); desmarcar reabre la lista a `comprado`. Las listas `comprado` se muestran en `PedidoPorRecibir`; las `enviado` (compra parcial) muestran el botón en la columna Estado. La columna **Precio** muestra lo pagado de cada línea comprada (`compra_items.precio_total` ligado por `pedido_item_id`, hook `usePreciosPagados`; por kg/L si se pidió en g/ml) y el estimado (≈) de las pendientes.
- **Recojo sin pago y total repartido (6-oct-2026, pedido de Fabio):** (1) Productos ya pagados que Fabio solo recoge: botón «Sin costo» en cada línea (precio 0). Si todo vale S/ 0 se guarda un **recojo sin pago**: compra de total 0, `contado`, sin entrega, sin forma de pago, sin boleta ni fotos (`compras.total >= 0` y las restricciones `compras_contado_completo` / `compras_evidencia_obligatoria` aceptan `total = 0`; `supabase/recojo_y_total_repartido.sql`). Las compras con dinero siguen con las mismas reglas. (2) Cuando el vendedor solo da el total: casilla «Solo me dieron el total de la compra»; Fabio escribe el total y `repartirTotal` (`src/lib/reparto-total.ts`) lo reparte en proporción al precio habitual de cada producto (sin precio conocido: partes iguales; los centavos cuadran exacto). Esas líneas se marcan `compra_items.precio_repartido` y **no entran** al seguimiento de precios, a los precios habituales ni a las alertas de precio (`usePreciosHabituales`, `useHistorialPrecios` y `useFinanzas` filtran `precio_repartido = false` y `precio_total > 0`). Los recojos no cuentan en «Sin comprobante» de Finanzas.
- **Precios ya escritos + cuadre con el total (6-oct-2026, pedido de Fabio: listas largas, productos que se repiten):** al abrir «Registrar compra», cada producto sin precio se rellena con lo **último que se le pagó a ESE proveedor** (`useUltimosPreciosProveedor`; no cuenta lo repartido ni los S/ 0) y queda marcado «Sugerido» (`EstadoLinea.sugerido`, se guarda en el borrador). Fabio corrige solo lo que cambió (al tocar un precio deja de ser sugerido) y, mientras quede algún precio sugerido, debe escribir **cuánto pagó en total**: tiene que coincidir con la suma (tolerancia S/ 0.10) o no deja guardar y le dice que algún precio cambió (puede usar «Solo me dieron el total»). Sin SQL. Se rellena una sola vez por línea.
- **Yape sin boleta, varias capturas y cantidades compradas (7-oct-2026, pedido de Fabio):** (1) Compra **sin boleta por Yape**: la captura del pago sigue obligatoria y la observación (dónde y a quién) también; la **foto del producto es opcional hasta el tope sin boleta de la sede** y obligatoria por encima (`fotosExigidas(c, { total, tope })`; la base ya no la exige en el CHECK, solo `evidencia_pendiente`). (2) **Varias capturas de pago**: la primera va en `evidencia_pago_path` y hasta 4 más en `compras.evidencias_pago_extra` (se pagó a varios puestos); el borrador las guarda en IndexedDB (`RANURAS_PAGO_EXTRA`). (3) **Cantidad comprada ≠ pedida**: la línea del pedido conserva lo pedido, pero Pedidos de compra y la Ruta «Por sede» muestran lo que realmente llegó y, debajo, «se pidieron N» (`CantidadCelda`, de `compra_items`). SQL: `supabase/evidencia_yape_multiple.sql` (también quita la pendiente de las compras sin boleta por Yape dentro del tope).
- **Precio de referencia (7-oct-2026, pedido de Jahnn):** el administrador puede escribir en cada producto de su lista un **precio de referencia** opcional (`pedido_items.precio_referencia`, `supabase/precio_referencia.sql`; S/ por kg / litro / unidad, por kg si la línea es en g, igual que el campo «Precio por…» de la compra). Fabio lo ve en su ruta («Ref. S/ X por kg») y al registrar la compra el precio de la línea sale ya escrito con la referencia (antes que el último precio del proveedor) como «Sugerido»; si lo cambia, `AvisoPrecio` muestra el **% sobre/bajo la referencia**. En Pedidos de compra, cada producto comprado muestra lo pagado y su variación frente a la referencia (`PrecioPagadoCelda`), y el estimado de la lista/presupuesto usa la referencia antes que el precio habitual (`estimarLineasPedido`).
- **Gastos por origen y consolidado para reposición (8-oct-2026):** cada gasto tiene `gastos.origen` = `administrador` (lo registró el administrador) o `compras` (nació al cerrar la rendición de Fabio: `cerrar_entrega` crea el gasto «Compra a …» y un disparador sobre `compras.gasto_id` lo marca; `supabase/gastos_origen.sql`, que también marcó los ya existentes). Registro de Gastos tiene el **Consolidado para reposición** (`ConsolidadoReposicion`, hook `useConsolidadoReposicion`): lo pendiente de reponer separado entre lo pagado por el administrador, las compras de Fabio y el total, con efectivo/cuentas; el mismo consolidado se ve en Resumen para Gerencia. La lista se filtra con «Todos / Pagados por el administrador / Compras de Fabio» y las compras de Fabio llevan la etiqueta «Compra de Fabio». Ojo: las compras de Fabio **solo aparecen como gastos cuando el administrador cierra la rendición**; antes se ven en Entregas y recepción / Mi dinero y rendición.
- **La Ruta de Fabio también muestra las listas ya «recibidas» (8-oct-2026):** al marcar todo como entregado (o «Recibido conforme») la lista pasa a `recibido`, y antes la Ruta de esa fecha dejaba de mostrarla («Atelier todavía no hizo su lista»). Ahora una fecha pasada muestra sus listas `comprado` y `recibido` («Compra terminada y recibida por la sede»).
- **«Recibidas esta semana» (8-oct-2026):** en Pedidos de compra, las listas en estado `recibido` de los últimos 7 días (por `recibido_at`) se muestran en una sección propia, una línea cada una (fecha, estado, productos entregados, total pagado) con el detalle plegado (`PedidoRecibidoResumen`), arriba de «Pedidos anteriores». Pasados los 7 días van al historial. Pedido de Jahnn tras la confusión de Luis, que no encontraba su lista recibida.
- **Compras de Fabio sin rendir en el consolidado (8-oct-2026):** el Consolidado para reposición avisa, aparte y sin sumar al total, las compras al contado de Fabio ya hechas con dinero entregado pero cuya rendición no se cierra (`compras` con `entrega_id` y sin `gasto_id`; `useConsolidadoReposicion.sinRendir`). Entran al total cuando el administrador cierra la rendición.
- **Compras repartidas en varios días: «Volver a pedir» y resto de una compra parcial (8-oct-2026):** (1) Si Fabio compra **menos de lo pedido** (pidieron 6, compró 4), al guardar la compra la función `dividir_linea_pedido` (SECURITY DEFINER, `supabase/volver_a_pedir_y_resto.sql`) deja la línea original con lo comprado y crea otra con lo que falta, «pendiente» (la compra otro día; aparece como «Atrasado» en su ruta) o «no había», según lo que Fabio elija en la línea («Lo compro otro día» por defecto). (2) El administrador ve **«Volver a pedir»** en cada producto que no había: lo agrega a su próxima lista en preparación (o crea la del próximo día de compra libre) y queda marcado `pedido_items.repedido_at` («✓ Vuelto a pedir») para no pedirlo dos veces. Un producto que ya está pendiente en esa lista no se duplica.
- **Nombre del puesto, no de la persona (8-oct-2026, pedido de Jahnn):** en pantallas y reportes se dice «Compras» (el puesto), nunca «Fabio» (quien hoy lo ocupa): «Entregado a Compras», «Compras» en el consolidado y en el filtro de Registro de Gastos, etc. Los mensajes de WhatsApp en el chat sí pueden nombrar a Fabio. **Registro de Gastos → pestaña «Compras»** muestra también la lista «Compras por rendir» (compras ya hechas con dinero entregado que todavía no son gasto, `useConsolidadoReposicion.sinRendir.compras`). **Entregas y recepción** numera las entregas del mismo día («Entrega 1 de 2»), muestra su forma (Efectivo / Yape-Plin) y hora, y un total cuando hay varias abiertas (cada entrega lleva su propia cuenta: Compras elige de cuál sale cada compra).
- **Recorrido de las compras en Registro de Gastos (8-oct-2026):** la pestaña «Compras» muestra en un recuadro las compras de Compras en sus tres pasos: *por rendir* (entrega abierta), *rendidas, falta cerrar* (entrega rendida) y *cerradas este mes* (ya son gasto y salen en la lista de abajo). Datos de `useConsolidadoReposicion` (`sinRendir.compras` con `estado` y `sinRendir.cerradas`).
- **Recorrido del dinero de la semana (8-oct-2026, pedido de Jahnn):** en Registro de Gastos la franja del saldo se reemplazó por `RecorridoDinero`: barra y desglose del monto semanal → pagado por el administrador (marcado), otros gastos suyos de la semana **sin marcar** (con la lista para editarlos), entregado a Compras, lo que Compras **ya registró** (compras cargadas a las entregas de la semana) y lo que **falta justificar** (entregado − registrado: se justifica registrando compras o devolviendo vuelto), más lo que queda o cuánto se pasó. Aquí «te queda» cuenta todos los gastos propios de la semana (marcados o no); la franja de Entregas y recepción sigue contando solo los marcados. Datos de `useSaldoSemanal`.
- **«Pagado por ti» incluye lo marcado que sigue pendiente (8-oct-2026):** `useSaldoSemanal` suma los gastos con `con_monto_semanal` de esta semana **y** los de días anteriores que siguen `pendiente` (no repuestos): ese dinero aún es parte de lo que el administrador maneja. Caso real: dos gastos del vie 2-oct (S/ 46) marcados no entraban a la semana que empieza el lun 5.
- **«Se pagó junto con otra compra» (8-oct-2026, pedido de Fabio):** a veces un solo Yape cubre varias compras. En «Subir foto» (evidencia pendiente de la captura de pago), Compras puede marcar «Se pagó junto con otra compra» y elegir cuál (`compras.pago_con_compra_id`, `supabase/pago_con_otra_compra.sql`); no hace falta repetir la captura. La base exige que la otra compra sea de la misma sede, pagada por Yape/transferencia, con su propia captura y sin cadenas; la regla de evidencia acepta el vínculo en vez de la captura propia. `CompraResumen` muestra «Pagado junto con otra compra». No se puede eliminar la compra principal mientras otra dependa de su captura (FK RESTRICT).
- **Fechas vacías no rompen la pantalla (8-oct-2026):** `fechaCorta`/`fechaLarga` devuelven vacío si la fecha no es válida (antes lanzaban `Invalid time value`). Caso real: un borrador guardado con un precio «Sugerido» se restauraba antes de cargar la fecha de la última compra y el formulario de compra mostraba «Algo salió mal» (Fabio, manjar blanco S/ 148).
- **Checklist de recepción por producto (8-oct-2026, pedido de Jahnn):** al recibir la mercadería el administrador revisa **cada producto**: «Conforme» o «Problema» (llegó incompleto —cuánto llegó—, no llegó, llegó mal; la nota es obligatoria). `pedido_items.entregado_at` pasó a significar «ya revisado» y `recepcion_estado` / `cantidad_recibida` / `recepcion_nota` guardan el resultado (`supabase/checklist_recepcion.sql`; la base exige que solo el administrador/Gerencia lo registre y las notas del problema). La lista pasa sola a `recibido` cuando todo lo comprado está revisado (disparadores de `pedido_item_entregado.sql`). **«Recibido conforme» global desapareció** de Entregas y recepción: ahora es «Marcar todo conforme (N)» sobre lo que falta revisar, dentro del mismo checklist (componente `PedidoPorRecibir`, también usado en Pedidos de compra). Los problemas generan la alerta «Mercadería con diferencias» para Finanzas (`alertasDeRecepcion`, últimos 14 días) y se ven en «Recibidas esta semana».
- **Menos pantallas — Paso 1 (8-oct-2026, pedido de Jahnn: «nos está confundiendo tantas pestañas»):** (1) la **mercadería se recibe solo en Pedidos** (renombrado «Pedidos y recepción»); la pantalla de dinero ya no tiene checklist, solo un aviso con enlace cuando hay listas por recibir. (2) «Entregas y recepción» pasó a llamarse **«Dinero de la semana»** (`/recepcion`) y absorbió **«Dinero en Compras»**: Gerencia ve un botón «Todas las sedes» que incrusta `RendicionPage` (la ruta `/rendicion` sigue para Compras; se quitó del menú de Gerencia, que bajó de 13 a 11 opciones). (3) Registro de Gastos quedó solo con formulario, filtros y lista, más una franja con lo pendiente de reposición y lo que queda del monto semanal; **el consolidado de reposición, el recorrido del dinero y «Compras que Compras ya registró» (`ComprasRegistradas`) viven ahora en Dinero de la semana**. Sin SQL nuevo.
- **Menos pantallas — Paso 2: menú por grupos (8-oct-2026):** el menú lateral (`Sidebar.tsx`) se ordena en grupos por tarea con título: «Para ver cómo vamos» (Vista general, Panel de Finanzas, Resumen, Presupuesto), «Compras» (Pedidos y recepción, Ruta de compras, Proveedores), «Dinero» (Dinero de la semana, Mi dinero y rendición, Registro de Gastos, Deliverys) y «Administración» (Configuración, Usuarios). El orden de los grupos depende del rol (`ORDEN_GRUPOS`): Gerencia mira primero; administrador y Compras ven primero su trabajo del día. Un grupo sin opciones para ese rol no se muestra. Sin SQL.
- **Mi dinero y rendición agrupado por sede (8-oct-2026, pedido de Compras):** la lista ya no mezcla las entregas de todas las sedes: hay una sección por sede (orden alfabético) con su total — «Recibiste en total» (con la suma visible, ej. S/ 600 + S/ 340 = S/ 940), «Gastaste» y «Te queda», calculados sobre las entregas **abiertas** de esa sede — y debajo cada entrega por día (la más antigua primero); las ya rendidas (esperan confirmación del administrador) van al final de su sede. Arriba, bajo «Tienes S/ X por gastar», una línea con lo que queda en cada sede cuando hay más de una. Gerencia ve la misma agrupación en «Dinero de la semana → Todas las sedes». Sin SQL.
- **Seguimiento de cada lista, estilo delivery (9-oct-2026, pedido de Jahnn):** cada lista de compra muestra su avance en 4 pasos — **Enviada → Comprando → En camino → Recibido** — con la hora de cada paso, un dato corto («6 de 9», «Todo conforme») y una frase de qué pasa ahora y qué sigue. Reglas en `src/lib/seguimiento-pedido.ts` (`seguimientoDePedido`): borrador = «Por enviar»; enviado = Comprando (avanza con los productos comprados o «no había»; la hora es la de la primera compra registrada, `PrecioPagado.registradaAt`); comprado sin revisar = En camino (`comprado_at`); con productos revisados = Recibido en curso («2 de 3»); recibido = todo hecho. Tono ámbar si está atrasada, si hay diferencias al recibir o si no se consiguió nada. El texto cambia según quién mira (`mirada`: sede «tu sede», gerencia con el nombre de la sede, compras «ya compraste»). Componentes `SeguimientoPedido` (completo) y `SeguimientoMini` (una línea), en `src/components/compras/SeguimientoPedido.tsx`. Se ve en **Pedidos y recepción** (cabecera de cada lista abierta y por recibir; reemplaza la pastilla de estado), en la **Vista general** (mini en cada lista y completo al abrirla) y en la **Ruta de compras** (mini por sede). **En vivo:** `usePedidos` vuelve a leer las listas cada minuto y al volver a la pestaña mientras haya alguna enviada o en camino (si nada cambió no redibuja), y la pantalla muestra «En vivo · actualizado hace N min» (`EnVivo`). Sin SQL.
- **Listas vencidas sin enviar y seguimiento del dinero (9-oct-2026, pedido de Jahnn):** (1) Una lista en borrador cuyo día ya pasó (caso real: Fonavi, mié 7) se queda «Por enviar» y Compras nunca la ve; ahora el seguimiento la marca en ámbar («Era el mié 7») y dice qué hacer: si tiene productos, enviarla ahora (le llega a Compras como atrasada) o descartarla; si está vacía, descartarla. No se borra ni se mueve sola. (2) **Seguimiento del dinero de cada entrega** con el mismo componente (ahora acepta cualquier cantidad de pasos): **Entregado → Compras → Rendido → Cerrado → Repuesto** (`src/lib/seguimiento-dinero.ts`, `seguimientoDeEntrega`). Compras avanza con lo gastado frente a lo entregado y se pone ámbar si faltan fotos, si gastó más de lo recibido o si pasan `DIAS_PARA_RENDIR` días sin rendir; Cerrado dice si cuadró; Repuesto = todos los gastos que nacieron de la entrega (`compras.gasto_id`) ya están «pagado» (hook `useReposicionEntregas`, consulta `gastos`). Compras ve solo 4 pasos (no puede leer gastos). Se ve en **Dinero de la semana** (cada entrega en manos de Compras, cada rendición por cerrar y una línea en las cerradas) y en **Mi dinero y rendición** (cada entrega; las cerradas con la línea solo para Gerencia). Sin SQL.
- **Dinero de Fabio (al inicio)**: cada sede le **entrega dinero a rendir**; Fabio rinde con boletas + vuelto y el sistema verifica que *gastado + vuelto = entregado*. Lo comprado se vuelve gasto de la sede y Kelly repone la caja del admin. **Más adelante** (cuando Fabio gane confianza) pasará a un **fondo propio de compras**: diseñar para que sea un cambio de configuración, no una reescritura.
- **Proveedores a crédito**: existen. Las compras a crédito no salen de ninguna caja; van a **cuentas por pagar** con vencimiento, y las paga **Finanzas desde la cuenta del negocio**.
- **Unidades libres (2-oct-2026)**: la unidad de cada producto ya no es una lista cerrada. El administrador la escribe (con sugerencias: la lista base + las que ya usa el catálogo) y la puede cambiar por línea; se recuerda como unidad habitual del producto vía `recordar_unidad_producto` (`supabase/unidad_editable.sql`). Se normaliza a minúsculas (salvo «L»). Unidad «sol» = productos que el mercado vende por monto (2 sol de albahaca = S/ 2).
- **Evidencias obligatorias**: foto de boleta/factura + comprobante de pago por compra.
- **Evidencia más flexible (3-oct-2026, decisión de Jahnn tras el feedback de Fabio)**: (1) **efectivo SIN boleta** (mercado) se permite hasta un tope **por compra y por sede** (`sedes.tope_sin_comprobante`, arranca en S/ 50; Gerencia lo cambia en Configuración → Sedes; lo hace cumplir el trigger `trg_tope_sin_comprobante`, `supabase/tope_sin_comprobante.sql`; `TOPE_SIN_COMPROBANTE_EFECTIVO` es solo el valor por defecto) y con **observación obligatoria** (dónde y a quién compró); pasado el tope, Yape/transferencia o boleta. (2) Si falta una foto, la compra se guarda como **evidencia pendiente** (`compras.evidencia_pendiente`) y Compras la sube después (botón «Subir foto» en Mi dinero y rendición); **no puede rendir ni se puede cerrar la rendición** mientras haya pendientes (botón bloqueado + trigger `no_cerrar_con_evidencia_pendiente`). (3) Finanzas: alerta «Evidencia pendiente» desde 1 día (alta desde 3) y columna «Sin comprobante» (monto, % y cantidad por sede) en Compras a proveedores este mes. SQL: `supabase/evidencia_flexible.sql`.
- **Celular de Fabio: cámara integrada y borrador automático (3-oct-2026)**: abrir la app de cámara del celular recargaba la página (celulares con poca memoria) y se perdía lo escrito y la foto; lo mismo al salir a otra app. Ahora (a) `EvidenciaInput` toma la foto dentro de la página con `CamaraModal` (getUserMedia, foto reducida a 1600 px; si no hay cámara o permiso queda «Elegir de la galería»), y (b) la compra se guarda sola como borrador (`src/lib/borradores.ts`: datos en localStorage, fotos en IndexedDB, solo del día) y, si la página se recarga, la Ruta de compras reabre esa misma compra con todo lo que había. Cancelar/X piden confirmación si ya había datos.
- **Precio de cada línea (2-oct-2026)**: Fabio puede escribir el precio **por unidad** o el **total** de la línea; el otro se calcula solo (`src/lib/precio-linea.ts`). Lo que se guarda siempre es el total (`compra_items.precio_total`). Antes el campo decía solo "Precio" y se confundía con el precio de cada unidad. Lo pedido en **gramos se cotiza por kg** y lo pedido en **ml por litro** (`baseDePrecio` en `src/lib/precio-linea.ts`; la cantidad y el total siguen en g/ml, solo cambia el precio que se escribe y que se muestra: Avisos de precio, Proveedores, Panel de Finanzas y alertas). En la base el precio por unidad sigue siendo por g/ml.
- **Productos en MAYÚSCULAS (5-oct-2026):** el nombre de cada producto del catálogo se guarda en mayúsculas. La app lo convierte mientras se escribe (`nombreDeProducto` en `src/hooks/useProductos.ts`) y la base lo hace cumplir con el trigger `trg_producto_nombre_mayusculas` (`supabase/productos_mayusculas.sql`, que también pasó a mayúsculas los existentes; tildes y ñ se convierten aparte con `nombre_en_mayusculas`).
- **Ruta del día de Fabio**: pedidos de las sedes del día **agrupados por proveedor**.
- **Proveedor por producto (2-oct-2026)**: el administrador elige a quién se le compra cada producto al armar su lista (columna Proveedor en Pedidos de compra, se guarda en `pedido_items.proveedor_id`); Fabio ve la ruta ya agrupada. Lo que quede sin proveedor lo asigna Fabio en su ruta ("Sin proveedor asignado"). Sin cambios de base de datos: las reglas de `pedido_items` ya permitían al administrador actualizar.
- **El sistema recuerda el proveedor de cada producto (2-oct-2026)**: al elegir proveedor en una línea, se guarda como proveedor habitual del producto (`productos.proveedor_id`, vía la función `recordar_proveedor_producto`, `supabase/recordar_proveedor.sql`, que solo permite cambiar ese dato). La próxima vez que se agregue ese producto sale con su proveedor, y un botón completa las líneas sin proveedor que el sistema ya recuerda. La memoria es única para las 3 sedes (gana la última elección); se puede cambiar en cada lista.
- **Controles para Finanzas**: compras sin evidencia, rendiciones descuadradas, urgentes, y **alerta de precio** si un producto sale bastante más caro que la última vez (catálogo de productos con último precio y proveedor).
- Recomendación: pedir **boleta separada por sede** cuando Fabio compre para dos sedes el mismo día (lunes: Atelier + Fonavi).
- Fases: **2A**, **2B** y **3** hechas. **4** (pendiente, cuando Jahnn lo decida) = fondo propio de Fabio: pasar de "entregas por sede" a una caja de Compras que Gerencia repone directamente.

### Deliverys de Compras (decisiones de Jahnn, 2-oct-2026)
Fabio también entrega productos de Yayi's a clientes. Se controla cuántos hace y el dinero que cobra. Tablas `deliverys` y `liquidaciones_delivery`, función `recibir_efectivo_delivery` (`supabase/deliverys.sql`, la ejecuta Jahnn). **No mueve la caja chica**: no crea gastos ni reposiciones.
- **Quién registra:** Fabio, desde el celular, apenas entrega (sede de origen, cliente, valor del producto, valor del delivery —monto libre—, cómo pagó el cliente).
- **Cómo pagó el cliente (`modalidad`):** `todo_prepagado` (Fabio no cobra) · `producto_prepagado` (cobra el delivery) · `todo_contra_entrega` (cobra producto + delivery). `cobrado` lo calcula la base; las mismas reglas están en `src/lib/deliverys.ts`.
- **Cobro:** efectivo o Yape/transferencia (con captura obligatoria, como en las compras).
- **Efectivo:** queda "por entregar" a cargo de Fabio hasta que el administrador de la sede de origen lo cuenta y confirma en `/deliverys` (se registra esperado, recibido y diferencia; si no cuadra, la nota es obligatoria). Gerencia también puede confirmar.
- **Corregir un delivery (8-oct-2026):** Fabio puede corregir la **fecha** y **cómo pagó el cliente** (efectivo ↔ Yape/transferencia) de un delivery suyo (icono de calendario en la lista, `corregirDelivery`). Reglas: mientras su efectivo no se haya recibido y dentro de las 24 h de registrarlo (política RLS `deliverys_update`); Gerencia, en cualquier momento mientras no se haya recibido. Pasar a Yape **exige la captura** (CHECK `deliverys_evidencia_cuentas`); pasar a efectivo borra la captura y lo deja como efectivo por entregar. Los montos no se pueden cambiar. Sin SQL.
- **Fecha y nota de la entrega del efectivo (8-oct-2026):** al confirmar el efectivo, el administrador indica el **día en que Fabio se lo entregó** (`liquidaciones_delivery.fecha_entrega`, no futuro ni anterior al delivery más reciente; si no se indica, hoy) y puede dejar una **nota aunque cuadre** (obligatoria solo si hay diferencia). La constancia muestra ese día y, si es distinto, «confirmado el …». `supabase/delivery_fecha_entrega.sql` reemplaza `recibir_efectivo_delivery` (ahora con `p_fecha`).
- **Control:** Panel de Finanzas muestra resumen del mes por sede y alertas ("Efectivo de delivery" si pasan 2 días sin entregar —`DIAS_PARA_ENTREGAR_EFECTIVO`—, y "Delivery descuadrado").
- **Seguridad (RLS):** Fabio solo ve y borra lo suyo, y solo el mismo día y mientras no se liquide; el administrador solo ve su sede.
- Pendiente a futuro: pago a Fabio por delivery y tarifa por zona (se descartaron por ahora).

### Vista general de Gerencia (decisiones de Jahnn, 5-oct-2026)
Pantalla `/vista-general` (`src/pages/VistaGeneralPage.tsx`), la primera que ve Gerencia al entrar (Jahnn y Kelly). El Panel de Finanzas queda igual: es la pantalla de trabajo de Kelly.
- **Filtros:** periodo (Hoy, Ayer, Esta semana, Semana pasada, Este mes, Mes pasado o desde/hasta) y sede.
- **Muestra:** números clave, por sede, gastos por categoría, día por día (si es más de un día), listas de los administradores, productos sin comprar, compras de Fabio, dinero entregado y rendiciones, deliverys y gastos de caja. Las alertas son de "ahora" (las mismas del Panel de Finanzas).
- **Reglas de los números** en `src/lib/vista-general.ts`: una compra se cuenta UNA vez (el gasto que crea `cerrar_entrega` se excluye usando `compras.gasto_id`); total gastado = gastos de caja + compras (contado y crédito); "entregado a Fabio" no cuenta el saldo que continúa.
- Solo lectura; sin cambios en la base de datos. Gastos se traen paginados (Supabase da máximo 1000 filas por consulta).
- **Excel de gastos por categoría (pedido de Kelly, 5-oct-2026):** botón «Descargar Excel» en la Vista general, con el periodo y la sede elegidos (`src/lib/exportGastosCategoria.ts`). Hojas: Resumen (categoría × sede, con fijo/variable y totales por tipo), una hoja por sede (detalle agrupado por categoría con subtotales) y Detalle (todo en una tabla con filtros). Sale de `movimientos` en `src/lib/vista-general.ts`, la misma lista que la pantalla. Incluye gastos de caja + compras de Fabio; las compras sin rendir y a crédito todavía no tienen categoría y salen aparte.
- **Gasto fijo o variable:** columna `categorias.tipo_gasto` (`'fijo' | 'variable' | null` = por definir), `supabase/tipo_categoria.sql`. Se elige en Configuración → Categorías y la app lo cambia en la categoría del mismo nombre de las 3 sedes.

### Presupuesto por categoría (decisiones de Jahnn, 6-oct-2026)
El presupuesto del mes se arma y se aprueba en **Cash Control** (Grupo → Presupuesto). Ahí, de cada categoría de la lista única, se marca **cuánto maneja el administrador** («Lo maneja el admin»). Al aprobar, Cash Control llama a `sincronizar_presupuesto_caja` (con su clave; aquí solo se guarda la huella en `sync_secretos`) y esos montos quedan en `presupuesto_caja` como el **tope** de cada barra. SQL: `supabase/presupuesto_caja.sql`.
- **Emparejamiento:** `categorias.categoria_presupuesto` (Configuración → Categorías, «En el presupuesto»; se cambia en las 3 sedes a la vez). Sin emparejar = se ve como gasto pero no consume ningún tope. No se renombró nada.
- **Lo gastado** (función `gastado_caja_por_categoria`, una sola regla): gastos de caja por su categoría emparejada, sin los que nacen de una compra (`compras.gasto_id`) + compras de Fabio (contado y crédito) repartidas por producto según `productos.categoria_presupuesto` (si el producto no tiene, la categoría que eligió el admin al cerrar la rendición). Igual que la Vista general: cada compra cuenta UNA vez.
- **Barras** (`src/lib/presupuesto.ts`, `BarraPresupuesto`): verde < 80%, ámbar desde 80%, roja > 100%. Se ven en **Presupuesto** (`/presupuesto`, Gerencia ve las 3 sedes), en **Registro de gastos** (con el gasto encima, rayado) y en **Pedidos de compra** (costo estimado de la lista = cantidad × precio habitual; también suma lo pendiente de las otras listas del mes).
- **Pasarse del tope:** se puede, pero se pide el motivo (`gastos.motivo_sobre_tope`, `pedidos.motivo_sobre_tope`) y Finanzas recibe alertas: «Presupuesto pasado» (categoría > 100% en el mes, alta), «Gasto sobre el tope» y «Lista sobre el tope» (media, 14 días).
- Cada producto recuerda su categoría como recuerda su proveedor (`recordar_categoria_producto`); la migración la completa con la más usada en sus compras.

### Estado
- App estable y en uso. Deuda con Luis cuadrada al 8-jul-2026. Fase 1 multi-sede en producción (29-sep-2026).
- No quedan herramientas temporales en el código (todas retiradas).

### Backlog / mejoras pospuestas (preguntar a Jahnn antes de hacer)
- **Partir `ResumenPage.tsx`** (~1500 líneas) en componentes hijos. Se pospuso para evitar regresiones; es el archivo más grande y complejo.
- **"Cierre de semana" reutilizable**: Jahnn mostró interés en un botón controlado que salde la deuda vieja y deje pendiente lo nuevo (se hizo una versión temporal de un solo uso y se retiró). Podría convertirse en feature estable con confirmación.
- **Descuadre histórico de datos**: el "dinero neto" arrastra ~S/1,000 de ruido (gastos duplicados/mal cargados del backfill, reposiciones huérfanas). No es deuda real (confirmado por conteo físico de Luis). Si algún día se quiere limpiar, hay que auditar mes por mes con Luis. **Baja prioridad.**
- 2 vulnerabilidades moderadas en dependencias de `exceljs` (sin fix no-breaking).

### Lecciones para no repetir errores
- El pago progresivo no parte gastos → reponer montos que no calcen con gastos completos deja sobrantes. **Recomendación operativa a Jahnn:** reponer el monto exacto que muestra "Reponer Cuentas".
- No confiar en el "dinero neto" del sistema para la deuda real: usar el conteo físico de Luis.
- Cambios de datos masivos: no se pueden hacer con la anon key; se hacen con la sesión de Jahnn (un botón en la app) o con SQL que Jahnn ejecuta en Supabase.

---

## 9. Checklist antes de cerrar cualquier cambio
1. ¿Corrí `npm run build` completo y pasó?
2. ¿El cambio toca dinero/datos? → doble verificación + explicar impacto a Jahnn en español simple.
3. ¿Trabajé en rama + PR, hice el merge y le di a Jahnn la migración SQL si hacía falta?
4. ¿Dejé alguna herramienta temporal? → retirarla cuando cumpla su función.
5. ¿Expliqué en español simple qué cambió y qué debe probar Jahnn?
