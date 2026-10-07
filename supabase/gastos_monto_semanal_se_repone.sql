-- =============================================================
-- Los gastos «pagados con el monto semanal» SÍ se reponen (corrección, 7-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Antes (gastos_con_monto_semanal.sql) esos gastos nacían «pagados» y no entraban a «Reponer».
-- Pero todo gasto se repone, igual que lo que gasta Fabio. Ahora la casilla solo sirve para
-- restar del saldo del monto semanal; el gasto queda «pendiente» y se repone normalmente.
--
-- 1. Quita la regla que obligaba a que un gasto marcado estuviera «pagado».
-- 2. Devuelve a «pendiente» los gastos ya marcados que nadie ha repuesto todavía.
-- No toca montos, fechas ni reposiciones.
-- =============================================================

ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_monto_semanal_no_se_repone;

UPDATE gastos SET estado = 'pendiente'
WHERE con_monto_semanal AND estado = 'pagado' AND reposicion_id IS NULL;

-- Verificación: marcados = gastos con la casilla; pagados_sin_reposicion debe ser 0.
SELECT count(*) FILTER (WHERE con_monto_semanal) AS marcados,
       count(*) FILTER (WHERE con_monto_semanal AND estado = 'pagado' AND reposicion_id IS NULL) AS pagados_sin_reposicion
FROM gastos;
