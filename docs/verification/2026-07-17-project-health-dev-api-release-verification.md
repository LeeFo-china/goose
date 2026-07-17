# 项目健康页 dev API 发布验证记录

日期：2026-07-17  
仓库：`gooes`  
分支：`main`  
验证提交：`ef1bca8077e9fceda157b7d9cd9fc2b7013b46a4`

## 问题现象

Admin dev 页面：

```text
https://admin-dev.goodcms.cn/project-health
```

登录态访问项目健康页时提示后端接口不存在：

```text
GET /project-health/risks?page=1&pageSize=20 不存在
```

对应 Admin 代理请求为：

```text
GET /api/backend/project-health/risks?page=1&pageSize=20
```

## 根因

dev 环境前后端版本不一致：

- `gooes-admin-dev` 已部署到包含项目健康页的较新 Admin 镜像。
- `gooes-api-dev` 仍停留在旧镜像 `98be8e9af1bc5c117b23e9223a1a85899c6c3612`。
- 旧 API 容器源码内没有 `ProjectHealthController`，因此登录态请求会进入后端 404。

排查时未登录请求返回 `401 TOKEN_MISSING`，不能证明路由存在，因为全局鉴权会先于后端 404 拦截未登录请求。使用登录态复测后，问题表现为真实路由缺失。

旧 API 容器排查证据：

```text
/gooes-api-dev useccr.ccs.tencentyun.com/america_goose/goose-api:98be8e9af1bc5c117b23e9223a1a85899c6c3612 98be8e9af1bc5c117b23e9223a1a85899c6c3612 29483615319
```

容器内源码未找到项目健康控制器：

```bash
docker exec gooes-api-dev sh -lc "grep -R \"ProjectHealthController\" -n /app/apps/api/src 2>/dev/null | head"
```

结果为空。

## 处理动作

手动触发 dev API 发布：

```bash
gh workflow run release-dev.yml \
  --ref main \
  -f service=api \
  -f operation=release \
  -f reason='deploy project-health api routes to dev'
```

GitHub Actions：

```text
Run ID: 29551259437
Name: Dev release api from main
Head SHA: ef1bca8077e9fceda157b7d9cd9fc2b7013b46a4
Conclusion: success
URL: https://github.com/LeeFo-china/goose/actions/runs/29551259437
```

关键阶段：

```text
Prepare immutable development release            success
Build immutable development images / Build api   success
Verify development migration history / verify    success
Deploy API / Deploy dev                          success
Require build, migration, and API readiness      success
Summarize development release                    success
```

## 发布后验证

开发服务器容器版本：

```text
/gooes-api-dev useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:b17b52ce57358b88e21fa5f09a9850d8fdd215c84af48bfb30d734bf2ff8b244 ef1bca8077e9fceda157b7d9cd9fc2b7013b46a4 29551259437
/gooes-admin-dev useccr.ccs.tencentyun.com/america_goose/goose-admin@sha256:c182a7c076bea94606241793a313c7ce69cfe1d723c9a8d0de7bd77a0b676e66 9fc1179205183d271a0798e09fb03a705da63af9 29548958418
```

说明：

- API 已更新到 `ef1bca80`。
- Admin 仍为 `9fc11792`，后续 `ef1bca80` 是文档提交，不影响 Admin 运行时代码。

API 容器内源码已包含项目健康控制器和路由注册：

```text
/app/apps/api/src/controllers/project-health/index.ts:14:class ProjectHealthController extends TenantBaseController
/app/apps/api/src/controllers/project-health/index.ts:79:export default new ProjectHealthController();
/app/apps/api/src/routes/index.ts:85:import ProjectHealthController from "@/controllers/project-health";
/app/apps/api/src/routes/index.ts:171:  ProjectHealthController.registerExtraRoutes(app);
```

使用租户管理员 `18800000001` 登录 dev Admin 后，通过 Admin 代理复测：

```bash
curl -c "$cookie_jar" \
  -H 'content-type: application/json' \
  -X POST 'https://admin-dev.goodcms.cn/api/auth/login' \
  --data '{"phone":"18800000001","code":""}'

curl -b "$cookie_jar" \
  'https://admin-dev.goodcms.cn/api/backend/project-health/risks?page=1&pageSize=20'
```

结果摘要：

```text
login_status=200
risks_status=200
{"code":null,"message":"success","hasItems":true,"total":1}
```

结论：

- `GET /api/backend/project-health/risks?page=1&pageSize=20` 登录态返回 `200`。
- 用户反馈的问题已由 dev API 发布解决。

## 复发风险与后续建议

本次问题属于“Admin 已部署新页面，但 API 未同步部署新路由”的环境版本不一致问题。建议补充发布后 smoke：

1. API 或 Admin dev 发布后，使用 dev 租户管理员账号登录。
2. 请求 `GET /api/backend/project-health/risks?page=1&pageSize=20`。
3. 若响应为 `ROUTE_NOT_FOUND` 或 HTTP `404`，直接判定发布失败。

该 smoke 只读，不触发 AI 摘要真实调用，不产生业务数据写入。

## 防复发改动

已在 dev 发布 workflow 中补充项目健康只读 smoke：

```text
.github/workflows/deploy-dev.yml
scripts/deploy-dev-workflow-contract.test.ts
```

触发范围：

- 发布 `api` 后执行。
- 发布 `admin` 后执行。
- 发布 `web`、worker 或其他非相关服务不执行。

smoke 行为：

1. 使用 dev 租户管理员 `18800000001` 调用 `POST /api/auth/login` 获取登录 cookie。
2. 请求 `GET /api/backend/project-health/risks?page=1&pageSize=20`。
3. 校验响应 HTTP 为 `200`，并且响应体满足当前 `ResponseHandler.success` 结构：

```text
message === "success"
data.items 是数组
```

如果后端仍为旧 API，登录态请求会返回 `ROUTE_NOT_FOUND` 或 HTTP `404`，发布流程会在 `Check dev services` 阶段失败，避免同类问题进入人工验收阶段。

本地契约测试：

```bash
bun test scripts/deploy-dev-workflow-contract.test.ts --timeout 20000
```

结果：

```text
10 pass
0 fail
84 expect() calls
```
