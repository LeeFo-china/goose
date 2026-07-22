# 腾讯云 OCR 一期验收记录

## 1. 结论

- 代码实现、自动化测试、API/Admin 构建、数据库 migration 和远端只读审计通过。
- 远端 `TENCENT_OCR_ENABLED=false`，当前不会向租户 Admin 或小程序暴露识别能力。
- 本轮未执行真实腾讯云 OCR 调用，未上传真实证件，未提交微信支付进件。
- 一期当前状态为“代码就绪，发布门禁未解除”，不能标记为生产可用。

未解除的发布门禁：

1. 尚未配置 OCR 专用最小权限 CAM 凭证。
2. 尚未配置 `OCR_RESULT_ENCRYPTION_KEY`。
3. 尚未取得并验证腾讯云身份证加密识别公钥及真实加密接口样本。
4. 尚未准备合成或明确授权的营业执照、身份证正反面和银行卡测试图片。
5. 小时级清理 workflow 已实现，但尚未合并、生产执行并提供连续运行证据。

## 2. 版本范围

分支：`feature/tencent-ocr-phase1`

核心提交：

- `c3d606cd feat(db): 建立OCR识别记录`
- `324ef26d feat(ocr): 接入腾讯云识别网关`
- `81460ba6 feat(ocr): 编排租户证照识别`
- `26762386 feat(api): 提供OCR识别接口`
- `f40f49d9 feat(ocr): 清理过期识别结果`
- `8920b8bd feat(admin): 增加OCR配置与调用记录`
- `414ee922 feat(finance): 支持进件证照识别回填`
- `f582a550 fix(ocr): 按配置收敛可用能力`

## 3. 静态门禁

执行日期：2026-07-22（Asia/Shanghai）

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Domain OCR 契约 | 通过 | 2 tests passed |
| API OCR、controller、repository、清理、进件 schema 和敏感存储聚焦回归 | 通过 | 66 tests passed |
| Admin OCR 配置/审计、进件回填和支付进件回归 | 通过 | 34 tests passed |
| 生产清理调度契约 | 通过 | 3 tests passed，YAML syntax ok |
| API typecheck/build/file-size | 通过 | Bun build 成功，文件大小检查通过 |
| Admin typecheck/file-size | 通过 | Next typegen、TypeScript 和文件大小检查通过 |
| `git diff --check` | 通过 | 无空白错误 |

说明：API Bun 测试必须从 `apps/api` 目录运行，才能加载该包 `tsconfig` 中的 `@/` 别名；从仓库根目录直接传 API 文件路径会产生模块解析错误，不属于业务测试失败。

## 4. Migration 与远端只读审计

`supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"`：

- `20260722130000` Local：存在。
- `20260722130000` Remote：存在。
- `20260722150000` Local：存在。
- `20260722150000` Remote：存在。
- Local/Remote：对齐。

通过 service-role REST 只读查询确认：

| 项目 | 结果 |
| --- | --- |
| OCR 平台配置 | 11 项 active |
| 敏感 OCR 配置 | 3 项 |
| `ocr.recognize` | active |
| `platform.ocr.recognition.read` | active |
| `TENCENT_OCR_ENABLED` | `false` |
| `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED` | `false` |
| `ocr_recognitions` 记录数 | 0 |

迁移源码同时定义并已随 migration 应用：强制 RLS、主键索引和 6 个显式索引、租户幂等唯一索引、活跃结果去重索引、结果过期索引和无客户端 policy 的 service-role 访问边界。

`20260722150000` 是前向安全修正：仅当 OCR 总开关仍为 `false` 时，把全局身份证加密识别
能力收敛为 `false`。远端只读复核确认两个开关当前均为 `false`。

## 5. 自动化场景证据

| 场景 | 结果 | 证据类型 |
| --- | --- | --- |
| 营业执照字段和有效期标准化 | 通过 | normalizer test |
| 模糊/复印件告警映射 | 通过 | normalizer test |
| 身份证正反面加密请求及响应解密 | 通过 | gateway test |
| 禁止身份证明文接口降级 | 通过 | gateway test |
| 银行卡字段和清晰度告警 | 通过 | normalizer/gateway test |
| 跨租户或无权文件拒绝 | 通过 | service test |
| 未绑定文件仅允许上传员工识别 | 通过 | service test |
| 幂等键重放不重复调用 provider | 通过 | service test |
| 同文件同文档类型命中缓存 | 通过 | service test |
| 唯一键竞争只读取胜出记录 | 通过 | service test |
| 每日额度超限在 provider 前拒绝 | 通过 | service test |
| 结果加密不含身份证号/地址明文 | 通过 | crypto test |
| 过期结果拒绝解密并返回 410 | 通过 | service test |
| 进件敏感值继续走原加密保存 | 通过 | sensitive integration test |
| OCR 关闭时能力列表为空 | 通过 | service/controller test |
| 身份证加密开关关闭时隐藏身份证能力 | 通过 | service test |

## 6. Admin 交互证据

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

未完成：真实上传、识别、差异弹窗、选择回填和继续手工编辑的浏览器截图。原因是总开关关闭且缺少专用凭证和授权样本。

## 7. 清理任务证据

2026-07-22 已对目标数据库执行：

- dry-run：成功，候选 0，更新 0。
- apply：成功，候选 0，更新 0。

这些结果证明命令和目标数据库连接可用，不证明过期记录实际清理，也不替代生产小时级调度器证据。读取过期结果返回 410、apply 清空 `result_ciphertext` 的行为已有自动化测试。

生产调度定义已增加到 `.github/workflows/ocr-result-cleanup.yml`：每小时第 17 分钟执行、
10 分钟超时、固定 concurrency 防止并行、复用健康的生产 API 容器、达到 500 条批次上限
时失败告警，并保存 30 天脱敏 artifact。定时事件还要求仓库变量
`OCR_CLEANUP_SCHEDULE_ENABLED=true`，避免 workflow 先于生产 API 镜像发布而产生误报。该
workflow 尚未在默认分支运行，因此不能把源码契约当作生产连续运行证据。

## 8. 真实腾讯云 Smoke 待办

准备条件满足后，按顺序执行并在本文件追加脱敏证据：

1. 创建仅允许 `BizLicenseOCR`、`RecognizeEncryptedIDCardOCR`、`BankCardOCR` 的 OCR 专用 CAM 凭证。
2. 在平台 Admin 配置腾讯云密钥、区域、endpoint 和身份证加密公钥；通过 API 部署环境单独
   配置 `OCR_RESULT_ENCRYPTION_KEY`，不得写入数据库、文档或截图。
3. 合并清理 workflow，部署包含脚本的 API 镜像，执行一次手工 dry-run、一次手工 apply
   和至少一次小时级定时 run，回填 run ID 与脱敏 artifact。
4. 先开启总开关并保持身份证开关关闭，执行授权营业执照正常/模糊样本。
5. 完成腾讯身份证加密接口验证后再开启身份证开关，执行正反面样本。
6. 执行测试银行卡样本、跨租户、幂等、缓存和额度负向场景。
7. 在租户 Admin 验证上传、识别、逐字段确认、手工修改和保存草稿；禁止提交正式微信进件。
8. 回填 recognition ID、脱敏 tenant ID、document type、status、duration、RequestId、warning code、HTTP 状态及脱敏截图；禁止记录图片、signed URL 和字段明文。

## 9. 发布判定

当前判定：`NO-GO`。

解除条件：第 8 节真实腾讯云 Smoke 全部通过，生产小时级清理调度连续运行证据完成，并由平台技术负责人和安全负责人共同确认。解除前保持 `TENCENT_OCR_ENABLED=false`，原微信支付进件手工填写与保存链路不受影响。
