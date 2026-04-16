-- v0.8.12: Typed publish history support with operation grouping.
--
-- Adds operation-level grouping and explicit event typing to update_log so
-- quiet saves, sends, clears, and send failures can share one server model.

ALTER TABLE public.update_log
  ADD COLUMN IF NOT EXISTS operation_id uuid,
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'send_notification';

ALTER TABLE public.update_log
  ALTER COLUMN operation_id SET DEFAULT gen_random_uuid();

UPDATE public.update_log
SET operation_id = COALESCE(operation_id, gen_random_uuid())
WHERE operation_id IS NULL;

ALTER TABLE public.update_log
  ALTER COLUMN operation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS update_log_operation_id_idx ON public.update_log(operation_id);
CREATE INDEX IF NOT EXISTS update_log_event_type_idx ON public.update_log(event_type);
