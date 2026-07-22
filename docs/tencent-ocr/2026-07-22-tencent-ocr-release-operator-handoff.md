# 腾讯云 OCR 一期发布操作交接单

状态：`NO-GO`。本文只用于 CAM 管理员、生产发布负责人和安全复核人按顺序解除剩余门禁，
不授权跳过审批、提交真实微信支付进件或提前开启 OCR。

## 1. 当前基线

| 项目             | 当前证据                                                                      |
| ---------------- | ----------------------------------------------------------------------------- |
| 最低代码基线     | `cc7d0079 fix(ocr): 加固CAM运行态预检`                                        |
| CAM 策略文件     | `deploy/tencent-ocr-phase1-cam-policy.json`                                   |
| 策略文件 SHA-256 | `0f7f5bc3647ed0ebeaee53ef3bc2b4d2770ec93ecf271447307b3e854da1328e`            |
| 当前 CAM 探针    | 三个一期 Action 可达；范围外 `GeneralBasicOCR` 也可达，`ready=false`          |
| 生产结果密钥     | production Environment 已存在 `OCR_RESULT_ENCRYPTION_KEY`，不得读取或回填原文 |
| 清理定时开关     | 仓库变量 `OCR_CLEANUP_SCHEDULE_ENABLED` 尚未配置                              |
| 最新生产发布     | run `29670449440`，commit `d47f04ed`，早于 OCR 代码                           |
| 最新清理调度     | run `29928158966`，schedule/skipped；这是关闭门禁的预期结果，不是执行证据     |

执行期间始终保持：

- `TENCENT_OCR_ENABLED=false`
- `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED=false`
- 不记录 SecretId、SecretKey、公钥正文、证件图片、识别字段、signed URL 或请求密文

## 2. 角色与停止条件

| 角色       | 允许操作                                                         | 必须停止的情况                                                                    |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| CAM 管理员 | 创建 OCR 专用子用户、绑定自定义策略、生成和停用访问密钥          | 无法证明用户仅绑定目标策略；发现用户组、继承或权限边界额外授予 OCR 权限           |
| 平台超管   | 在 `/settings?group=ocr` 保存新 SecretId/SecretKey；不回显敏感值 | 页面未显示“已安全配置”；配置保存失败；需要通过聊天或工单传递 SecretKey            |
| 发布负责人 | 推送已审核 commit，执行生产 build/deploy 和清理 workflow         | 生产候选不是精确 commit；容器未包含清理脚本；健康检查失败                         |
| 安全复核人 | 回读 CAM 绑定、核对探针和脱敏证据                                | `GeneralBasicOCR` 未被拒绝；输出 `policy_binding_verified=false` 却被当成最终审计 |

当前 OCR 子账号没有 `ListAttachedUserAllPolicies` 权限，不能自助完成策略审计或创建替代账号。
禁止临时给该运行账号追加 CAM 管理权限。必须由主账号或独立 CAM 管理员执行第 3 节。

## 3. CAM 最小权限替换

### 3.1 CAM 管理员操作

1. 在腾讯云 CAM 创建独立的编程访问子用户，命名应能明确识别为 Gooes OCR 一期运行账号。
2. 使用仓库策略文件创建自定义策略；导入前核对 SHA-256 与第 1 节完全一致。
3. 仅允许以下 Action，`resource` 必须为 `*`：
   - `name/ocr:BizLicenseOCR`
   - `name/ocr:BankCardOCR`
   - `name/ocr:RecognizeEncryptedIDCardOCR`
4. 确认该用户没有 `QcloudOCRFullAccess`、`ocr:*`、其他 OCR 自定义策略，也没有通过用户组、
   继承策略或权限边界获得额外 OCR Action。
5. 生成一对新访问密钥，通过组织批准的受控密钥渠道一次性交付给平台超管。
6. 暂不删除旧密钥；标记为待停用，只保留到新凭据通过第 3.3 节。

CAM 管理员必须提供脱敏证据：子用户备注或内部编号、目标策略名称及版本、策略文件哈希、
直接/用户组/继承策略核对结果、复核时间和复核人。截图需遮盖 UIN、SecretId 和所有密钥内容。

### 3.2 平台配置替换

平台超管在 `/settings?group=ocr` 更新：

- `TENCENT_OCR_SECRET_ID`
- `TENCENT_OCR_SECRET_KEY`

以下设置保持现值，不重新生成或通过聊天传递：

- `TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM`
- `TENCENT_OCR_REGION`
- `TENCENT_OCR_ENDPOINT=ocr.tencentcloudapi.com`

保存后页面只能显示已配置状态，不得回显 SecretKey 或公钥正文。不要把运行凭据写入 `.env`、
GitHub issue、验收文档、截图或 shell history。

### 3.3 行为探针与回滚

从已审核代码基线执行：

```bash
cd apps/api
bun run ocr:cam:readiness
```

通过条件必须全部满足：

- `credential_source=platform_settings`
- `official_endpoint=true`
- `encrypted_id_probe_payload_valid=true`
- `BizLicenseOCR`、`BankCardOCR`、`RecognizeEncryptedIDCardOCR` 的 `passed=true`
- `GeneralBasicOCR` 返回权限拒绝且 `passed=true`
- `runtime_probe_ready=true`
- `ready=true`

`policy_binding_verified=false` 和 `production_ready=false` 是预期输出，表示行为探针不能替代 CAM
控制台回读。安全复核人完成第 3.1 节证据核对后，才可把 CAM 门禁标记通过。

若任一条件失败：立即恢复平台设置中的旧凭据，保持两个 OCR 开关关闭，保留 RequestId 和错误码
用于排查，但不记录 provider message 或请求体。新凭据验证通过后，CAM 管理员停用旧访问密钥；
观察期结束后再删除，不能让两套长期同时有效。

## 4. 生产发布与清理调度

### 4.1 发布前确认

1. 远端 `main` 必须包含 `cc7d0079` 及其前置 OCR 提交；从该精确 commit 创建符合
   `vYYYY.MM.DD.N` 格式的审核发布 Tag。
2. 在同一 Tag 上手工运行 `.github/workflows/release-production.yml`：先选择
   `operation=build`、`service=api`、`confirm_text=确认构建生产候选`；成功后记录 build run ID
   和完整 40 位 commit SHA。
3. 仍在同一 Tag 上运行 `operation=deploy`、`service=api`，提交上一步 build run ID、完整
   commit SHA 和 `confirm_text=确认部署生产环境`。workflow 必须验证候选 artifact、镜像 manifest
   和未重复部署状态，禁止绕过为直接执行底层 deploy workflow。
4. 保存精确 source commit、build run ID、`production-release-candidate`、
   `production-build-plan`、API image manifest 和 deployment receipt。
5. 发布后确认 `gooes-api` 健康，且容器内存在
   `apps/api/src/scripts/ocr-result-cleanup.ts` 对应构建产物。
6. `OCR_RESULT_ENCRYPTION_KEY` 只从 production Environment secret 注入；不得迁入平台设置。

### 4.2 清理验证顺序

生产 API 发布成功后按顺序执行：

1. 手工触发 `OCR Result Cleanup`，选择 `dry-run`；确认输出不修改数据库。
2. 手工触发 `apply`；无过期候选时允许 `expired_count=0`，但必须证明命令在生产容器成功运行。
3. 设置仓库变量 `OCR_CLEANUP_SCHEDULE_ENABLED=true`。
4. 等待至少一次小时级 schedule run 成功，不能用 workflow_dispatch 或 skipped run 替代。
5. 保存脱敏 Job Summary 和 artifact，记录 run ID、source commit、模式、候选数、过期数、批次数、
   `batch_limit_reached` 和执行时间。

如果生产容器缺少脚本、数据库连接失败、apply 超时、批次上限触发或日志出现敏感信息：立即把
`OCR_CLEANUP_SCHEDULE_ENABLED` 恢复为 `false`，保持 OCR 总开关关闭，并按安全事件处理日志泄露。
已经清除的过期密文不做恢复。

## 5. 最终解除门禁

只有下列证据全部存在时，才允许由平台技术负责人和安全负责人共同决定是否开启 OCR：

- CAM 控制台最小权限回读证据
- 新凭据 `ready=true` 的脱敏探针输出
- 精确生产 commit、build run、deploy receipt 和健康检查
- 生产清理 dry-run、apply 和至少一次 schedule success 的 run ID 与 artifact
- API/Admin 全量检查和 `git diff --check` 通过
- `docs/tencent-ocr/2026-07-22-tencent-ocr-phase1-smoke-record.md` 已回填上述证据

开启顺序必须是先验证全局配置和清理，再按批准范围逐项开启能力。任何证据缺失时继续保持
`NO-GO`，租户仍使用现有手工资料填写和微信支付进件链路。
