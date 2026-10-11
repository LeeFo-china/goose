// Execute inside the production API container after deploying the preparation release.
// No settings changes or successful business writes. Never print tokens or credential values.
import assert from 'node:assert/strict';
const { SupabaseDB } = await import('/app/apps/api/src/utils/supabase/index.ts');
const { signAdminToken } = await import('/app/apps/api/src/utils/jwt.ts');
const db = SupabaseDB.getAdminClient();
async function rows(query) { const r = await query; assert(!r.error, r.error?.code); return r.data ?? []; }
const keys = ['PROJECT_LOG_COMMUNICATION_ENABLED','PROJECT_LOG_INTERNAL_COMMENTS_RETIRED','PROJECT_LOG_COMMENT_V2_ENABLED'];
const settings = await rows(db.from('system_settings').select('key,value_text').is('tenant_id',null).in('key',keys).limit(3));
const flags = Object.fromEntries(settings.map(row => [row.key,row.value_text]));
assert.deepEqual(flags, {PROJECT_LOG_COMMUNICATION_ENABLED:'true',PROJECT_LOG_INTERNAL_COMMENTS_RETIRED:'true',PROJECT_LOG_COMMENT_V2_ENABLED:'false'});
const tenant = '3eebca47-961f-4899-b976-a3d3208d326b';
const employee = (await rows(db.from('employees').select('id,user_id,admin_auth_version').eq('id','d8ecc522-e6a1-49d6-b7b7-aaa0f3084826').eq('tenant_id',tenant).eq('status','active').limit(1)))[0];
assert(employee?.user_id);
const log = (await rows(db.from('project_logs').select('id,project_id').eq('project_id','1c245715-dd5e-47b5-93bc-6ec6864c3716').eq('tenant_id',tenant).limit(1)))[0];
assert(log);
process.env.JWT_EXPIRES_IN = '5m';
const token = signAdminToken({sub:employee.user_id,employee_id:employee.id,tenant_id:tenant,roles:['employee'],login_channel:'admin_web',admin_auth_version:employee.admin_auth_version},{platform:false});
const checks=[];
async function check(name,method,path,body,status,code,authenticated=true) {
 const response=await fetch('https://api.goodcms.cn'+path,{method,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{...(authenticated?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({}));
 checks.push({name,method,status:response.status,code:result.code??null,request_id:result.requestId??response.headers.get('x-request-id'),pass:response.status===status&&(!code||result.code===code)});
 return result;
}
const url=`/project_logs/${log.id}/project-comments`;
const before=await db.from('project_log_project_comments').select('id',{head:true,count:'exact'}).eq('log_id',log.id); assert(!before.error);
const uploadsBefore=await db.from('project_log_comment_uploads').select('file_id',{head:true,count:'exact'}).eq('log_id',log.id); assert(!uploadsBefore.error);
const old=await check('v1-list-still-available','GET',url,undefined,200);
checks.push({name:'v1-contract',pass:Array.isArray(old.data?.list)&&old.data.page===1&&old.data.list.every(row=>row.moderation_status==='approved')});
await check('v2-list-disabled','GET',url+'?contract_version=2',undefined,403,'PROJECT_COMMENT_V2_DISABLED');
await check('v2-create-disabled','POST',url,{contract_version:2,client_request_id:crypto.randomUUID(),content:'准备版拒绝写入核查',attachment_ids:[]},403,'PROJECT_COMMENT_V2_DISABLED');
await check('v2-preview-disabled','POST',`/projects/${log.project_id}/project-comment-previews`,{contract_version:2,log_ids:[log.id]},403,'PROJECT_COMMENT_V2_DISABLED');
await check('v2-upload-init-disabled','POST',`/project_logs/${log.id}/project-comment-uploads/init`,{contract_version:2,mime_type:'image/png',size_bytes:128},403,'PROJECT_COMMENT_V2_DISABLED');
await check('v2-upload-complete-disabled','POST',`/project_logs/${log.id}/project-comment-uploads/complete`,{contract_version:2,file_id:crypto.randomUUID()},403,'PROJECT_COMMENT_V2_DISABLED');
await check('v2-url-disabled','GET',`${url}/${crypto.randomUUID()}/attachments/${crypto.randomUUID()}/url`,undefined,403,'PROJECT_COMMENT_V2_DISABLED');
await check('legacy-internal-stays-retired','GET',`/project_logs/${log.id}/internal-comments`,undefined,410,'PROJECT_LOG_INTERNAL_COMMENTS_RETIRED');
await check('anonymous-new-list-rejected','GET',url+'?contract_version=2',undefined,401,null,false);
await check('anonymous-new-preview-rejected','POST',`/projects/${log.project_id}/project-comment-previews`,{contract_version:2,log_ids:[log.id]},401,null,false);
const after=await db.from('project_log_project_comments').select('id',{head:true,count:'exact'}).eq('log_id',log.id); assert(!after.error);
const uploadsAfter=await db.from('project_log_comment_uploads').select('file_id',{head:true,count:'exact'}).eq('log_id',log.id); assert(!uploadsAfter.error);
checks.push({name:'no-comment-or-upload-created',pass:before.count===after.count&&uploadsBefore.count===uploadsAfter.count});
console.log(JSON.stringify({phase:'preparation-v2-disabled',at:new Date().toISOString(),flags,checks,pass:checks.every(c=>c.pass),limits:['Short-lived server-generated employee token; not phone-session evidence','No real image upload or v2 publication while disabled']},null,2));
assert(checks.every(c=>c.pass),'Preparation smoke failed');
