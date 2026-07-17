# AGENTS.md — Yayi's Control de Caja

> Documento de contexto para cualquier agente de IA (Codex, Claude, etc.) que continúe este proyecto.
> Léelo completo antes de tocar nada. Última actualización: 8 de julio de 2026.

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

**Yayi's Control de Caja** es una app web para registrar y controlar los **gastos de caja chica** de la panadería. El flujo del negocio:

- **Luis** es la persona que maneja la caja/cuenta y **paga los gastos** del día a día (insumos, fletes, deliverys, packaging, etc.).
- Luis tiene un **fondo de caja chica** (ej. S/ 800 en la cuenta bancaria). Paga gastos de ahí.
- **Jahnn le repone** a Luis (semanalmente) lo que gastó, para que su caja vuelva al fondo.
- La app registra los **gastos** (lo que Luis paga) y las **reposiciones** (lo que Jahnn le devuelve a Luis), y calcula cuánto le falta reponer.

**Está en producción, funcionando, usado a diario.** Cualquier cambio va a la app real que Jahnn y su equipo usan.

---

## 3. Stack técnico

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS** (colores de marca: `yayis-green` #098B5F, `yayis-dark` #004C40, `yayis-accent`, `yayis-cream`)
- **Supabase** (Postgres + Auth + RLS) como backend — cliente en `src/lib/supabase.ts`
- **lucide-react** para iconos, **recharts** para gráficos
- **Deploy en Vercel** (auto-despliega al hacer push a `main`)
- **GitHub**: repo `Jahnnk/yayis-control-caja`, **rama única `main`**
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
- **Reglas de despliegue (IMPORTANTE):**
  1. Correr `npm run build` **completo** (no solo `tsc --noEmit`) y que pase sin errores antes de pushear.
  2. **Pedir autorización explícita a Jahnn antes de cada `git push origin main`.** Él revisa y da el "sí".
  3. Mensajes de commit descriptivos, en español.
- `npm audit`: hay 2 vulnerabilidades moderadas en dependencias transitivas de `exceljs` (export a Excel). No tienen fix no-breaking a jul-2026; riesgo bajo. No romper el build por eso.

---

## 5. Estructura del código

```
src/
├── App.tsx                  # rutas (react-router). ResumenPage carga con lazy()
├── main.tsx                 # entry, envuelto en <ErrorBoundary>
├── contexts/AuthContext.tsx # login, perfil, sede del usuario
├── lib/
│   ├── supabase.ts          # cliente Supabase
│   ├── utils.ts             # formatMonto, roundTwo, cn
│   ├── dates.ts             # getTodayLima, calcularSemana, getMesLabel, semanas del mes
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
    └── UsuariosPage.tsx

supabase/                    # scripts SQL de referencia (esquema, seed, tablas)
```

Roles de usuario: `owner` (Jahnn, ve todo), `admin`, `viewer`. Se filtra por `sede_id` vía RLS (viewer/admin solo su sede; owner ve su sede).

---

## 6. Modelo de datos y conceptos de negocio (LEER CON CUIDADO)

### Tablas principales
- **`gastos`**: cada gasto que paga Luis. Campos clave: `fecha`, `descripcion`, `categoria_id`, `metodo_pago` (`'efectivo'` | `'cuentas'`), `monto`, `estado` (`'pendiente'` | `'pagado'`), `semana`, `mes`, `sede_id`, `reposicion_id` (FK a la reposición que lo pagó, o null).
- **`reposiciones`**: cada vez que Jahnn le repone dinero a Luis. Campos: `fecha`, `metodo_pago`, `monto`, `notas`, `sede_id`.
- Otras: `sedes`, `profiles`, `categorias`, `arqueos_semanales`, `configuracion_fondos` (el fondo de caja de Luis), `valores_revisados`.

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

---

## 8. Estado actual y pendientes (backlog)

### Estado
- App estable y en uso. Deuda con Luis cuadrada al 8-jul-2026.
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
3. ¿Pedí autorización antes de `git push origin main`?
4. ¿Dejé alguna herramienta temporal? → retirarla cuando cumpla su función.
5. ¿Expliqué en español simple qué cambió y qué debe probar Jahnn?
