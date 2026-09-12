-- Apply before deploying the provider DELETE endpoint.
-- Preserve all provider/model data and indexes; only disallow referenced provider deletion.
-- Rollback: disable or roll back the DELETE endpoint while retaining the safer RESTRICT FK.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.ai_models
  DROP CONSTRAINT ai_models_provider_id_fkey;

ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES public.ai_providers(id) ON DELETE RESTRICT;

COMMIT;
