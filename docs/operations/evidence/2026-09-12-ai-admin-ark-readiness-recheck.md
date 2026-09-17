# AI 后台与方舟模型就绪性复核

日期：2026-09-12。状态：只读核验完成；真实登录态页面验收和两个可调用模型确认仍受阻，不能声明前两项整体完成。

## 范围

用户批准执行下一步 1–2：开发后台真实验收、明确方舟可用模型。未修改业务代码、数据库、密钥、供应商、模型或路由；未执行目录同步、开通云端服务、创建 Endpoint、收费推理、发布或生产操作。未修改 Orange。

本地源码基线 `0c30fab27`。开发 API/Admin 实际 revision 均为 `7ec16c8d92ef3612f5019ecda5f0454828e92b4b`，均 healthy。

## 开发后台验收边界

本轮 `cua.getState()` 初始化 30 秒超时并重置，没有取得浏览器或超管会话。已请求用户启用浏览器连接并登录开发后台，不要求发送密码、Token 或密钥。未读取浏览器凭据、伪造会话或绕过权限。

新鲜 HTTP 检查：

- API `/`：200。
- Admin `/login`：200。
- Admin 代理系统场景分页 GET：401 / `TOKEN_MISSING`。
- Admin 代理方舟图片模型候选分页 GET：401 / `TOKEN_MISSING`。

这些检查仅证明基本可达与未认证访问被拒绝，不证明鉴权后列表正确。场景只读身份、候选加载/搜索/分页、快速切换、密钥弹窗、删除确认和只读账号交互均未在真实开发会话验收。不得为了测试删除真实供应商或替换真实密钥；写交互需隔离测试对象。

## 当前开发数据：只读结果

SSH 首先断言主机 `VM-0-11-ubuntu`（43.165.126.30），经 `supabase-db` 的 psql 使用 `BEGIN READ ONLY`、10 秒 statement timeout、有界字段查询。未输出环境变量、连接字符串或秘密值。

- 迁移记录 616 条，latest `20260911151225`；本轮没有 migration 变更或应用，不冒充重新执行过 CLI migration list。
- 4 个供应商、3 个模型；方舟为 active / `openai_compatible`，地址精确匹配 `https://ark.cn-beijing.volces.com/api/v3`，引用为 `ARK_API_KEY`。
- 平台 `ARK_API_KEY` 为 active、is_secret=true、有值且带加密信封前缀。查询仅返回布尔状态，没有解密；这不证明凭据有效或账号已授权模型。
- `ARK_CATALOG_CREDENTIALS` 平台配置记录不存在；代码检索也没有该专用目录入口。已配置推理 API Key 不等于已经实现独立目录凭证。
- 方舟唯一模型：`doubao-seedream-5-0-pro-260628`，id `70e7d459-9c2c-4c6b-9788-6a6756893a5d`，登记为 text、输入 `["text"]`、active、probe unverified。
- 方舟 active/image 数量为 0；active/text 且输入含 image 的数量为 0。上述模型在场景主/备字段引用数为 0；本轮未重新穷尽价格、目录及其他历史引用，不能直接作为修复 migration 的完整预检。
- 系统场景 10 条，`decoration_raw_drawing` 为 image / not_connected，最少两张参考图。
- 原有路由 10 条，全行聚合 MD5 仍为 `fbab9c3950d0d352ad05d67917b1affe`。

### 空候选的数据链路

`use-ai-route-model-options.ts` 按场景模态发送分页请求；`AiConfigService.listRouteModelOptions` 对非 OpenRouter 供应商读取内部模型，`AiConfigRepository.listRouteModels` 按 provider、modality、status 过滤后 `.range()`。方舟尚无自动目录查询适配；无 image 记录时图片候选为空符合当前查询结果。文本手工候选只在文本查询含关键词时生成，不是官方目录发现。

这是代码与数据库层面的原因证据，不是已经在真实浏览器复现原始点击故障。不能通过把未核实的模型强改 image、绕过 not_connected 或伪造目录来解决。

## 官方文档的新证据及限制

本轮新发现官方 [volcengine/ark-cli](https://github.com/volcengine/ark-cli/tree/a1206b859b8837146b6102c6f378a117be496dc2)，固定提交 `a1206b859b8837146b6102c6f378a117be496dc2`。仅将其作为公开参考文档，没有安装或运行 CLI、登录 SSO、读取 CLI 缓存或执行文档中的云端命令。

- [models 说明](https://github.com/volcengine/ark-cli/blob/a1206b859b8837146b6102c6f378a117be496dc2/skills/arkcli-models/SKILL.md) 明确解释其 list/search 输出的 name 与非空 primary_version 组成完整调用 ID，空版本有例外。这比此前“未取得任何官方映射依据”有所推进，但不等于任意 `ListFoundationModelVersions.ModelVersion` 都可套用，或当前账号可调用。
- [search 数据流](https://github.com/volcengine/ark-cli/blob/a1206b859b8837146b6102c6f378a117be496dc2/skills/arkcli-models/references/arkcli-models-search.md) 明确先取 ListFoundationModels，再用 ArkModels 补充能力。ArkModels 是需要 SSO 的 Console BFF；只有 AK/SK 时会跳过能力补充。不能将它冒充已验证的公共 AK/SK 模型能力接口，也不能复制其无上限搜索行为到本项目列表。
- [get 说明](https://github.com/volcengine/ark-cli/blob/a1206b859b8837146b6102c6f378a117be496dc2/skills/arkcli-models/references/arkcli-models-get.md) 为精确版本参数给出 `ListModelMetaDatas` 的新线索；尚未取得该接口完整公开鉴权、分页、响应合同，不能凭名称实现。
- 尚未取得 `/api/v3/models` 的正式中国区合同，也没有当前账号的只读目录响应。现有历史型号的精确官方证明、版本级双图和尺寸能力仍未完成；第三方博客即使有同名字串也不能作为自动修库依据。
- 官方网页部分请求被重定向或只返回无 MDContent 的页面壳，未将 HTTP 200 当作读取正文成功。独立研究代理短暂取得版本列表正文，仍只有 family/version/configuration 字段；随后同入口也返回壳，不能保证稳定复现。

结论：可依据新官方 CLI 文档进一步设计“主版本候选映射”，但完整可绑定目录、版本能力和账号授权门禁尚未通过。没有证据支持把所有方舟模型同步并启用。

## 新鲜离线验证

在 `apps/api` 执行：

```sh
bun test src/services/ai-config/index.test.ts src/services/ai-config/scene-routes.test.ts src/repositories/ai-config.test.ts src/gateways/ark-rendering/client.test.ts
```

结果：56 pass、0 fail、179 assertions。覆盖分页候选、场景身份/未接通保护、双图请求及错误分类；全部为离线测试，不代替开发鉴权、供应商账号、图片质量或付费调用验收。

## 继续所需条件

1. 恢复 Codex 浏览器连接，在开发超管登录会话完成真实页面只读验收。
2. 从用户方舟控制台取得生图与视觉理解两个已开通模型的准确调用 ID 和能力说明（截图需遮掉秘密），或在另行确认后通过官方 CLI 的用户登录态做有界只读核验。不索要聊天中的 AK/SK、API Key 或 Token。
3. 核实模型后才能规划安全登记/历史修复、目录实现和生成业务接入。数据库修正仍须 migration；付费样本验证需另行确认样本和调用上限。
