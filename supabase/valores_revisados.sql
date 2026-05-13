-- =============================================================
-- Migracion: tabla valores_revisados
-- Proposito: persistir que grupos de "Valores a Revisar" ya
--            fueron verificados manualmente, para ocultarlos
--            del listado activo del Resumen.
-- NOTA DE TIPOS: en este proyecto sedes.id, gastos.id y
--                profiles.id son UUID (no BIGINT).
-- Ejecutar en el SQL Editor de Supabase. No afecta datos existentes.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.valores_revisados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id         UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('duplicado', 'mismo_monto')),
  gasto_ids       UUID[] NOT NULL,
  monto_unitario  NUMERIC(10, 2) NOT NULL,
  descripcion_preview TEXT,
  verificado_por  UUID NOT NULL REFERENCES public.profiles(id),
  verificado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas           TEXT
);

COMMENT ON TABLE  public.valores_revisados IS 'Grupos de la tarjeta Valores a Revisar ya verificados manualmente. La identidad del grupo se basa en el conjunto exacto de IDs de gastos.';
COMMENT ON COLUMN public.valores_revisados.gasto_ids IS 'Array de IDs de gastos del grupo, ordenado ascendente.';
COMMENT ON COLUMN public.valores_revisados.tipo IS 'duplicado = misma descripcion + mismo monto. mismo_monto = mismo monto, descripciones distintas.';

CREATE INDEX IF NOT EXISTS idx_valores_revisados_sede
  ON public.valores_revisados(sede_id);

CREATE INDEX IF NOT EXISTS idx_valores_revisados_gasto_ids
  ON public.valores_revisados USING GIN (gasto_ids);

ALTER TABLE public.valores_revisados ENABLE ROW LEVEL SECURITY;

-- SELECT: owner ve todas las sedes; admin/viewer ven solo la suya
CREATE POLICY "valores_revisados_select"
  ON public.valores_revisados
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.rol = 'owner' OR p.sede_id = public.valores_revisados.sede_id)
    )
  );

-- INSERT: owner siempre; admin solo de su sede
CREATE POLICY "valores_revisados_insert"
  ON public.valores_revisados
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.rol = 'owner' OR (p.rol = 'admin' AND p.sede_id = public.valores_revisados.sede_id))
    )
  );

-- DELETE (= re-abrir): owner siempre; admin solo de su sede
CREATE POLICY "valores_revisados_delete"
  ON public.valores_revisados
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.rol = 'owner' OR (p.rol = 'admin' AND p.sede_id = public.valores_revisados.sede_id))
    )
  );

-- Sin policy de UPDATE: los registros son inmutables.
-- Para "cambiar" se hace DELETE (re-abrir) y luego se vuelve a verificar.
