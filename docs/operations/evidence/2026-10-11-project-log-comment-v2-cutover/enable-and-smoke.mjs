// One-shot authorized production cutover via platform settings API; no direct DB writes.
// Run inside API container. Tokens stay in memory; smoke creates no business comments/uploads.
import assert from 'node:assert/strict';
const { SupabaseDB } = await import('/app/apps/api/src/utils/supabase/index.ts');
const { signAdminToken, signToken } = await import('/app/apps/api/src/utils/jwt.ts');
const { authorizationService } = await import('/app/apps/api/src/services/authorization.ts');
const db = SupabaseDB.getAdminClient();
const keys=['PROJECT_LOG_COMMUNICATION_ENABLED','PROJECT_LOG_INTERNAL_COMMENTS_RETIRED','PROJECT_LOG_COMMENT_V2_ENABLED'];
const checks=[]; let changed=false; let platformToken; let beforeFlags; let recovery=null;
async function rows(query){const result=await query;assert(!result.error,'Read failed');return result.data??[];}
async function flags(){return Object.fromEntries((await rows(db.from('system_settings').select('key,value_text').is('tenant_id',null).in('key',keys).limit(3))).map(r=>[r.key,r.value_text]));}
async function check(name,method,path,token,body,status,code){
 const response=await fetch('https://api.goodcms.cn'+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({}));
 checks.push({name,status:response.status,code:result.code??null,request_id:result.requestId??response.headers.get('x-request-id'),pass:response.status===status&&(!code||result.code===code)});
 assert(checks.at(-1).pass,name);return result.data;
}
async function run(){
 beforeFlags=await flags();
 assert.deepEqual(beforeFlags,{PROJECT_LOG_COMMUNICATION_ENABLED:'true',PROJECT_LOG_INTERNAL_COMMENTS_RETIRED:'true',PROJECT_LOG_COMMENT_V2_ENABLED:'false'});
 const candidates=await rows(db.from('employees').select('id,user_id,admin_auth_version').is('tenant_id',null).eq('status','active').not('user_id','is',null).limit(20));
 let operator;
 for(const row of candidates){const ctx=await authorizationService.getAuthContextByAuthUserId(row.user_id);if(ctx.employeeId===row.id&&ctx.isPlatformStaff&&(ctx.isPlatformSuperAdmin||ctx.permissions.some(p=>p.code==='platform.system_setting.manage'))){operator=row;break;}}
 assert(operator,'Authorized platform operator unavailable');process.env.JWT_EXPIRES_IN='5m';
 platformToken=signAdminToken({sub:operator.user_id,roles:['employee'],login_channel:'admin_web',admin_auth_version:operator.admin_auth_version},{platform:true});
 const tenant='3eebca47-961f-4899-b976-a3d3208d326b';
 const employee=(await rows(db.from('employees').select('id,user_id,admin_auth_version').eq('id','d8ecc522-e6a1-49d6-b7b7-aaa0f3084826').eq('tenant_id',tenant).eq('status','active').limit(1)))[0];assert(employee?.user_id);
 const log=(await rows(db.from('project_logs').select('id,project_id').eq('project_id','1c245715-dd5e-47b5-93bc-6ec6864c3716').eq('tenant_id',tenant).limit(1)))[0];assert(log);
 const oauth=(await rows(db.from('user_oauth_identities').select('openid').eq('user_id',employee.user_id).eq('platform','wechat_mini').eq('status','active').limit(1)))[0];assert(oauth);
 const token=signAdminToken({sub:employee.user_id,employee_id:employee.id,tenant_id:tenant,roles:['employee'],login_channel:'admin_web',admin_auth_version:employee.admin_auth_version},{platform:false});
 const wechat=signToken({sub:employee.user_id,employee_id:employee.id,tenant_id:tenant,roles:['employee'],login_channel:'wechat',openid:oauth.openid});
 const url=`/project_logs/${log.id}/project-comments`;
 await check('preflight-v1-readable','GET',url,token,undefined,200);
 await check('preflight-v2-disabled','GET',url+'?contract_version=2',token,undefined,403,'PROJECT_COMMENT_V2_DISABLED');
 // From this point a transport failure could leave the update applied: recovery closes comments.
 changed=true;
 await check('enable-v2-platform-api','PATCH','/platform/system-settings/PROJECT_LOG_COMMENT_V2_ENABLED',platformToken,{value:'true'},200);
 assert.equal((await flags()).PROJECT_LOG_COMMENT_V2_ENABLED,'true');
 const page=await check('v2-employee-page','GET',url+'?contract_version=2&pageSize=20',token,undefined,200);
 assert(Array.isArray(page?.list)&&page.pageSize===20&&typeof page.can_write==='boolean'&&page.list.every(r=>r.published===true&&r.visibility==='project'&&Array.isArray(r.attachments)),'v2 page contract');
 checks.push({name:'v2-page-contract',pass:true});
 await check('v2-wechat-bound-employee','GET',url+'?contract_version=2&pageSize=20',wechat,undefined,200);
 const preview=await check('v2-inline-preview','POST',`/projects/${log.project_id}/project-comment-previews`,wechat,{contract_version:2,log_ids:[log.id]},200);
 assert(preview?.list?.length===1&&preview.list[0].log_id===log.id&&preview.list[0].recent_comments.length<=3&&typeof preview.list[0].can_write==='boolean','preview contract');
 checks.push({name:'v2-preview-contract',pass:true});
 await check('old-v1-get-update-required','GET',url,token,undefined,410,'PROJECT_COMMENT_CLIENT_UPDATE_REQUIRED');
 await check('old-v1-post-update-required','POST',url,token,{content:'旧版拒绝检查'},410,'PROJECT_COMMENT_CLIENT_UPDATE_REQUIRED');
 await check('old-internal-retired','GET',`/project_logs/${log.id}/internal-comments`,wechat,undefined,410,'PROJECT_LOG_INTERNAL_COMMENTS_RETIRED');
 await check('anonymous-v2-denied','GET',url+'?contract_version=2',null,undefined,401,'TOKEN_MISSING');
 await check('invalid-empty-v2-denied','POST',url,token,{contract_version:2,client_request_id:crypto.randomUUID(),content:'',attachment_ids:[]},400);
 console.log(JSON.stringify({at:new Date().toISOString(),release:'v2026.10.11.1',client_binding:'confirmed_by_user_not_independently_observed',before_flags:beforeFlags,after_flags:await flags(),checks,pass:true,setting_mutation:'platform API PATCH',business_comments_created:0,uploads_created:0,real_device_acceptance:'pending',credentials:'server-generated-short-lived-not-phone-sessions'},null,2));
}
run().catch(async()=>{
 if(changed&&platformToken){try{await check('failure-close-comments','PATCH','/platform/system-settings/PROJECT_LOG_COMMUNICATION_ENABLED',platformToken,{value:'false'},200);recovery='comments-closed';}catch{recovery='closure-unverified';}}
 console.log(JSON.stringify({at:new Date().toISOString(),pass:false,before_flags:beforeFlags,after_flags:await flags().catch(()=>null),checks,recovery,error:'CUTOVER_OR_SMOKE_FAILED'},null,2));process.exitCode=1;
});
