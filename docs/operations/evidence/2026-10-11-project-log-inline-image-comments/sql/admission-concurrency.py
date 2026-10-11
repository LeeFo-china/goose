"""Two real service-role admission transactions at recent-count 59; only task DB.
SQL_TEST_SSH_TARGET=<authorized-test-host> python3 admission-concurrency.py
"""
import os,subprocess,time
from pathlib import Path
OUT=Path(__file__).resolve().parent
BASE=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10',os.environ['SQL_TEST_SSH_TARGET'],
 'docker exec -i gooes-inline-sql-20261011-independent psql -X -At -v ON_ERROR_STOP=1 -h /tmp -U postgres -d gooes_inline_comments_test']
def query(sql):
 r=subprocess.run(BASE,input=sql,text=True,capture_output=True,timeout=35)
 if r.returncode:raise RuntimeError(r.stdout+r.stderr)
 return r.stdout.strip()
def u(n):return f'00000000-0000-4000-8000-{n:012d}'
def rpc(n,log=1):
 prefix=f'private/project-log-project-comments/{u(1)}/{u(log)}/{u(n)}'
 return f"public.reserve_project_log_comment_upload('{u(n)}','{u(1)}','{u(log)}','{u(700001)}','employee','{u(700001)}','private-bucket','ap-shanghai','{prefix}/final','{prefix}/raw','image/png',1200,'independent.png')"
seed=f"""DO $$ BEGIN IF current_database()<>'gooes_inline_comments_test' THEN RAISE EXCEPTION 'isolated database required'; END IF; END $$;
INSERT INTO auth.users(id) VALUES('{u(700001)}');
INSERT INTO public.employees(id,tenant_id,status,name) VALUES('{u(700001)}','{u(1)}','active','independent admission fixture');
SET ROLE service_role;
"""
seed+='DO $$ BEGIN\n'+''.join('PERFORM * FROM '+rpc(n)+';\n' for n in range(710001,710060))+'END $$;\n'
seed+=f"SELECT count(*) FROM public.project_log_comment_uploads WHERE auth_user_id='{u(700001)}';\n"
(OUT/'admission-seed.sql').write_text(seed)
seed_output=query(seed);assert seed_output.splitlines()[-1]=='59',seed_output
# Distinct logs deliberately share one identity quota/lock.
a_sql="SET application_name='inline_admission_A'; SET statement_timeout='20s'; BEGIN; SET LOCAL ROLE service_role;\nSELECT 'ADMITTED:'||file_id FROM "+rpc(710060)+";\nSELECT pg_sleep(8); COMMIT;\n"
b_sql="\\set VERBOSITY verbose\nSET application_name='inline_admission_B'; SET statement_timeout='20s'; BEGIN; SET LOCAL ROLE service_role;\nSELECT 'ADMITTED:'||file_id FROM "+rpc(710061,2)+";\nCOMMIT;\n"
(OUT/'admission-session-a.sql').write_text(a_sql);(OUT/'admission-session-b.sql').write_text(b_sql)
a=subprocess.Popen(BASE,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
a.stdin.write(a_sql);a.stdin.close();a.stdin=None
b=None
try:
 for _ in range(16):
  if query("SELECT count(*) FROM pg_stat_activity WHERE application_name='inline_admission_A' AND wait_event='PgSleep';")=='1':break
  time.sleep(.15)
 else:raise AssertionError('A did not hold transaction open')
 b=subprocess.Popen(BASE,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 b.stdin.write(b_sql);b.stdin.close();b.stdin=None
 overlap=''
 for _ in range(16):
  overlap=query("SELECT application_name||'|'||wait_event_type||'|'||wait_event||'|blockers='||cardinality(pg_blocking_pids(pid)) FROM pg_stat_activity WHERE application_name='inline_admission_B' AND wait_event_type='Lock';")
  if overlap:break
  time.sleep(.15)
 assert 'advisory|blockers=1' in overlap,overlap
 ao,ae=a.communicate(timeout=25);bo,be=b.communicate(timeout=25)
 assert a.returncode==0 and ('ADMITTED:'+u(710060)) in ao,(ao,ae)
 assert b.returncode==3 and 'PT429' in be and 'COMMENT_ATTACHMENT_RATE_LIMITED' in be,(bo,be,b.returncode)
 check=f"""SELECT 'uploads='||count(*) FROM public.project_log_comment_uploads WHERE auth_user_id='{u(700001)}';
SELECT 'files='||count(*) FROM public.platform_file_objects WHERE created_by_auth_user_id='{u(700001)}';
SELECT 'orphans='||count(*) FROM public.platform_file_objects f LEFT JOIN public.project_log_comment_uploads u ON u.file_id=f.id WHERE f.created_by_auth_user_id='{u(700001)}' AND u.file_id IS NULL;
SELECT 'rejected_file='||count(*) FROM public.platform_file_objects WHERE id='{u(710061)}';
SELECT 'rejected_upload='||count(*) FROM public.project_log_comment_uploads WHERE file_id='{u(710061)}';
SELECT 'paired='||count(*) FROM public.platform_file_objects f JOIN public.project_log_comment_uploads u ON u.file_id=f.id WHERE f.created_by_auth_user_id='{u(700001)}' AND u.status='uploading' AND f.visibility='private' AND f.public_url IS NULL AND u.upload_expires_at=u.created_at+interval '10 minutes';
"""
 result=query(check);assert result.splitlines()==['uploads=60','files=60','orphans=0','rejected_file=0','rejected_upload=0','paired=60'],result
 (OUT/'admission-assert.sql').write_text(check)
 evidence='Seeded using actual service-role reservation RPC: 59 files + 59 uploads.\nObserved overlap: '+overlap+f'\nA exit={a.returncode}\n'+ao+ae+f'\nB exit={b.returncode} (expected PT429)\n'+bo+be+'\n'+result+'\nPASS two concurrent init requests across different logs at59: one admitted, one PT429, no orphan file.\n'
 (OUT/'admission-concurrency.txt').write_text(evidence);print(evidence)
 # Capture exact admission counter shapes without planner forcing on final data.
 prefix=f"tenant_id='{u(1)}' AND auth_user_id='{u(700001)}' AND author_type='employee' AND author_id='{u(700001)}'"
 cutoff=query("SELECT clock_timestamp()-interval '10 minutes';")
 plan="SELECT indexname,indexdef FROM pg_indexes WHERE indexname IN ('project_comment_upload_identity_recent_idx','project_comment_upload_identity_outstanding_idx');\nANALYZE public.project_log_comment_uploads;\n"
 plan+=f"EXPLAIN (ANALYZE,BUFFERS) SELECT count(*) FROM (SELECT 1 FROM public.project_log_comment_uploads WHERE {prefix} AND created_at>TIMESTAMPTZ '{cutoff}' LIMIT 60)recent;\n"
 plan+=f"EXPLAIN (ANALYZE,BUFFERS) SELECT count(*) FROM (SELECT 1 FROM public.project_log_comment_uploads WHERE {prefix} AND status IN('uploading','complete') LIMIT 90)outstanding;\n"
 (OUT/'admission-plans.sql').write_text(plan);(OUT/'admission-plans.txt').write_text(query(plan)+'\n')
finally:
 for p in [a,b]:
  if p and p.poll() is None:
   try:p.communicate(timeout=25)
   except subprocess.TimeoutExpired:p.kill();p.communicate()
