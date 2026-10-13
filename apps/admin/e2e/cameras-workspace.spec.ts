import { expect, test } from '@playwright/test';
const project1='50000000-0000-4000-8000-000000000001';
const project2='50000000-0000-4000-8000-000000000002';
test.beforeEach(async({page,request})=>{await request.get('http://127.0.0.1:3997/__reset');await page.context().addCookies([{name:'gooes_admin_token',value:'camera-fixture',url:'http://127.0.0.1:3047'}]);});
test('existing project shows only contextual entry, paged devices and honest offline status',async({page},info)=>{
 await page.goto('/cameras');
 await expect(page.getByRole('button',{name:'添加摄像头',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'增加摄像头',exact:true})).toHaveCount(1);
 await expect(page.getByText('户型',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:/21 台/}).click();
 await expect(page.getByText('大厅',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'预览',exact:true})).toBeDisabled();
 await expect(page.getByText('可播放',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'下一页设备'}).click();
 await expect(page.getByText('阳台',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('bound-project-devices.png'),fullPage:true});
});
test('first camera and additional camera both lock project context',async({page},info)=>{
 for(const [binding,label,address] of [['bound','增加摄像头','寺东嘉园 15号3单元1702'],['unbound','添加首台摄像头','中牟县新城花园 2号楼1201']]){
  await page.goto(`/cameras?binding=${binding}`);
  await page.getByRole('button',{name:label,exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText(address,{exact:false}).first()).toBeVisible();
  await expect(dialog.locator('#camera-project-search')).toHaveCount(0);
  await expect(dialog.locator('#camera-device')).toBeEnabled();
  await page.screenshot({path:info.outputPath(`${binding}-locked-project.png`),fullPage:true});
  await dialog.locator('#camera-device').click();
  await page.getByRole('option').first().click();
  await dialog.locator('#camera-name').fill('客厅施工位');
  const projectId=binding==='bound'?project1:project2;
  const submitted=page.waitForRequest(req=>req.method()==='POST'&&req.url().endsWith(`/projects/${projectId}/cameras`));
  await dialog.getByRole('button',{name:'绑定摄像头',exact:true}).click();
  expect((await submitted).postDataJSON()).toMatchObject({name:'客厅施工位',tenant_device_id:'50000000-0000-4000-8000-000000000020'});
  await expect(dialog).not.toBeVisible();
 }
});
test('filters find unbound projects and reset stale page number',async({page})=>{
 await page.goto('/cameras?camera_page=3');
 await page.locator('#camera-binding').click();await page.getByRole('option',{name:'未绑定',exact:true}).click();
 await page.locator('#camera-project-status').click();await page.getByRole('option',{name:'待开工',exact:true}).click();
 await page.getByRole('button',{name:'查询',exact:true}).click();
 await expect(page.getByRole('button',{name:'添加首台摄像头'})).toBeVisible();
 expect(new URL(page.url()).searchParams.has('camera_page')).toBe(false);
 await expect(page.getByText('尚未配置监控',{exact:true})).toBeVisible();
});
test('device error has retry, and empty bound list links to unbound',async({page})=>{
 await page.goto('/cameras');
 await page.route(`**/api/backend/project-cameras/projects/${project1}/devices?*`,route=>route.fulfill({status:503,json:{success:false,message:'设备暂时无法查询'}}));
 await page.getByRole('button',{name:/21 台/}).click();
 await expect(page.getByText('设备暂时无法查询')).toBeVisible();
 await page.unroute(`**/api/backend/project-cameras/projects/${project1}/devices?*`);
 await page.getByRole('button',{name:'重试加载设备'}).click();
 await expect(page.getByText('大厅',{exact:true})).toBeVisible();
 await page.goto('/cameras?camera_keyword=不存在');
 await expect(page.getByText('没有匹配的项目')).toBeVisible();
});
for(const width of [1440,720,390])test(`workspace remains contained at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.goto('/cameras?binding=all');
 await expect(page.getByRole('link',{name:'寺东嘉园 15号3单元1702'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`workspace-${width}.png`),fullPage:true});
});

test('revoked project binding permission blocks device selection and submission',async({page})=>{
 await page.goto('/cameras');
 await page.route('**/api/backend/projects/camera-bind-options?*',route=>route.fulfill({status:403,json:{success:false,message:'无权绑定当前项目'}}));
 await page.getByRole('button',{name:'增加摄像头',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('无权绑定当前项目')).toBeVisible();
 await expect(dialog.locator('#camera-device')).toBeDisabled();
 await expect(dialog.getByRole('button',{name:'绑定摄像头',exact:true})).toBeDisabled();
});

test('empty device pool closes binding dialog and navigates to device management',async({page})=>{
 await page.goto('/cameras');
 await page.route('**/api/backend/tenant-devices?*',route=>route.fulfill({json:{success:true,data:{list:[],pagination:{page:1,pageSize:20,total:0,totalPages:0}}}}));
 await page.getByRole('button',{name:'增加摄像头',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('link',{name:/设备管理/}).click();
 await expect(dialog).not.toBeVisible();
 await expect(page.getByRole('tab',{name:'设备管理',exact:true})).toHaveAttribute('data-state','active');
 await page.getByRole('tab',{name:'项目摄像头',exact:true}).click();
 await expect(page).toHaveURL(/tab=cameras/);
 await page.getByRole('button',{name:'增加摄像头',exact:true}).click();
 await page.getByRole('dialog').getByRole('link',{name:/设备管理/}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(page.getByRole('tab',{name:'设备管理',exact:true})).toHaveAttribute('data-state','active');
});
test('unbinding last device on the final page returns to the previous device page',async({page})=>{
 await page.goto('/cameras');
 await page.getByRole('button',{name:/21 台/}).click();
 await page.getByRole('button',{name:'下一页设备'}).click();
 await expect(page.getByText('阳台',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'更多摄像头操作'}).click();
 await page.getByRole('menuitem',{name:'解绑',exact:true}).click();
 await page.getByRole('button',{name:'确认解绑',exact:true}).click();
 await expect(page.getByText('大厅',{exact:true})).toBeVisible();
 await expect(page.getByText('共 20 台，第 1 / 1 页')).toBeVisible();
});

test('unrefreshed offline status is labeled as recent and does not prevent a preview attempt',async({page})=>{
 await page.goto('/cameras');
 await page.route(`**/api/backend/project-cameras/projects/${project1}/devices?*`,async route=>{
  const response=await route.fetch();const body=await response.json();
  body.data.status_source='persisted';body.data.list[0].status_source='persisted';
  await route.fulfill({json:body});
 });
 await page.getByRole('button',{name:/21 台/}).click();
 await expect(page.getByText('最近记录',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'预览',exact:true})).toBeEnabled();
});
