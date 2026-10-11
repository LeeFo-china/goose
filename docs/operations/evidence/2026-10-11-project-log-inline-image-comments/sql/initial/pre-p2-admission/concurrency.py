"""Independent two-session overlap check. Requires task-owned container and synthetic fixture only.
Run: SQL_TEST_SSH_TARGET=<authorized-test-host> python3 concurrency.py
"""
import os, re, subprocess, time
from pathlib import Path
OUT=Path(__file__).resolve().parent
TARGET=os.environ['SQL_TEST_SSH_TARGET']
CONTAINER='gooes-inline-sql-20261011-independent'
BASE=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10',TARGET,
 f'docker exec -i {CONTAINER} psql -X -At -v ON_ERROR_STOP=1 -h /tmp -U postgres -d gooes_inline_comments_test']
def query(sql):
 r=subprocess.run(BASE,input=sql,text=True,capture_output=True,timeout=30)
 if r.returncode: raise RuntimeError(r.stdout+r.stderr)
 return r.stdout.strip()
def uid(n):return f"'00000000-0000-4000-8000-{n:012d}'"
rpc=f"SELECT 'RESULT:'||id FROM public.create_project_log_project_comment_v2({uid(1)},{uid(1)},{uid(101)},'employee',{uid(1)},'',NULL,ARRAY[{uid(439)}::uuid],{uid(990001)},repeat('f',64));"
a_sql="SET application_name='inline_independent_A'; SET statement_timeout='20s'; BEGIN; SET LOCAL ROLE service_role;\n"+rpc+"\nSELECT pg_sleep(8); COMMIT;\n"
b_sql="SET application_name='inline_independent_B'; SET statement_timeout='20s'; BEGIN; SET LOCAL ROLE service_role;\n"+rpc+"\nCOMMIT;\n"
(OUT/'concurrency-session-a.sql').write_text(a_sql);(OUT/'concurrency-session-b.sql').write_text(b_sql)
a=subprocess.Popen(BASE,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
a.stdin.write(a_sql);a.stdin.close();a.stdin=None
b=None
try:
 for _ in range(16):
  if query("SELECT count(*) FROM pg_stat_activity WHERE application_name='inline_independent_A' AND wait_event='PgSleep';")=='1':break
  time.sleep(.15)
 else:raise AssertionError('A did not hold transaction open')
 b=subprocess.Popen(BASE,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 b.stdin.write(b_sql);b.stdin.close();b.stdin=None
 overlap=''
 for _ in range(16):
  overlap=query("SELECT application_name||'|'||wait_event_type||'|'||wait_event||'|blockers='||cardinality(pg_blocking_pids(pid)) FROM pg_stat_activity WHERE application_name='inline_independent_B' AND wait_event_type='Lock';")
  if overlap:break
  time.sleep(.15)
 assert 'advisory|blockers=1' in overlap,overlap
 ao,ae=a.communicate(timeout=25);bo,be=b.communicate(timeout=25)
 assert a.returncode==0,(ao,ae)
 assert b.returncode==0,(bo,be)
 ids_a=re.findall(r'RESULT:([0-9a-f-]{36})',ao);ids_b=re.findall(r'RESULT:([0-9a-f-]{36})',bo)
 assert len(ids_a)==len(ids_b)==1 and ids_a==ids_b,(ids_a,ids_b)
 count=query(f"SELECT count(*) FROM public.project_log_project_comments WHERE client_request_id={uid(990001)};")
 attach=query(f"SELECT count(*) FROM public.project_log_comment_uploads u JOIN public.project_log_project_comments c ON c.id=u.comment_id WHERE c.client_request_id={uid(990001)} AND u.status='attached' AND u.position=0;")
 assert count==attach=='1',(count,attach)
 result=f'Observed overlap: {overlap}\nA exit={a.returncode}\n{ao}{ae}\nB exit={b.returncode}\n{bo}{be}\nSame returned id={ids_a[0]}\nCommitted comments={count}; attached files at position0={attach}\nPASS concurrent same request key, image-only payload: one comment and one attachment.\n'
 (OUT/'concurrency.txt').write_text(result);print(result)
finally:
 for p in [a,b]:
  if p and p.poll() is None:
   try:p.communicate(timeout=25)
   except subprocess.TimeoutExpired:p.kill();p.communicate()
