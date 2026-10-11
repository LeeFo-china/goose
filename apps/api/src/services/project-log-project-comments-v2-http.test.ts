import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
afterEach(() => mock.restore());
const id = "00000000-0000-4000-8000-000000000001";
async function setup(auth = false) {
  const { default: Fastify } = await import("fastify");
  const { default: errorHandler } = await import("@/plugins/error-handler");
  const { default: controller } = await import("@/controllers/project-log-comments");
  const app = Fastify();
  errorHandler(app);
  if (auth) {
    const { default: authenticate } = await import("@/plugins/auth");
    authenticate(app);
  } else {
    app.addHook("onRequest", async request => {
      request.user = { sub: id, tenant_id: id, customer_id: id, roles: ["customer"], login_channel: "wechat", openid: "bound" };
    });
  }
  const routes: {url:string; access:unknown}[] = [];
  app.addHook("onRoute", route => { routes.push({url:route.url,access:route.config?.tenantServiceAccess}); });
  controller.registerExtraRoutes(app);
  return { app, routes };
}
test("v2 dispatch validates images and previews; preview is read-only POST", async () => {
  const { app, routes } = await setup();
  const { projectLogCommunicationRollout } = await import("./project-log-communication-rollout");
  const { projectLogProjectCommentsV2Service } = await import("./project-log-project-comments-v2");
  const { projectLogCommentPreviewsService } = await import("./project-log-comment-previews");
  spyOn(projectLogCommunicationRollout, "assertContract").mockResolvedValue();
  const list = spyOn(projectLogProjectCommentsV2Service, "list").mockResolvedValue({list:[],total:0,pageSize:20,has_more:false,next_cursor:null,can_write:false});
  const preview = spyOn(projectLogCommentPreviewsService, "list");
  // A permission denial must remain a failure, never an empty successful preview.
  preview.mockRejectedValue(Errors.forbidden());
  const url = `/project_logs/${id}/project-comments`;
  try {
    expect((await app.inject({url:url+"?contract_version=2"})).json().data.can_write).toBe(false);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({contract_version:2,pageSize:20}));
    expect((await app.inject({url:url+"?contract_version=2&pageSize=101"})).statusCode).toBe(400);
    expect((await app.inject({method:"POST",url,payload:{contract_version:2,client_request_id:id,content:"",attachment_ids:[]}})).statusCode).toBe(400);
    expect((await app.inject({method:"POST",url,payload:{contract_version:2,client_request_id:id,content:"图片",attachment_ids:[id,id]}})).statusCode).toBe(400);
    expect((await app.inject({method:"POST",url:`/projects/${id}/project-comment-previews`,payload:{contract_version:2,log_ids:[id]}})).statusCode).toBe(403);
    expect(routes).toContainEqual({url:"/projects/:projectId/project-comment-previews",access:"read"});
  } finally { await app.close(); }
});
test("cutover rejects old valid requests with 410 before v1 service executes", async () => {
  const { app } = await setup();
  const { projectLogCommunicationRollout } = await import("./project-log-communication-rollout");
  const { projectLogProjectCommentsService } = await import("./project-log-project-comments");
  spyOn(projectLogCommunicationRollout,"assertContract").mockImplementation(async version => {
    if (version === 1) throw Errors.business(410,"请更新小程序","PROJECT_COMMENT_CLIENT_UPDATE_REQUIRED");
  });
  const legacy = spyOn(projectLogProjectCommentsService,"create");
  try {
    for (const method of ["GET","POST"] as const) {
      const result = await app.inject({method,url:`/project_logs/${id}/project-comments`,...(method === "POST" ? {payload:{content:"旧评论"}} : {})});
      expect(result.statusCode).toBe(410);
      expect(result.json().code).toBe("PROJECT_COMMENT_CLIENT_UPDATE_REQUIRED");
    }
    expect(legacy).not.toHaveBeenCalled();
  } finally { await app.close(); }
});
test("all new routes reject anonymous requests", async () => {
  const { app } = await setup(true);
  try {
    for (const [method,url] of [
      ["GET",`/project_logs/${id}/project-comments?contract_version=2`],
      ["POST",`/projects/${id}/project-comment-previews`],
      ["POST",`/project_logs/${id}/project-comment-uploads/init`],
      ["POST",`/project_logs/${id}/project-comment-uploads/complete`],
      ["GET",`/project_logs/${id}/project-comments/${id}/attachments/${id}/url`],
    ] as const) expect((await app.inject({method,url})).statusCode).toBe(401);
  } finally { await app.close(); }
});
