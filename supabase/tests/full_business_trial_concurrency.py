#!/usr/bin/env python3
"""Real SQL/lock tests, restricted to the named disposable Docker container.

No third-party Python dependencies. Creates and drops a uniquely named database
restored from a dump of the existing fixture database; never connects to a production host.
Run: python3 supabase/tests/full_business_trial_concurrency.py
"""
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

CONTAINER = "gooes-manual-trial-db"
ROOT = Path(__file__).resolve().parents[2]
DATABASE = "full_trial_test_" + uuid.uuid4().hex[:12]
ACTOR = str(uuid.uuid4())
info = json.loads(subprocess.check_output(["docker", "inspect", CONTAINER]))[0]
container_env = dict(item.split("=", 1) for item in info["Config"]["Env"])
# [WORKAROUND] This disposable image's supautils session hook segfaults on a
# permission-denied function call. Disable only this connection's session hook,
# leaving ACLs, RLS and all SQL constraints active. Remove after image repair.
# Docker copies PGPASSWORD from the child environment without printing the secret.
ENV = {**os.environ, "PGPASSWORD": container_env["POSTGRES_PASSWORD"]}
BASE = ["docker", "exec", "-i", "-e", "PGPASSWORD", "-e",
        "PGOPTIONS=-c session_preload_libraries=", CONTAINER, "psql", "-X",
        "-qAt", "-U", "supabase_admin", "-v", "ON_ERROR_STOP=1"]


def run(sql, database=DATABASE, ok=True):
    result = subprocess.run(BASE + ["-d", database], input=sql, text=True,
                            capture_output=True, env=ENV, timeout=45)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    return result


def session(sql):
    child = subprocess.Popen(BASE + ["-d", DATABASE], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, env=ENV)
    child.stdin.write(sql + "\n")
    child.stdin.flush()
    return child


def wait_blocked(name):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        result = run(f"SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name = '{name}' AND wait_event_type = 'Lock';")
        if result.stdout.strip() == "1":
            return
        time.sleep(0.05)
    raise AssertionError(f"{name} never waited for the fixture lock")


def scope_call(trial, version, key, reason="concurrent scope"):
    return f"""SELECT public.platform_service_trial_update_scope(
      '{trial}','{ACTOR}',{version},'{key}',
      '{{"version":1,"capabilities":["core.projects","business.finance"]}}',
      '{reason}');"""


children = []
try:
    # pg_cron/pg_net keep sessions on postgres, so CREATE DATABASE ... TEMPLATE
    # postgres cannot safely clone it. Dump/restore avoids terminating any sessions.
    run(f'CREATE DATABASE "{DATABASE}" TEMPLATE template0;', "postgres")
    # Supabase generates graphql_public wrappers through install-time event
    # triggers; they are unrelated to trial tests and are not pg_dump-restorable.
    dump_args = BASE[:BASE.index("psql")] + ["pg_dump", "-U", "supabase_admin", "-d", "postgres", "--exclude-schema=graphql_public"]
    dump = subprocess.run(dump_args, capture_output=True, text=True, env=ENV, timeout=45)
    assert dump.returncode == 0, dump.stderr
    run("CREATE SCHEMA graphql_public;")
    # pg_dump emits extension-member ACLs even with --exclude-schema. Omit
    # only the generated GraphQL wrapper ACL; trial/function ACLs stay intact.
    restored_sql = "\n".join(line for line in dump.stdout.splitlines()
                             if not line.startswith("GRANT ALL ON FUNCTION graphql_public.graphql("))
    run(restored_sql)
    # Recreate only the NEW RPCs as the real migration role. Existing helpers
    # retain their postgres owner under CREATE OR REPLACE.
    run("""DROP FUNCTION public.platform_service_trial_update_scope(uuid,uuid,integer,uuid,jsonb,text);
      DROP FUNCTION public.create_platform_tenant_with_trial_scope(
        text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,
        timestamptz,text,text,text,text,uuid,text,text,uuid,integer,text,uuid,boolean,jsonb);""")
    before = run("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.platform_service_trial_scope_valid(jsonb)'::regprocedure;").stdout.strip()
    run((ROOT / "supabase/migrations/20261008072135_full_business_trial_scope.sql").read_text())
    after = run("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.platform_service_trial_scope_valid(jsonb)'::regprocedure;").stdout.strip()
    assert before == after == "postgres", (before, after)
    assert run("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.platform_service_trial_update_scope(uuid,uuid,integer,uuid,jsonb,text)'::regprocedure;").stdout.strip() == "supabase_admin"
    print("PASS: migration preserves postgres helper owner and creates new RPC as supabase_admin")
    # The main suite includes real service_role success and anon/authenticated
    # invocation denial, and rolls its fixtures back.
    result = run((ROOT / "supabase/tests/full_business_trial.sql").read_text())
    print(result.stderr.strip())
    print("PASS: full SQL suite with real database roles")

    run(f"""INSERT INTO public.employees(id,name,status,tenant_id)
      VALUES ('{ACTOR}','并发范围超管','active',NULL);
      INSERT INTO public.employee_roles(employee_id,role_id)
      SELECT '{ACTOR}',id FROM public.roles
      WHERE tenant_id IS NULL AND code = 'platform_admin' AND status = 'active';""")
    created = json.loads(run(f"""SELECT public.create_platform_tenant_with_trial_scope(
      p_name => '并发范围验证', p_slug => 'full-business-concurrency',
      p_operator_employee_id => '{ACTOR}', p_trial_days => 30,
      p_trial_reason => '并发验证', p_trial_idempotency_key => '{uuid.uuid4()}',
      p_trial_scope => '{{"version":1,"capabilities":["core.projects"]}}');""").stdout)
    trial = created["trial"]["id"]

    # Same-key race: the second session waits, then returns the stored envelope.
    first = session("BEGIN; " + scope_call(trial, 1, (key := str(uuid.uuid4()))) + "\n\\echo READY")
    children.append(first)
    first_result = None
    for line in first.stdout:
        if line.strip() == "READY":
            break
        if line.startswith("{"):
            first_result = json.loads(line)
    second = session("SET application_name='full_trial_replay'; " + scope_call(trial, 1, key))
    children.append(second)
    wait_blocked("full_trial_replay")
    first.stdin.write("COMMIT;\n\\q\n")
    first.stdin.flush()
    first.wait(timeout=5)
    second.stdin.close()
    replay_output = second.stdout.read()
    replay_error = second.stderr.read()
    second.wait(timeout=5)
    assert second.returncode == 0, replay_error
    replay = json.loads(replay_output)
    assert replay.pop("idempotent") is True
    assert first_result.pop("idempotent") is False
    assert replay == first_result, "race replay envelope differs"
    assert run(f"SELECT count(*) FROM public.tenant_service_trial_events WHERE trial_id='{trial}' AND event_type='trial_scope_updated';").stdout.strip() == "1"
    print("PASS: concurrent same-key calls store exactly one audit/command and replay identical results")

    # Prove fresh wall-clock checks after BOTH advisory and row-lock waits.
    # Each fixture has two seconds of access remaining when the request begins.
    for lock_kind in ("enterprise", "row"):
        run(f"""UPDATE public.tenant_service_trials SET status='active',
          starts_at=clock_timestamp()-interval '30 days',
          activated_at=clock_timestamp()-interval '30 days',
          trial_ends_at=clock_timestamp()+interval '2 seconds',
          grace_ends_at=clock_timestamp()+interval '2 seconds'
          WHERE id='{trial}';""")
        if lock_kind == "enterprise":
            lock_sql = f"""SELECT pg_advisory_xact_lock(hashtextextended(
              'service-trial-enterprise:' || encode(enterprise_identity_hash,'hex'),
              20260811005555)) FROM public.tenant_service_trials WHERE id='{trial}';"""
        else:
            lock_sql = f"SELECT id FROM public.tenant_service_trials WHERE id='{trial}' FOR UPDATE;"
        holder = session("BEGIN; " + lock_sql + "\n\\echo READY")
        children.append(holder)
        for line in holder.stdout:
            if line.strip() == "READY":
                break
        pending = session("SET application_name='full_trial_expiry'; " + scope_call(trial, 2, str(uuid.uuid4())))
        children.append(pending)
        wait_blocked("full_trial_expiry")
        time.sleep(2.2)
        holder.stdin.write("COMMIT;\n\\q\n")
        holder.stdin.flush()
        holder.wait(timeout=5)
        pending.stdin.close()
        pending.stdout.read()
        error = pending.stderr.read()
        pending.wait(timeout=5)
        assert pending.returncode != 0 and "SERVICE_TRIAL_ACTION_NOT_ALLOWED" in error, error
        assert run(f"SELECT version FROM public.tenant_service_trials WHERE id='{trial}';").stdout.strip() == "2"
        assert run(f"SELECT count(*) FROM public.tenant_service_trial_events WHERE trial_id='{trial}' AND event_type='trial_scope_updated';").stdout.strip() == "1"
        print(f"PASS: expiry while waiting for {lock_kind} lock denies mutation; version/audit unchanged")
finally:
    for child in children:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=5)
    run(f'DROP DATABASE IF EXISTS "{DATABASE}" WITH (FORCE);', "postgres")
    print("Disposable cloned database removed")
