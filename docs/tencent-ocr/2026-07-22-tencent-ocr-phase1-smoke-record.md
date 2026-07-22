# 腾讯云 OCR 一期验收记录

## 1. 结论

- 代码实现、自动化测试、API/Admin 构建、数据库 migration 和远端只读审计通过。
- 远端 `TENCENT_OCR_ENABLED=false`，当前不会向租户 Admin 或小程序暴露识别能力。
- 已使用腾讯云官方演示营业执照和银行卡图片取得成功识别结果，并使用官方营业执照图片的模糊派生样本验证安全失败路径；样例及识别字段值未写入仓库或验收记录，也未提交微信支付进件。
- 一期当前状态为“代码就绪，发布门禁未解除”，不能标记为生产可用。

未解除的发布门禁：

1. 尚未取得并验证腾讯云身份证加密识别公钥及真实加密接口样本。
2. 腾讯官方演示营业执照、模糊派生样本和银行卡样本已验证；身份证正反面仍缺少腾讯加密接口公钥和明确授权样本。
3. 当前 OCR 凭据可调用一期范围外的 `GeneralBasicOCR`，CAM 最小权限门禁未通过；必须换成只关联一期策略的新子用户凭据。
4. `OCR_RESULT_ENCRYPTION_KEY` 已按 development/production 环境分别配置，但生产 API 尚未发布密钥注入契约。
5. 小时级清理 workflow 已合入 main，但生产 API 尚未发布对应版本，仓库定时开关尚未配置，也没有生产运行证据。

## 2. 版本范围

实现分支：`feature/tencent-ocr-phase1`；发布基线已合入 `main`。

核心提交：

- `c3d606cd feat(db): 建立OCR识别记录`
- `324ef26d feat(ocr): 接入腾讯云识别网关`
- `81460ba6 feat(ocr): 编排租户证照识别`
- `26762386 feat(api): 提供OCR识别接口`
- `f40f49d9 feat(ocr): 清理过期识别结果`
- `8920b8bd feat(admin): 增加OCR配置与调用记录`
- `414ee922 feat(finance): 支持进件证照识别回填`
- `f582a550 fix(ocr): 按配置收敛可用能力`
- `899ac39a ci(ocr): 调度过期识别结果清理`
- `10a7501f fix(ci): 延后启用OCR清理调度`
- `a0f52aea fix(ocr): 默认关闭身份证加密识别`
- `1167a903 ci(ocr): 注入结果加密密钥`
- `cb09ab3b docs(ocr): 记录开发环境连通性验收`
- `e6e1e5c3 fix(ocr): 修复成功结果加密边界`
- `43f780b2 fix(ocr): 拒绝回填不完整证照日期`
- `3c681447 feat(ocr): 增加CAM最小权限预检`

## 3. 静态门禁

执行日期：2026-07-22（Asia/Shanghai）

| 检查                                                                  | 结果 | 证据                                        |
| --------------------------------------------------------------------- | ---- | ------------------------------------------- |
| Domain OCR 契约与权限                                                 | 通过 | 11 tests passed                             |
| API OCR、controller、repository、清理、进件 schema 和敏感存储聚焦回归 | 通过 | 95 tests passed                             |
| Admin OCR 配置/审计、进件回填和支付进件聚焦回归                       | 通过 | 35 tests passed                             |
| 生产清理调度契约                                                      | 通过 | 3 tests passed，YAML syntax ok              |
| API typecheck/build/file-size                                         | 通过 | Bun build 成功，文件大小检查通过            |
| Admin typecheck/file-size                                             | 通过 | Next typegen、TypeScript 和文件大小检查通过 |
| `git diff --check`                                                    | 通过 | 无空白错误                                  |

说明：API Bun 测试必须从 `apps/api` 目录运行，才能加载该包 `tsconfig` 中的 `@/` 别名；从仓库根目录直接传 API 文件路径会产生模块解析错误，不属于业务测试失败。

## 4. Migration 与远端只读审计

`supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"`：

- `20260722130000` Local：存在。
- `20260722130000` Remote：存在。
- `20260722150000` Local：存在。
- `20260722150000` Remote：存在。
- `20260722170000` Local：存在。
- `20260722170000` Remote：存在。
- Local/Remote：对齐。

通过 service-role REST 只读查询确认：

| 项目                                    | 结果                        |
| --------------------------------------- | --------------------------- |
| OCR 平台配置                            | 11 项 active                |
| 敏感 OCR 配置                           | 3 项                        |
| `ocr.recognize`                         | active                      |
| `platform.ocr.recognition.read`         | active                      |
| `TENCENT_OCR_ENABLED`                   | `false`                     |
| `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED` | `false`                     |
| `ocr_recognitions` 记录数               | 6（3 条成功、3 条失败审计） |

迁移源码同时定义并已随 migration 应用：强制 RLS、主键索引和 7 个显式索引、租户幂等
唯一索引、活跃结果去重索引、结果过期索引、平台文档类型筛选排序索引，以及无客户端 policy
的 service-role 访问边界。

`20260722150000` 是前向安全修正：仅当 OCR 总开关仍为 `false` 时，把全局身份证加密识别
能力收敛为 `false`。远端只读复核确认两个开关当前均为 `false`。

`20260722170000` 为平台分页审计的 `document_type + created_at DESC` 增加前向索引，避免按
文档类型筛选时随记录增长退化为全表扫描。

## 5. 自动化场景证据

| 场景                                             | 结果 | 证据类型                   |
| ------------------------------------------------ | ---- | -------------------------- |
| 营业执照字段和有效期标准化                       | 通过 | normalizer test            |
| 模糊/复印件告警映射                              | 通过 | normalizer test            |
| 身份证正反面加密请求及响应解密                   | 通过 | gateway test               |
| 禁止身份证明文接口降级                           | 通过 | gateway test               |
| 银行卡字段和清晰度告警                           | 通过 | normalizer/gateway test    |
| 跨租户或无权文件拒绝                             | 通过 | service test               |
| 未绑定文件仅允许上传员工识别                     | 通过 | service test               |
| 未绑定结果仅允许原员工读取，业务结果复核进件权限 | 通过 | service test               |
| 幂等键重放不重复调用 provider                    | 通过 | service test               |
| 幂等键换请求复用返回 409                         | 通过 | service test               |
| 同文件同文档类型命中缓存                         | 通过 | service test               |
| 唯一键竞争只读取胜出记录                         | 通过 | service test               |
| 每日额度超限在 provider 前拒绝                   | 通过 | service test               |
| 结果加密不含身份证号/地址明文                    | 通过 | crypto test                |
| 过期结果拒绝解密并返回 410                       | 通过 | service test               |
| 进件敏感值继续走原加密保存                       | 通过 | sensitive integration test |
| OCR 关闭时能力列表为空                           | 通过 | service/controller test    |
| 结果加密密钥缺失时隐藏能力且不调用 provider      | 通过 | service test               |
| 身份证加密开关关闭时隐藏身份证能力               | 通过 | service test               |

## 6. Admin 交互证据

2026-07-22 在隔离 worktree 启动临时 API `127.0.0.1:3300` 和 Admin
`127.0.0.1:3310`，完成发布前只读 smoke。测试结束后关闭两个临时服务，不影响 main
工作区服务。

| 页面/接口                                          | 结果                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/settings?group=ocr`                              | 配置分组、总开关、身份证加密开关和配置测试入口可见；总开关和身份证开关均为关闭                     |
| `/platform/ocr`                                    | 分页审计页和空状态正常，未展示识别字段或文件地址                                                   |
| `/finance/wechat-pay/applyment`                    | 原手工填写表单可用；总开关关闭时不展示 OCR 操作，不阻断进件资料维护                                |
| `GET /ocr/capabilities?scene=wechat_pay_applyment` | HTTP 200；`data` 为长度 0 的数组；未包含 secret、token、证件号、银行卡号、signed URL 或 object key |

开发环境发布后只读复核：

- `18800000001 / 风清扬` 具备 `ocr.recognize`，能力接口返回 HTTP 200、能力数 0，符合总开关关闭的预期。
- `18800005001 / 小龙女` 不具备 `ocr.recognize`，能力接口返回 HTTP 403 `FORBIDDEN`；这是权限边界，不是 OCR 服务故障。

最终三页面浏览器复测未发现 console error 或接口 4xx/5xx。全过程未调用识别接口、未上传
证件、未创建识别记录、未保存或提交微信支付进件，也未推进 workflow。

自动化源码契约和类型检查确认：

- 平台系统配置包含“腾讯云 OCR”分组，密钥继续使用现有密码遮罩控件。
- 配置测试只接受 2MB 内 JPEG/PNG，调用前要求确认图片授权并提示可能计费。
- 配置测试只展示状态、RequestId、耗时和 warning code，不展示识别字段。
- `/platform/ocr` 使用后端 `page/pageSize` 分页，不在前端对当前页做总量过滤。
- 平台列表不渲染识别字段值、文件对象 ID、图片 URL 或 signed URL。
- 进件附件只接受 JPEG/PNG，并持久化 `file_object_id`。
- 识别结果弹窗按“空值默认选中、相同默认不选、有差异默认不选”处理。
- 经办人身份证字段映射到经办人/超级管理员字段，不覆盖法人字段。
- “应用所选字段”只更新当前表单；没有 create、update、submit 或 workflow 调用。

发布后已使用腾讯官方营业执照演示图片完成真实上传、识别、差异弹窗和选择回填浏览器验证，
证据见 6.4 节。验证只更新浏览器内存中的表单状态，未保存草稿、未提交正式微信进件，也未触发
workflow。

### 6.1 开发环境密钥与合成图连通性验证

2026-07-22 后续门禁推进结果：

- 本地受控环境已存在独立的 `TENCENT_OCR_SECRET_ID/SECRET_KEY`；只核验变量存在性和长度，未输出密钥值。
- 两项密钥已通过平台设置接口写入开发环境加密配置；总开关和身份证加密开关继续保持 `false`。
- 官方 Node SDK 使用 1×1 空白 PNG 分别调用 `BizLicenseOCR` 和 `BankCardOCR`，两次均取得腾讯 RequestId，并返回 `FailedOperation.OcrFailed`；没有鉴权或无权限错误，证明凭证和两个 Action 可达。
- 同一凭据使用空白 PNG 探测一期范围外的 `GeneralBasicOCR`，取得腾讯 RequestId 并返回 `FailedOperation.ImageDecodeFailed`，而非 CAM 无权限错误。这直接证明当前凭据权限过宽，不能作为一期生产凭据。仓库已增加 `deploy/tencent-ocr-phase1-cam-policy.json` 和自动契约测试，要求替换为只允许三个一期 Action 的独立 CAM 子用户凭据。
- 使用 ImageMagick 生成带“仅用于 OCR 联调、非真实证照”标识的合成营业执照 PNG。腾讯返回 `FailedOperation.NoBizLicense`，符合该图片不是真实证照的预期；该图片不包含真实主体或个人信息。
- development 与 production GitHub Environment 已分别创建独立的 `OCR_RESULT_ENCRYPTION_KEY`，值未写入仓库、数据库、日志或文档。
- 提交 `7caa0fc5` 为开发/生产 API Compose 增加必填密钥，并由对应 Environment secret 注入发布 workflow；缺少密钥时发布在容器重建前失败关闭。
- 开发 API 通过受控 `Release Dev` run `29900583442` 发布成功，commit 为 `7caa0fc5`；构建、migration 历史校验、Compose 重建和健康检查均通过。
- 发布后仅在脚本 `try/finally` 范围内临时开启总开关，调用 `/platform/ocr/config-test` 识别上述合成图；接口返回 HTTP 502 `OCR_PROVIDER_FAILED` 且包含 provider RequestId，证明开发 API 已使用平台加密配置访问腾讯 OCR。测试接口不保存图片或识别字段。
- `finally` 关闭后只读复核：`TENCENT_OCR_ENABLED=false`、租户能力数 0、平台识别审计总数 0。
- 部署契约随后合入 `main@cb09ab3b`。主线 Build run `29901320353` 和 Auto Deploy Dev run `29901617304` 均成功，API、workers、Web 发布及 Web gate 全部通过。
- 主线自动部署后再次只读复核：开发 API 健康检查 HTTP 200；OCR SecretId/SecretKey 均显示已配置；`TENCENT_OCR_ENABLED=false`、`TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED=false`、租户能力数 0、平台识别审计总数 0。未执行识别、上传、回填或 workflow 推进。

该证据解除“凭证完全未配置”和“开发 API 结果密钥未注入”门禁，但同时确认 CAM 最小权限
尚未达标；它不等同于有效证照识别成功，也不证明字段差异回填、加密身份证或生产清理调度
可用。

### 6.2 开发环境上传、幂等与租户隔离负向 Smoke

2026-07-22 使用明确标注“测试样本、仅用于 OCR 联调、非真实证照”的合成 PNG 执行。图片不含
真实主体、证件号码、银行卡号或个人信息；未提交微信支付进件。识别操作租户为
`5f9404fd-23a7-4686-a606-b2627a65611d`，跨租户文件归属
`3eebca47-961f-4899-b976-a3d3208d326b`。

| 检查                                    | 结果                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| COS direct-init / PUT / direct-complete | 通过；`file_id=c7e32f3c-2958-417d-addf-55722d3256a2`                                                                                                 |
| 首次 `POST /ocr/recognitions`           | HTTP 502 `OCR_PROVIDER_FAILED`；腾讯返回 `FailedOperation.NoBizLicense`，符合非真实证照预期                                                          |
| 失败审计                                | 新增 `recognition_id=cef862f9-ab7f-482e-8d37-3d949f2618cc`，状态 `failed`，provider RequestId `8108d51e-38f3-4979-856d-aae6b6b7c8c5`，未保存识别字段 |
| 原请求与原幂等键重放                    | HTTP 200；返回同一 recognition，`idempotent=true`、`cached=false`，未再次调用 provider                                                               |
| 同幂等键更换文档类型                    | HTTP 409 `OCR_IDEMPOTENCY_CONFLICT`                                                                                                                  |
| 默认日额度负向探针                      | 临时设置日额度为 1 后返回 HTTP 429 `OCR_DAILY_LIMIT_EXCEEDED`；审计总数不变，未调用 provider                                                         |
| 跨租户文件 ID 识别                      | HTTP 404 `OCR_FILE_NOT_FOUND`；审计总数不变，未调用 provider                                                                                         |
| 本租户读取失败记录                      | HTTP 200，状态 `failed`                                                                                                                              |
| 其他租户读取该 recognition              | HTTP 404 `OCR_RECOGNITION_NOT_FOUND`                                                                                                                 |
| 平台分页失败审计                        | HTTP 200、`total=1`；响应未包含结果密文、object key、signed/image URL、识别字段值或合成图文字                                                        |
| 测试结束状态                            | `TENCENT_OCR_ENABLED=false`；能力数 0；新识别返回 503 `OCR_DISABLED`；审计总数由 0 变为 1，只有上述合成图失败记录                                    |

开关修改均在脚本 `try/finally` 内执行。跨租户文件探针使用另一租户已有文件 ID，但后端在
tenant-scoped 文件查询处即返回 404，因此没有读取文件内容、生成 signed URL 或进入腾讯 OCR。
日额度探针把 `TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT` 从 100 临时调整为 1，验证 429 后恢复为
100；该请求没有创建第二条识别记录。
本节证明上传登记、provider 失败审计、幂等重放、幂等冲突和租户隔离的开发环境运行态契约；
不证明成功结果加密/解密、成功结果缓存、真实字段识别或 Admin 差异回填。

### 6.3 官方演示样例成功链路与模糊样例回退

2026-07-22 使用腾讯云官方 API 文档提供的演示图片继续执行开发环境 smoke：

- 营业执照来源：<https://cloud.tencent.com/document/api/866/36215>；本地临时下载文件
  SHA-256 为 `d6af048cb3d31e3ccd21a3acbfd86188a40a61126c6d53c61b36f7c2f3f3a05b`。
- 银行卡来源：<https://cloud.tencent.com/document/api/866/36216>；本地临时下载文件
  SHA-256 为 `18e7b76c8010b389fc92ab3f4952d870c7e8f95dffb8a672226e111a0de61317`。
- 模糊营业执照由上述官方营业执照临时文件执行 ImageMagick 高斯模糊 `0x8` 生成，
  SHA-256 为 `864896f32383a76d2c9050d430883037bd0a55cf573e8b262369c8fc20b35cd2`。
- 三张图片均只保存在 `/tmp`，未加入 Git；以下只记录字段 key、计数和安全审计元数据，
  不记录 COS URL、object key 或任何识别字段值。

首次通过完整 API 链路调用官方营业执照样例时，腾讯 provider 已返回成功，但后端返回
`OCR_RESULT_INVALID`。根因是 `normalizeOcrResponse` 的返回对象同时包含业务结果和
`providerRequestId`，服务把整个对象传入严格的 `OcrNormalizedResultSchema` 加密校验，导致
provider 元数据被误判为非法业务字段。该次失败审计为
`bd2ffd57-987a-4d6e-ac4e-99d165e3956b`，未保存结果密文或字段值。

提交 `e6e1e5c3` 将 `providerRequestId` 从加密输入中分离，并新增单测锁定加密边界。聚焦 OCR
及进件安全回归共 75 项通过，API typecheck、build 和文件大小检查通过。开发镜像 build run
`29906279526` 与 API deploy run `29906490565` 均成功，精确发布 commit 为 `e6e1e5c3`。
自动发布和完整 Release Dev 工作流当时处于手工关闭状态，因此使用活动的
`Build Docker Images` 与 `Deploy Dev` 工作流完成不可变镜像发布；一次直接复用 push build
证据的 deploy run `29906094190` 被证据校验按设计拒绝，没有更新运行服务。

| 场景                 | 脱敏结果                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 官方营业执照成功识别 | `file_id=d37a120e-376f-4196-bdfc-c7d15a836dca`；`recognition_id=cf8cbf8b-b3c5-4057-974a-83449061f2d4`；RequestId `7b9675c2-d97e-492b-b9d6-9a5b2e217098`；HTTP 200、`succeeded`                                                        |
| 营业执照稳定字段     | 6 个 key：`license_name`、`license_code`、`license_address`、`license_period_begin`、`license_period_end`、`legal_representative_name`；warning 为 `DOCUMENT_COPY_SUSPECTED`                                                          |
| 成功结果加密和读取   | 数据库密文长度 1410；`result_summary` 仅含 `field_keys`、`sensitive_field_count`、`warning_codes`；API 解密读取字段数仍为 6；密文和摘要均不含识别字段明文                                                                             |
| 幂等重放             | 原幂等键返回同一 recognition，`idempotent=true`、`cached=false`；未新增审计                                                                                                                                                           |
| 成功缓存             | 同文件、同类型、新幂等键返回同一 recognition，`idempotent=false`、`cached=true`；未新增审计                                                                                                                                           |
| 官方银行卡成功识别   | `file_id=af124df9-347f-4e70-844a-a24d2706fc8d`；`recognition_id=ad1285fe-470e-4856-8a47-154d127bac80`；RequestId `176a89f0-987f-4fe4-ad36-a7743018d4c3`；HTTP 200、`succeeded`                                                        |
| 银行卡稳定字段       | 3 个 key：`settlement_account_number`、`settlement_bank_name`、`settlement_card_type`；无 warning                                                                                                                                     |
| 银行卡加密存储       | 数据库密文长度 669；安全摘要结构正确，密文和摘要不含识别字段明文；`billable_units=1`                                                                                                                                                  |
| 模糊营业执照回退     | `file_id=28037bca-07d3-47bd-be3c-1f91fa5e415d`；`recognition_id=8fd32180-0f86-4b68-878f-8fcb84540048`；RequestId `a06bf949-562c-4dfb-adbd-9bf15aa067d9`；HTTP 502 `OCR_PROVIDER_FAILED`，provider code `FailedOperation.NoBizLicense` |
| 模糊样例安全存储     | 状态 `failed`，字段数 0、无密文、`billable_units=0`；客户端应保留原表单并提示重拍或手工录入，不得自动回填                                                                                                                             |
| 审计与关闭状态       | 三个新场景使审计总数从 2 增至 5；每个 provider 首次调用只增加一条记录。全部脚本 `finally` 后 `TENCENT_OCR_ENABLED=false`，租户能力数为 0                                                                                              |

本节解除营业执照、银行卡、成功结果加密/解密、成功缓存和模糊样例安全回退的运行态门禁。
仍未完成加密身份证正反面验收；CAM 凭据也仍需收敛到仓库策略后才能作为生产凭据。Admin
差异弹窗和选择回填已在后续日期规范修复发布后完成，见 6.4 节。

### 6.4 不完整证照日期防护与 Admin 字段复核

腾讯官方营业执照演示图片的营业期限开始值可能只包含年月。原 normalizer 会把该原始值标记为
已标准化，Admin 的 HTML 日期控件随后拒绝显示，形成“识别成功但日期无法可靠回填”的契约
缺口。提交 `43f780b2` 改为只接受完整且有效的日期；不完整日期不进入稳定字段，也不推测日期，
同时返回 `DOCUMENT_DATE_INCOMPLETE` warning。聚焦 OCR 与进件回归 76 项通过，API typecheck、
build 和文件大小检查通过。

开发镜像 build run `29908198534` 和 Auto Deploy Dev run `29908494301` 均成功，精确发布
commit 为 `43f780b206181801f347222f3d50238da88eb39d`。发布后使用腾讯官方营业执照演示图片的重新
编码副本执行全链路复测，临时文件 SHA-256 为
`01eca8a84722f47dc451bfd4e6a9b053a6c90637099c0fa61770a8c4e7e6c841`，未加入 Git。

| 检查 | 脱敏结果 |
| --- | --- |
| API 成功识别 | `file_id=958792b3-1c51-463d-81ea-6b641b9b1d3e`；`recognition_id=0a9919e9-12ab-4448-abf4-7d70b12d5641`；RequestId `58482581-bc6a-443a-af09-1dc63ddfdde1`；HTTP 200、`succeeded` |
| 日期防护 | 返回 5 个稳定字段 key，未包含 `license_period_begin`；warning 为 `DOCUMENT_DATE_INCOMPLETE`、`DOCUMENT_COPY_SUSPECTED`；没有补造日期 |
| 安全存储 | 成功结果有密文，`billable_units=1`；文档不记录识别字段值、COS URL、object key 或 signed URL |
| 审计变化 | 首次 provider 调用使审计总数从 5 增至 6；测试结束后 `TENCENT_OCR_ENABLED=false`、租户能力数 0 |
| Admin 字段复核 | 复核弹窗显示上述 5 个字段且默认选中；两个 warning 均可见；点击“应用所选字段”后 5 个建议值均进入当前表单 |
| 写操作边界 | Admin UI 复测命中成功缓存，审计保持 6；没有保存草稿、提交进件或调用 workflow |

![Admin OCR 字段复核脱敏截图](assets/2026-07-22-admin-field-review-masked.png)

截图已遮盖当前值和识别建议值，只保留字段标签、warning 和交互状态。浏览器复测没有 API
4xx/5xx；COS 直传首次请求存在开发域名 CORS console error，但现有
`/api/uploads/cos/direct-proxy` 回退成功，因此上传和识别链路可用。使用项目已安装的
`cos-nodejs-sdk-v5` 只读检查确认，存储桶允许生产 Admin 和小程序来源，但未允许
`https://admin-dev.goodcms.cn`。本轮没有修改远端 COS；如需消除回退和 console error，须经
基础设施变更确认后为开发域名增加精确 CORS origin，不能放宽为通配来源。

### 6.5 CAM 最小权限运行态预检

提交 `3c681447` 增加 `bun run ocr:cam:readiness`。命令使用仓库锁定版本的腾讯云 OCR SDK，
以嵌入的 1×1 空白 PNG 顺序探测三个一期 Action 和一个明确排除的 `GeneralBasicOCR`。它不读取
业务文件、不保存识别结果，只输出 Action、期望、判定、provider code 和 RequestId；凭据、
请求体及 provider message 均不输出。四个判定场景单测通过，API typecheck、build 和文件大小
检查通过。

2026-07-22 使用 `apps/api/.env` 当前凭据执行，命令按设计退出 1，脱敏结果如下：

| Action | 期望 | 实际 | RequestId | 判定 |
| --- | --- | --- | --- | --- |
| `BizLicenseOCR` | 允许 | `FailedOperation.ImageDecodeFailed` | `076acf92-7afc-4596-85d0-964a5b098501` | 通过，已到达业务校验 |
| `BankCardOCR` | 允许 | `FailedOperation.ImageDecodeFailed` | `1e263ac1-74e8-4abd-8dab-76bb93cb421a` | 通过，已到达业务校验 |
| `RecognizeEncryptedIDCardOCR` | 允许 | `FailedOperation.UnKnowError` | `d39bb033-4e77-4297-bb3c-ef1b3c4fa0f4` | 通过，已到达业务校验 |
| `GeneralBasicOCR` | 拒绝 | `FailedOperation.ImageDecodeFailed` | `80da927c-a341-4672-9e18-1edbc0cd833a` | 失败，范围外 Action 仍可调用 |

结论：`ready=false`。当前凭据可继续用于隔离开发环境排查，但不能作为一期生产凭据。平台安全
管理员创建只绑定 `deploy/tencent-ocr-phase1-cam-policy.json` 的独立 CAM 子用户并替换密钥后，
必须重新运行该命令，且只有三个目标 Action 通过、`GeneralBasicOCR` 返回权限拒绝时才能解除
门禁。

## 7. 清理任务证据

2026-07-22 已对目标数据库执行：

- dry-run：成功，候选 0，更新 0。
- apply：成功，候选 0，更新 0。

这些结果证明命令和目标数据库连接可用，不证明过期记录实际清理，也不替代生产小时级调度器证据。读取过期结果返回 410、apply 清空 `result_ciphertext` 的行为已有自动化测试。

生产调度定义已增加到 `.github/workflows/ocr-result-cleanup.yml`：每小时第 17 分钟执行、
10 分钟超时、固定 concurrency 防止并行、复用健康的生产 API 容器。apply 在一个任务内按
500 条一批连续处理，最多执行 20 批；超过 10,000 条仍有积压时失败告警，并保存 30 天脱敏
artifact。定时事件还要求仓库变量
`OCR_CLEANUP_SCHEDULE_ENABLED=true`，避免 workflow 先于生产 API 镜像发布而产生误报。该
workflow 已合入默认分支，但生产 API 最新成功发布仍是 GitHub Actions run `29670449440`
（commit `d47f04ed`），早于 OCR 代码合入；GitHub 仓库也尚未配置定时开关。截至
2026-07-22，清理工作流运行记录为空；在生产 API 发布包含清理脚本的版本前，
不应手工触发已知会被脚本存在性门禁拒绝的任务，也不能把源码契约当作生产连续运行证据。

## 8. 真实腾讯云 Smoke 待办

准备条件满足后，按顺序执行并在本文件追加脱敏证据：

1. 在腾讯 CAM 控制台为独立子用户应用 `deploy/tencent-ocr-phase1-cam-policy.json`，移除 OCR 全权限/通配符策略并更换开发环境凭据；执行 `cd apps/api && bun run ocr:cam:readiness`，要求 `ready=true`。现有凭据的最新运行结果仍为 `ready=false`，不能仅做截图复核后继续使用。
2. 补充腾讯身份证加密公钥；OCR 密钥和 API 部署环境的 `OCR_RESULT_ENCRYPTION_KEY` 已配置，
   后者不得写入数据库、文档或截图。
3. 部署包含清理脚本的 API 镜像，执行一次手工 dry-run、一次手工 apply
   和至少一次小时级定时 run，回填 run ID 与脱敏 artifact。
4. 已完成：保持身份证开关关闭，执行腾讯官方营业执照正常样例和模糊派生样例；总开关已恢复关闭。
5. 完成腾讯身份证加密接口验证后再开启身份证开关，执行正反面样本。
6. 已完成：腾讯官方银行卡样例、跨租户、幂等、缓存和额度负向场景均已执行；总开关已恢复关闭。
7. 部分完成：租户 Admin 上传、识别、逐字段确认和选择回填已通过；没有保存草稿或提交正式微信进件。若发布门禁要求持久化验证，使用专用测试进件完成手工修改和保存草稿后立即清理，禁止提交正式微信进件。
8. 回填 recognition ID、脱敏 tenant ID、document type、status、duration、RequestId、warning code、HTTP 状态及脱敏截图；禁止记录图片、signed URL 和字段明文。

## 9. 发布判定

当前判定：`NO-GO`。

解除条件：第 8 节真实腾讯云 Smoke 全部通过，生产小时级清理调度连续运行证据完成，并由平台技术负责人和安全负责人共同确认。解除前保持 `TENCENT_OCR_ENABLED=false`，原微信支付进件手工填写与保存链路不受影响。
