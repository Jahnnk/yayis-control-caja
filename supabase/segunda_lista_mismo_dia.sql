-- Una sede puede armar una SEGUNDA lista para el mismo día de compra cuando la primera ya fue
-- RECIBIDA (o cancelada). Mientras haya una lista abierta (borrador, enviada o comprada) para ese
-- día, sigue valiendo una sola por sede. Las urgentes siguen aparte.
-- Correr en el SQL Editor de Supabase ANTES de publicar el código que depende de esto.
DROP INDEX IF EXISTS pedidos_uno_por_dia;
CREATE UNIQUE INDEX pedidos_uno_por_dia
  ON pedidos (sede_id, fecha_compra) WHERE NOT urgente AND estado NOT IN ('cancelado', 'recibido');

SELECT indexdef AS regla_nueva FROM pg_indexes WHERE indexname = 'pedidos_uno_por_dia';
