-- Sobrante de una reposición: cuando lo que Gerencia repone no alcanza para marcar un gasto COMPLETO
-- (un gasto nunca se parte), esa diferencia queda «a favor» y se suma a la próxima reposición de esa caja.
-- Solo cuentan las reposiciones marcadas con sobrante_activo (las viejas, del respaldo, no se tocan).
-- Correr en el SQL Editor de Supabase ANTES de publicar el código que depende de esto.
ALTER TABLE reposiciones ADD COLUMN IF NOT EXISTS sobrante_activo BOOLEAN NOT NULL DEFAULT false;

-- Las 3 reposiciones de Atelier del 12-oct-2026 (sobrantes 0.80 + 0.60 + 0.80 = S/ 2.20).
UPDATE reposiciones SET sobrante_activo = true
WHERE fecha = '2026-10-12'
  AND sede_id IN (SELECT id FROM sedes WHERE nombre ILIKE 'atelier%');

SELECT count(*) AS reposiciones_marcadas FROM reposiciones WHERE sobrante_activo;
