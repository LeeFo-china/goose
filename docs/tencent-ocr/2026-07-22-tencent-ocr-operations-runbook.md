# 腾讯云 OCR 一期运维手册

## 1. 当前发布门禁

- `TENCENT_OCR_ENABLED` 默认保持 `false`。
- API 容器必须通过 GitHub Environment secret 注入 `OCR_RESULT_ENCRYPTION_KEY`；development 与 production 使用不同随机值，禁止写入平台设置或共享同一密钥。
- OCR CAM 子用户只能关联 `deploy/tencent-ocr-phase1-cam-policy.json` 中的一期接口权限；禁止关联 `QcloudOCRFullAccess`、`ocr:*` 或其他 OCR Action。
- 只有在生产环境完成一次 dry-run、一次 apply，并确认小时级调度连续运行后才能开启。
- 身份证能力还必须完成腾讯云加密公钥和官方 Demo 的真实联调；未通过时保持 `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED=false`。

### 1.1 CAM 最小权限配置

策略文件：`deploy/tencent-ocr-phase1-cam-policy.json`。

该策略只允许以下操作级 Action：

- `name/ocr:BizLicenseOCR`
- `name/ocr:RecognizeEncryptedIDCardOCR`
- `name/ocr:BankCardOCR`

OCR 这些接口按腾讯云 CAM 能力表使用操作级授权，因此 `resource` 必须为 `*`；这不代表允许
所有 OCR 接口。平台运维需创建独立 CAM 子用户，移除该子用户已有的 OCR 全读写或通配符
策略，只关联上述自定义策略，再生成一对新的 SecretId/SecretKey。禁止复用 COS、支付或主账号
密钥。

替换开发环境凭据后，先保持 `TENCENT_OCR_ENABLED=false`，使用无真实数据的空白图做权限探针：

1. `BizLicenseOCR` 和 `BankCardOCR` 应进入图片校验或识别阶段，不应返回无权限。
2. `GeneralBasicOCR` 必须返回 CAM 无权限错误，不能返回图片解码/识别错误或正常结果。
3. 取得身份证加密公钥后，`RecognizeEncryptedIDCardOCR` 才执行正式联调。

腾讯云依据：[CAM 自定义策略生成器](https://cloud.tencent.com/document/product/598/37739)
要求声明授权效果、服务、操作和资源；[OCR CAM 能力表](https://cloud.tencent.com/document/product/598/60621)
标记上述接口为操作级授权、资源为 `*`。策略替换和负向探针结果必须回填 Phase 1 smoke
记录。

### 1.2 身份证加密公钥申请与校验

腾讯云[敏感数据加密指引](https://cloud.tencent.com/document/product/866/106048)明确说明：
`RecognizeEncryptedIDCardOCR` 使用的加密公钥和官方 Demo 需要联系腾讯 OCR 售后支持获取，
不能自行生成 KMS/RSA 密钥替代，也不能复用微信支付、COS 或其他产品的公钥。

向腾讯 OCR 售后提交申请时，应明确提供：腾讯云账号标识、产品“文字识别 OCR”、接口
`RecognizeEncryptedIDCardOCR`、算法 `AES-256-CBC`，并申请对应的 1024 位 RSA PKCS#1
加密公钥和 Node.js Demo。不要在工单、聊天记录或仓库中发送 OCR SecretKey、业务证件图片或
识别结果。

取得材料后按以下顺序处理：

1. 将售后交付原件保存到受控密钥存储，不加入 Git。
2. 如果交付内容是 Base64 包裹的 PEM，先做一次 Base64 解码；平台配置值必须以
   `-----BEGIN RSA PUBLIC KEY-----` 开始、以 `-----END RSA PUBLIC KEY-----` 结束。
3. 使用 `openssl rsa -pubin -RSAPublicKey_in -in <public-key.pem> -noout -text` 只读确认
   `Public-Key: (1024 bit)`；不要把命令完整输出提交到仓库。
4. 通过平台设置保存 `TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM`，继续保持
   `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED=false`。
5. 后端保存设置时会直接拒绝外层 Base64、SPKI/PKCS#8、非 RSA、非 1024 位或畸形公钥；
   无效值不会写入数据库。运行时能力接口也不会返回身份证正反面识别能力，gateway 会再次
   失败关闭。
6. 使用明确授权的身份证正反面测试样本完成加密请求、加密响应解密、字段复核和过期清理后，
   才允许开启身份证能力。

## 2. 结果清理命令

在 API 发布目录执行：

```bash
# 默认只读，不修改数据库
bun run --cwd apps/api ocr:results:cleanup

# 明确执行过期与密文清理
bun run --cwd apps/api ocr:results:cleanup --apply
```

每个数据库批次最多处理 500 条 `status IN (processing,succeeded) AND expires_at<=now` 的记录，按
`expires_at` 升序选择。dry-run 只查询一个批次；apply 模式会在同一次任务中连续执行，直到
积压清空或达到 20 个批次（最多 10,000 条）。apply 把状态改为 `expired` 并清空
`result_ciphertext`，保留脱敏摘要、告警码、RequestId、耗时与计费单元作为审计数据。

读取接口在判断到 `expires_at` 已过期时直接返回 `410 OCR_RECOGNITION_EXPIRED`，不依赖清理任务是否已经执行。

## 3. 生产调度

调度定义：`.github/workflows/ocr-result-cleanup.yml`。任务运行在现有生产发布 runner，通过
`docker exec gooes-api` 使用当前已部署 API 镜像的代码和容器环境，不在 GitHub 中复制
数据库或 OCR 密钥。

API Compose 使用 `${OCR_RESULT_ENCRYPTION_KEY:?set OCR_RESULT_ENCRYPTION_KEY}` 失败关闭，开发
和生产发布 workflow 分别从各自 GitHub Environment 的同名 secret 注入。发布成功可以证明
变量已进入 Compose 重建过程，但不能替代识别结果加密/解密的真实成功样本。

调度要求：

- 周期：每小时一次，在整点后 17 分钟执行。
- 定时模式：固定执行
  `docker exec gooes-api bun src/scripts/ocr-result-cleanup.ts --apply`。
- 手工模式：`workflow_dispatch` 默认 `dry-run`，需要明确选择 `apply` 才写数据库。
- 启用门禁：定时事件仅在仓库变量
  `OCR_CLEANUP_SCHEDULE_ENABLED=true` 时运行；手工任务不受该变量影响。
- 超时：10 分钟。
- 防重入：GitHub Actions concurrency 固定为
  `ocr-result-cleanup-production`，不取消正在执行的任务，不允许并行清理。
- 运行边界：只允许 `gooes-prod-vm-0-3`，并要求 `gooes-api` 为
  `running/healthy` 且已包含清理脚本。
- 日志：只记录计数、最早过期时间和模式，不记录图片、signed URL、识别字段或密钥。
- 证据：每次把脱敏 summary 写入 Job Summary，并保存 30 天 artifact。
- 积压告警：连续执行 20 个批次后仍有积压时，`batch_limit_reached=true`，workflow 失败并
  输出 GitHub error。

当前状态：调度定义已合入默认分支，但生产 API 最新发布版本早于 OCR 代码合入，GitHub 仓库
尚未配置 `OCR_CLEANUP_SCHEDULE_ENABLED`，也没有生产 workflow run 证据，因此 OCR 总开关
不得开启。部署包含清理脚本的 API 镜像后，部署负责人必须先
手工执行一次 dry-run 和一次 apply，再设置 `OCR_CLEANUP_SCHEDULE_ENABLED=true`，观察至少
一个小时级定时 run，并把 run ID 与脱敏 artifact 回填到 Phase 1 smoke 记录。

在生产 API 尚未包含 `apps/api/src/scripts/ocr-result-cleanup.ts` 时，不要为了制造运行记录手工
触发 workflow；脚本存在性门禁会拒绝任务，这类失败不能作为清理能力验证证据。

2026-07-22 已使用开发目标数据库完成命令级验证和真实过期夹具验证：先确认候选为 0，再创建
一条零计费、无识别字段的过期成功记录；dry-run 命中 1 条，apply 过期 1 条并清空密文，随后
dry-run 恢复为 0，租户读取返回 410。脱敏过期审计按设计保留。该证据证明开发数据库运行态
清理有效，但不替代生产小时级调度器的安装与连续运行证据。

## 4. 责任与告警

- Owner：Gooes 平台运维负责人。
- 告警接收：现有生产发布告警渠道和平台运维群。
- 立即告警：进程退出码非 0、执行超时、数据库连接失败。
- 容量告警：`batch_limit_reached=true`，表示单次已处理 20 个批次后仍可能存在积压，需要
  人工再次执行并评估调度容量。
- 安全告警：日志出现身份证号、银行卡号、地址、图片 URL 或配置密钥时，立即停用 OCR 并按安全事件处理。

## 5. 首次启用检查

1. `supabase migration list` 确认 `20260722130000`、`20260722150000` 和
   `20260722170000`、`20260722180000` Local/Remote 对齐。
2. dry-run 输出 `mode=dry-run`，并确认没有数据库更新。
3. 使用受控过期测试记录运行 apply，确认 `status=expired` 且 `result_ciphertext IS NULL`。
4. 再次 dry-run，确认已处理记录不再进入候选集。
5. 确认 workflow concurrency、10 分钟超时、单批 500 条、单次最多 20 批和超限积压告警
   生效。
6. 回填 smoke 记录后，才允许在平台设置中启用 OCR。

## 6. 回滚

1. 立即设置 `TENCENT_OCR_ENABLED=false`。
2. 停止生产清理调度器，但不要恢复已清除的敏感密文。
3. 保留 `ocr_recognitions` 脱敏审计记录。
4. 数据库结构如需移除，必须另建 forward migration；禁止手工删表或恢复密文。
