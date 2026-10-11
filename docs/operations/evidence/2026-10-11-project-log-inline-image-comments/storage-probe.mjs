// Production gateway transport probe: synthetic image, random isolated keys, no SQL/business rows.
// Run inside the deployed API container. Never log signed URLs, keys, or credentials.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import COS from 'cos-nodejs-sdk-v5';
import sharp from 'sharp';
async function run() {
const { getCosConfig } = await import('/app/apps/api/src/services/files/platform-file-storage/legacy/config.ts');
const { ProjectLogCommentAttachmentStorage } = await import('/app/apps/api/src/gateways/project-log-comment-attachment-storage/client.ts');
const config = await getCosConfig.call({});
const cos = new COS({SecretId:config.secretId,SecretKey:config.secretKey,Timeout:10000});
const versioning = await cos.getBucketVersioning({Bucket:config.bucket,Region:config.region});
if (versioning.VersioningConfiguration?.Status) {
 console.log(JSON.stringify({skipped:true,reason:'Versioned bucket: probe requires separately reviewed version-specific cleanup',versioning:versioning.VersioningConfiguration.Status}));
 process.exit(0);
}
const storage = new ProjectLogCommentAttachmentStorage({loadConfig:async()=>config});
const location=await storage.allocate({tenantId:randomUUID(),logId:randomUUID(),uploadId:randomUUID()});
const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#225544'}}).png().toBuffer();
const checksum=createHash('sha256').update(bytes).digest('hex');
const finalKey=location.objectKey+'/'+checksum;
const checks=[];let cleanup=false;
try {
 const signed=await storage.signPut({...location,mimeType:'image/png',sizeBytes:bytes.length});
 const put=await fetch(signed.uploadUrl,{method:'PUT',headers:signed.headers,body:bytes,redirect:'manual',signal:AbortSignal.timeout(15000)});
 checks.push({name:'private-presigned-put',status:put.status,pass:put.status===200}); assert(put.status===200,'PUT failed');
 const verified=await storage.finalize({...location,mimeType:'image/png',sizeBytes:bytes.length});
 checks.push({name:'verified-frozen-bytes',pass:verified.checksum===checksum&&verified.objectKey===finalKey&&verified.width===4&&verified.height===4});
 const read=await storage.signRead({...location,objectKey:verified.objectKey});
 const response=await fetch(read.url,{signal:AbortSignal.timeout(15000),redirect:'manual'});
 const result=Buffer.from(await response.arrayBuffer());
 checks.push({name:'signed-get',status:response.status,pass:response.status===200&&result.equals(bytes)});
 const unsigned=new URL(read.url); unsigned.search='';
 const anonymous=await fetch(unsigned,{signal:AbortSignal.timeout(15000),redirect:'manual'});
 checks.push({name:'anonymous-final-denied',status:anonymous.status,pass:anonymous.status===403});
 const raw=new URL(signed.uploadUrl);raw.search='';
 const anonymousRaw=await fetch(raw,{signal:AbortSignal.timeout(15000),redirect:'manual'});
 checks.push({name:'anonymous-raw-denied',status:anonymousRaw.status,pass:anonymousRaw.status===403});
} finally {
 for (const Key of [location.rawObjectKey,finalKey]) await cos.deleteObject({Bucket:location.bucket,Region:location.region,Key});
 const remaining=await cos.getBucket({Bucket:location.bucket,Region:location.region,Prefix:location.rawObjectKey.replace(/raw$/,''),MaxKeys:10});
 cleanup=remaining.Contents.length===0;
 console.log(JSON.stringify({at:new Date().toISOString(),kind:'synthetic-private-COS-gateway-probe-not-phone-or-business-comment',checks,cleanup,sql_writes:0,pass:cleanup&&checks.length===5&&checks.every(check=>check.pass)},null,2));
}
assert(cleanup&&checks.length===5&&checks.every(check=>check.pass),'Storage probe failed');

}
run().catch(error => { console.error(JSON.stringify({error:"STORAGE_PROBE_FAILED", code:/^[A-Za-z0-9_]+$/.test(error?.code ?? "") ? error.code : null})); process.exitCode=1; });
