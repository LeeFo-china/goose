#!/usr/bin/env python3
"""Verify the real migration backfill twice in a rolled-back local fixture transaction."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = "gooes-manual-trial-db"  # Disposable local database only.
info = json.loads(subprocess.check_output(["docker", "inspect", CONTAINER]))[0]
values = dict(item.split("=", 1) for item in info["Config"]["Env"])
env = {**os.environ, "PGPASSWORD": values["POSTGRES_PASSWORD"]}
# Same disposable-image workaround as full_business_trial_concurrency.py:
# disable the faulty supautils session hook, retaining SQL constraints and ACLs.
command = ["docker", "exec", "-i", "-e", "PGPASSWORD", "-e",
           "PGOPTIONS=-c session_preload_libraries=", CONTAINER, "psql", "-X",
           "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
migration = (ROOT / "supabase/migrations/20261008084500_initialize_manual_tenant_service_provider_profile.sql").read_text()
# Only the outer transaction delimiters are removed to roll back the entire test.
assert migration.count("\nBEGIN;\n") == 1 and migration.endswith("COMMIT;\n")
body = migration.split("\nBEGIN;\n", 1)[1].removesuffix("COMMIT;\n")
fixtures = """
BEGIN;
CREATE TEMP TABLE provider_backfill_before AS
SELECT id, to_jsonb(profile) AS snapshot FROM public.tenant_service_provider_profiles profile;
INSERT INTO public.tenants(id,name,slug,status,creation_source,contact_phone,address,address_adcode)
VALUES ('00000000-0000-4000-8000-000000008451','缺失草稿验证','profile-backfill-missing','active','platform_manual','13999100845','现有地址','410105'),
       ('00000000-0000-4000-8000-000000008452','已发布验证','profile-backfill-existing','active','platform_manual',NULL,NULL,NULL);
INSERT INTO public.tenant_service_provider_profiles(tenant_id,public_name,introduction,status,version,published_at)
VALUES ('00000000-0000-4000-8000-000000008452','已编辑公开名称','保持原内容','published',5,now());
INSERT INTO provider_backfill_before SELECT id,to_jsonb(profile)
FROM public.tenant_service_provider_profiles profile WHERE tenant_id='00000000-0000-4000-8000-000000008452';
"""
checks = """
DO $$
DECLARE v_profile public.tenant_service_provider_profiles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_profile FROM public.tenant_service_provider_profiles
  WHERE tenant_id='00000000-0000-4000-8000-000000008451';
  IF v_profile.status <> 'draft' OR v_profile.version <> 1 OR v_profile.public_phone IS NOT NULL
    OR v_profile.published_at IS NOT NULL OR v_profile.address <> '现有地址'
    OR v_profile.address_region_code <> '410105'
  THEN RAISE EXCEPTION 'backfill failed or public boundary changed'; END IF;
  IF EXISTS(SELECT 1 FROM provider_backfill_before snapshot
    LEFT JOIN public.tenant_service_provider_profiles profile ON profile.id=snapshot.id
    WHERE profile.id IS NULL OR to_jsonb(profile) IS DISTINCT FROM snapshot.snapshot)
  THEN RAISE EXCEPTION 'migration overwrote an existing profile'; END IF;
  IF EXISTS(SELECT 1 FROM public.tenant_service_areas
    WHERE tenant_id='00000000-0000-4000-8000-000000008451')
  THEN RAISE EXCEPTION 'backfill invented a service area'; END IF;
END $$;
"""
# Snapshot the first backfill too, so the second run must preserve its ID/version/timestamps.
snapshot = """
INSERT INTO provider_backfill_before SELECT id,to_jsonb(profile)
FROM public.tenant_service_provider_profiles profile
WHERE NOT EXISTS(SELECT 1 FROM provider_backfill_before previous WHERE previous.id=profile.id);
"""
result = subprocess.run(command, input=fixtures + body + checks + snapshot + body + checks + "ROLLBACK;\n",
                        text=True, env=env, capture_output=True, timeout=45)
if result.returncode:
    raise AssertionError(result.stderr)
print("PASS: missing profile backfill, unchanged existing profiles, repeat-run idempotency, unpublished/private-phone boundary")
