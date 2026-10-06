-- =============================================================
-- Gastos pagados con el MONTO SEMANAL de compras (pedido de Sol/Fonavi, 6-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Algunos pagos que antes hacía Gerencia (fruta, humitas, carne...) ahora los paga el
-- administrador con el monto semanal. Esos gastos NO se le reponen (ya recibió el dinero),
-- así que se marcan con esta casilla: restan del monto semanal y no entran a "Reponer".
--
-- Solo AGREGA una columna (todos los gastos actuales quedan en "no", sin cambios)
-- y una regla: un gasto marcado debe estar "pagado" y sin reposición asociada.
-- =============================================================

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS con_monto_semanal BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_monto_semanal_no_se_repone') THEN
    ALTER TABLE gastos ADD CONSTRAINT gastos_monto_semanal_no_se_repone
      CHECK (NOT con_monto_semanal OR (estado = 'pagado' AND reposicion_id IS NULL));
  END IF;
END $$;

-- Verificación: la columna existe y ningún gasto actual está marcado (marcados = 0).
SELECT count(*) AS gastos,
       count(*) FILTER (WHERE con_monto_semanal) AS marcados
FROM gastos;
