# 固始晴天装饰抖音提审检查清单

目标租户：`3eebca47-961f-4899-b976-a3d3208d326b` / 固始晴天装饰工程有限公司  
目标商家安装：`82061c96-29ac-4426-baff-5efc1061fbc8` / AppID 后缀 `ccd301`  
记录日期：2026-08-22  
当前状态：开发库 readiness 已通过；浏览器与多宿主 smoke 尚未执行；未提交抖音审核。

## 1. 数据库与 migration

- 使用 `/Users/leefo/Public/work/gooes/.env` 的开发库连接。
- `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"` 已显示 Local/Remote 对齐至 `20260821105690`。
- `supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --dry-run` 返回 `Remote database is up to date`。
- 2026-08-22 10:50 CST fresh 复核：开发库仍无待执行 migration，dry-run 仍为 `Remote database is up to date`。

## 2. 上次审核反馈

最近 release：

- release id：`3073642f-4cf4-4f3a-9576-688247733659`
- template version：`0.1.3`
- 状态：`audit_rejected`
- host：`douyin`
- 驳回原因：抖音、抖音 Lite、抖音火山版均反馈“小程序功能不完整且可用性低，请丰富小程序内容和功能，提高用户体验”

## 3. 本次开发库内容补齐

### 公开资料

- 状态：`published`
- profile version：`5`
- 公司简介长度：168 字
- 服务区域：河南省 / 信阳市 / 固始县，active
- Logo：已配置到 merchant installation runtime_config
- 内容来源：工程侧草稿，经用户确认可用于开发库补齐 readiness

### 公开项目

已发布 6 个公开项目 profile，每个项目已选 3 张施工日志图片：

| 项目 ID | 公开标题 |
| --- | --- |
| `c20e4693-e3a8-47b8-840f-4fb3639d6420` | 固始本地三室两厅现代简约施工实景 |
| `f42bdb7f-5fb6-4213-af3c-7b8fde22b36b` | 三室两厅舒适型全屋装修过程 |
| `2d710a84-1045-4750-8dfd-51a0f463a4db` | 局部改造与基础施工现场记录 |
| `fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` | 本地住宅现代风完工实景 |
| `634ff402-ff84-4541-aa7c-3cdcd4fd5460` | 四室两厅品质型装修完工案例 |
| `54f11aa5-09a8-4410-a9c5-604a7fe9e09c` | 老房改善型装修完工实景 |

补充数据：

- 项目 `2d710a84-1045-4750-8dfd-51a0f463a4db` 的关联 property 已补齐 `area=118`、`layout=三室两厅`，用于满足公开项目完整性检查。

### 预算报价

- active pricing version：`1`
- pricing version id：`04eae302-a565-4cc0-ade3-a041424172c6`
- 状态：`active`
- 生效时间：`2026-08-22T02:21:54.573+00:00`
- 失效时间：无
- 报价项数量：9
- 免责声明长度：120 字

配置范围：

- 6 条基础报价覆盖经济型、舒适型、品质型在毛坯和旧房翻新下的组合；
- 3 条选配项：拆改项目、水电升级、定制柜；
- 预算为开发库提审就绪用配置，不代表最终商业报价。

## 4. Readiness 结果

执行命令：

```bash
cd apps/api
DOUYIN_RELEASE_REQUIRED_HOSTS=douyin \
  bun --env-file=/Users/leefo/Public/work/gooes/.env \
  src/scripts/douyin-release-readiness.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b
```

执行结果：

```json
{
  "status": "ready",
  "ready": true,
  "metrics": {
    "published_project_count": 6,
    "in_progress_project_count": 4,
    "completed_project_count": 2,
    "active_service_area_count": 1,
    "active_pricing_version": 1,
    "required_host_count": 1
  },
  "blockers": [],
  "warnings": []
}
```

退出码：`0`

2026-08-22 10:50 CST fresh 复跑仍通过：

```json
{
  "status": "ready",
  "ready": true,
  "checked_at": "2026-08-22T02:50:21.165Z",
  "metrics": {
    "published_project_count": 6,
    "in_progress_project_count": 4,
    "completed_project_count": 2,
    "active_service_area_count": 1,
    "active_pricing_version": 1,
    "required_host_count": 1
  },
  "blockers": [],
  "warnings": []
}
```

开发库只读数据复核：

- merchant installation：1 个，`authorization_status=active`，`installation_kind=merchant`，Logo 已配置；
- published public project profile：6 个，每个至少 3 张公开图片；
- active pricing version：`04eae302-a565-4cc0-ade3-a041424172c6` / version `1`；
- active pricing items：9 个，覆盖 6 个基础组合和 3 个选配项。

## 5. 静态验证

当前代码侧已执行：

- API readiness focused：35/35 pass
- Admin readiness focused：30/30 pass
- `bun run api:check`：pass
- `bun run douyin-mini:check`：198/198 + TypeScript pass
- `bun run admin:check`：pass
- `bun run check:permission-boundaries`：pass
- `bun run audit:supabase-writes`：exit 0；输出为既有候选列表，非本次新增失败

2026-08-22 10:56 CST fresh Task6 自动验证：

- Domain release/public-project/budget/lead focused：28/28 pass；
- API focused（在 `apps/api` 包上下文执行，避免根目录 alias 误报）：160/160 pass，1 个显式本地 DB integration skip；
- `cd packages/domain && bun run build`：pass，domain dist verified；
- `bun run api:check`：pass；
- `bun run douyin-mini:check`：198/198 + TypeScript pass；
- `bun run admin:check`：pass；
- `bun run check:permission-boundaries`：pass；
- `bun run audit:supabase-writes`：exit 0；仍输出 17 个既有 Supabase write 候选，未作为本次新增 blocker。

根目录直接混跑 API 测试会因 `@/` alias 只在 `apps/api` 包上下文解析而失败；该失败已定位为命令上下文问题，不是业务断言失败。

## 6. Host 配置

开发库当前最新 release 记录：

- release id：`3073642f-4cf4-4f3a-9576-688247733659`
- template id：`77595`
- template version：`0.1.3`
- channel：`default`
- `audit_host_names`：`["douyin"]`
- `ext_json` host 相关字段：`extAppid` 为目标 AppID；未记录 Lite / 火山独立 host 配置。

因此本轮 readiness 使用 `DOUYIN_RELEASE_REQUIRED_HOSTS=douyin`。若后续 release 配置新增抖音 Lite / 火山 / 头条 host，必须按新的 `audit_host_names` 重新执行全路径 smoke 和 readiness。

## 7. 待执行 smoke

以下仍未执行，不能视为最终可提审完成：

- [ ] 当前 `.env` 未配置 `PLAYWRIGHT_BASE_URL`、`GOOES_E2E_TENANT_ADMIN_*`、`GOOES_E2E_TENANT_ID`、`GOOES_E2E_DOUYIN_INSTALLATION_ID`，因此本轮无法自动执行登录态浏览器 smoke；
- [ ] 2026-08-22 11:57 CST 只读可达性检查：`https://api-dev.goodcms.cn/` 返回 200；`/health` 返回 401 `TOKEN_MISSING`，服务在线但无匿名 health；
- [ ] 2026-08-22 11:57 CST 只读可达性检查：`https://admin-dev.goodcms.cn/` 返回 307 到 `/dashboard`，`/douyin-miniapp/workspace` 未登录返回 307 到 `/login`；`/douyin-miniapp/leads`、`/douyin-miniapp/projects`、`/douyin-miniapp/budget` 当前返回 404，说明 admin-dev 当前部署/路由状态还不能执行完整抖音后台 smoke；
- [ ] 使用有效抖音小程序 session 验证 bootstrap 到目标租户；
- [ ] 验证项目列表、项目详情、项目日志分页；
- [ ] 验证预算初算和 AI 建议成功/失败路径；
- [ ] 验证短信验证码和免费量房预约提交；
- [ ] 验证后台收到线索；
- [ ] 验证人工分配、跟进、转客户和客户来源快照；
- [ ] 在真实浏览器中验证 Admin 项目发布、预算报价、就绪面板和线索工作台；
- [ ] 按实际配置 host 做小程序端到端路径验证；
- [ ] 清理 smoke 数据后重新运行 readiness。

## 8. 提审说明草稿

本版本提供真实装修项目实景、按面积和装修条件计算的预算初算、基于规则预算生成的 AI 个性化建议，以及短信验证后的免费量房申请。体验路径：首页 -> 项目实景 -> 预算初算 -> 免费量房。预算为初步估算，最终报价以现场量房、材料和施工范围为准。

## 9. 操作边界

- 当前仅完成开发库 readiness 补齐和代码静态验证；
- 尚未提交抖音审核；
- 审核提交必须等待用户单独明确授权；
- 若本次要覆盖抖音 Lite / 火山版等更多 host，需要以实际 release 配置重新传入 host list 并复跑 readiness。
