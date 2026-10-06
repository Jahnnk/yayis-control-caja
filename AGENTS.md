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
