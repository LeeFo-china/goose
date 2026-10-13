import { createServer } from 'node:http';
import { sessionFor, serviceAccess } from './rendering-library-mock-fixture.mjs';
const id=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const projects=[{id:id(1),name:'梁森施工项目',address:'寺东嘉园 15号3单元1702',customer_name:'梁森',status:'constructing'},
 {id:id(2),name:'陈芳施工项目',address:'中牟县新城花园 2号楼1201',customer_name:'陈芳',status:'pending_start'},
 {id:id(3),name:'已验收项目',address:'绿城花园 8号楼101',customer_name:'WF Service Smoke 跨区域项目客户名称 2026-10-14T00:00:00.000Z',status:'acceptance'}];
const camera={id:id(10),name:'大厅',position:'入户门',vendor:'tencent_iotvideo_industry',status:'offline',status_source:'live',can_view:true,can_control:false,capabilities:['live','ptz'],sort_order:0,video_encrypted:false,cover_url:null};
const asset={id:id(20),vendor:'tencent_iotvideo_industry',vendor_device_serial:'device-20',vendor_channel_id:'channel-20',hardware_serial:'TEST-SN-20',status:'online',bound_camera_id:null,bound_project_id:null};
let submitted=[];
let deviceTotal=21;
function send(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({success:status<400,data,...(status>=400?{message:'模拟设备查询失败'}:{})}));}
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3997'), path=url.pathname, q=url.searchParams;
 if(path==='/health') return send(res,{});
 if(path==='/admin/auth/me'){const session=sessionFor('manager');session.tenant.name='监控布局测试公司';session.permissions=['project.read','project.update','camera.read','camera.manage'].map(code=>({code,scope:'all'}));return send(res,session);}
 if(path==='/employee/service-access')return send(res,serviceAccess);
 if(path==='/notifications/summary')return send(res,{unread_count:0});
 if(path==='/__reset'){deviceTotal=21;submitted=[];return send(res,{});}
 if(req.method==='DELETE'&&path.match(/^\/projects\/[^/]+\/cameras\/[^/]+$/)){deviceTotal=20;return send(res,{});}
 if(path==='/__submitted')return send(res,submitted);
 if(path==='/project-cameras/projects'){
  const binding=q.get('binding')||'bound', keyword=q.get('keyword')||'',status=q.get('project_status');
  const list=projects.filter((p,i)=>(binding==='all'||(binding==='unbound'?i!==0:i===0))&&(!status||p.status===status)&&(!keyword||JSON.stringify(p).includes(keyword))).map(p=>({project:p,cameras:[],summary:{camera_count:p.id===id(1)?deviceTotal:0,online_count:0,offline_count:p.id===id(1)?deviceTotal:0,unknown_count:0,hidden_count:0,tencent_count:p.id===id(1)?deviceTotal:0}}));
  return send(res,{list,pagination:{page:Number(q.get('page')||1),pageSize:20,total:list.length,totalPages:list.length?1:0},summary:{}});
 }
 if(path.match(/\/project-cameras\/projects\/[^/]+\/devices/)){
  const page=Number(q.get('page')||1);return send(res,{list:page===1||deviceTotal>20?[{...camera,name:page===1?'大厅':'阳台'}]:[],pagination:{page,pageSize:20,total:deviceTotal,totalPages:Math.ceil(deviceTotal/20)},status_source:"live"});
 }
 if(path==='/projects/camera-bind-options')return send(res,{list:projects.filter(p=>p.id===q.get('selected_project_id')),pagination:{page:1,pageSize:20,total:1,totalPages:1}});
 if(path==='/tenant-devices')return send(res,{list:[asset],pagination:{page:1,pageSize:20,total:1,totalPages:1}});
 if(req.method==='POST'&&path.match(/^\/projects\/[^/]+\/cameras$/)){
  let body='';for await(const chunk of req)body+=chunk;submitted.push({path,payload:JSON.parse(body)});return send(res,{id:id(11)});
 }
 if(req.method==='GET')return send(res,{list:[],pagination:{page:1,pageSize:20,total:0,totalPages:0}});
 return send(res,{},405);
}).listen(3997,'127.0.0.1');
