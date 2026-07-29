# 装企入驻 Visitor 营业执照 OCR 设计

日期：2026-07-29  
状态：已批准，待实施  
后端仓库：`/Users/leefo/Public/work/gooes`  
前端只读仓库：`/Users/leefo/Public/work/orange`

## 1. 目标

为装企主动入驻提供用途受限的营业执照 OCR 能力。访客完成
`tenant_onboarding_license` 私有 COS 直传后，使用 `visitor_session`
发起同步识别，获得可编辑的企业信息建议，再按原流程提交入驻申请。

OCR 只辅助录入，不创建申请、不改变审核状态，也不替代原申请接口的
文件归属、字段格式和重复主体校验。OCR 不可用时必须保留手工填写。

## 2. 已确认方案

采用 visitor 专用 controller、service 和 repository，不开放或放宽现有员工
`/ocr/recognitions`：

```text
TenantOnboardingOcrController
  -> TenantOnboardingOcrService
      -> VisitorOcrRecognitionRepository
      -> PlatformFileObjectRepository
      -> VisitorOcrQuotaRepository
      -> TencentOcrGateway
      -> normalizeOcrResponse
      -> encryptOcrResult / decryptOcrResult
      -> OCR result cleanup
```

现有员工 OCR 继续要求租户员工身份、`ocr.recognize` 和业务权限。平台供应商
OCR 继续使用 platform scope。visitor 功能不改变两个既有数据域的行为。

## 3. 接口契约

三个接口都要求有效的 `visitor_session`：

```http
GET /tenant-onboarding/ocr/capabilities
POST /tenant-onboarding/ocr/recognitions
GET /tenant-onboarding/ocr/recognitions/:id
```

创建请求只接受：

```json
{
  "file_object_id": "uuid-from-direct-complete",
  "idempotency_key": "uuid-v4"
}
```

`scene=tenant_onboarding_license`、`document_type=business_license` 和
`providerAction=BizLicenseOCR` 全部由服务端固定。客户端不能通过此入口选择其他
scene、文档类型或腾讯 Action。

首次识别为同步请求。成功返回 HTTP 200 和 `status=succeeded`。相同幂等键的
processing 记录返回 `409 OCR_RECOGNITION_IN_PROGRESS`，并只在安全 details
中返回 `recognition_id`。GET 用于并发恢复和网络超时后的状态查询。

capability 查询在总开关、专项开关、腾讯凭据或结果加密能力不可用时统一返回
HTTP 200 和 `data=[]`，不暴露具体配置状态。

## 4. 认证和文件边界

controller 只从已验证 JWT 读取：

```text
token_type = visitor_session
visitor_id 非空
```

文件 repository 使用 ID 和 visitor 归属联合查询。识别前必须同时满足：

```text
tenant_id IS NULL
owner_type = visitor
owner_visitor_id = current visitor
scene = tenant_onboarding_license
provider = tencent_cos
visibility = private
public_url IS NULL
status = active
deleted_at IS NULL
mime_type IN (image/jpeg, image/png)
size_bytes <= 5 MiB
```

不属于当前 visitor、场景错误、已删除或不可用的文件统一返回
`404 OCR_FILE_NOT_FOUND`，不通过 403 暴露对象是否存在。

现有 direct-complete 已使用 COS HEAD 校验 Content-Type、Content-Length 和 ETag，
并设置禁止覆盖。OCR 调用前仍需对对象执行带 ETag 条件的有界读取，并使用 Sharp
解码确认实际为 JPEG/PNG，不能只信任扩展名、声明 MIME 或 COS Content-Type。

## 5. 数据模型

复用 `ocr_recognitions`，通过 migration 增加：

- `scope_type=visitor`
- `actor_visitor_id text`
- `provider_started_at timestamptz`
- `processing_deadline_at timestamptz`
- `tenant_onboarding_license` scene
- visitor 幂等唯一索引
- visitor 日配额和 processing 查询索引

scope 约束：

```text
tenant:
  tenant_id 非空
  actor_visitor_id 为空

platform:
  tenant_id 为空
  actor_visitor_id 为空

visitor:
  tenant_id 为空
  actor_employee_id 为空
  actor_visitor_id 非空且非空白
```

visitor 唯一索引：

```sql
UNIQUE (actor_visitor_id, idempotency_key)
WHERE scope_type = 'visitor'
```

visitor 一期不做跨幂等键结果缓存，不创建 visitor active dedupe 唯一索引。
相同文件使用不同 key 会产生新的 provider 调用和配额消耗。

## 6. 原子幂等、配额和并发

新增 service-role RPC，在一个数据库事务中完成：

1. 读取相同 visitor + idempotency key 的记录。
2. 校验幂等键是否仍绑定相同文件。
3. 清理超过 processing lease 的 visitor processing 记录。
4. 检查 visitor 日配额。
5. 检查单 visitor processing 并发。
6. 检查 IP 固定窗口频率。
7. 创建 processing recognition 或返回已有记录。

客户端 IP 使用 `resolveTrustedClientIp()`。数据库只保存使用服务端密钥 HMAC 后的
IP hash，不保存原始 IP。

只有准备实际调用 provider 时才设置 `provider_started_at`。日配额统计
`provider_started_at`，因此文件预检、幂等重放和创建后未调用 provider 的异常不会
消耗额度；provider 已开始后，无论成功或失败都计费一次。

初始配置：

| 设置 | 默认值 |
| --- | ---: |
| `TENCENT_OCR_TENANT_ONBOARDING_ENABLED` | `false` |
| `TENCENT_OCR_VISITOR_DAILY_LIMIT` | `5` |
| `TENCENT_OCR_VISITOR_IP_WINDOW_SECONDS` | `60` |
| `TENCENT_OCR_VISITOR_IP_WINDOW_LIMIT` | `20` |
| `TENCENT_OCR_VISITOR_PROCESSING_LEASE_SECONDS` | `30` |
| `TENCENT_OCR_VISITOR_CONCURRENCY_LIMIT` | `1` |
| `TENCENT_OCR_VISITOR_GLOBAL_CONCURRENCY_LIMIT` | `8` |

IP、visitor 或服务总并发受限统一返回
`429 OCR_PROVIDER_RATE_LIMITED`，并带整数秒 `Retry-After`。

## 7. 结果加密和生命周期

继续使用 `OCR_RESULT_ENCRYPTION_KEY` 和 AES-256-GCM。新增 visitor AAD：

```text
ocr:visitor:<actor_visitor_id>:<recognition_id>:v1
```

既有 tenant 和 platform AAD 字节格式保持不变，并增加回归测试证明旧密文仍可读取。

结果 TTL 继续使用 `TENCENT_OCR_RESULT_TTL_HOURS`，默认 24 小时。清理任务覆盖
processing、succeeded 和 failed：

- 更新 `status=expired`
- 清空 `result_ciphertext`
- 保留安全摘要、warning code、provider request ID 和计费审计字段
- GET 和旧幂等键重放均返回 `410 OCR_RECOGNITION_EXPIRED`

processing lease 与结果 TTL 独立。超过 lease 的 processing 先转 failed，避免服务
崩溃后长时间阻塞 visitor。

## 8. 错误和日志

所有错误通过 `error-factory.ts`。visitor API 只返回稳定业务错误码。provider 原始
错误、provider message、signed URL、COS object key 和配置细节不得进入响应。

provider 或 normalizer 失败时：

1. 先把 recognition 更新为 failed。
2. 将安全 `recognition_id` 合并进错误 details。
3. 保留原 HTTP 状态和稳定 OCR code。
4. 相同 key 重放返回 HTTP 200 的 failed recognition，不再次调用 provider。

允许日志：

- API request ID
- recognition ID
- file object ID
- visitor ID 的不可逆摘要
- HTTP 状态和业务错误码
- provider request ID
- warning code、耗时和是否幂等

禁止日志：

- OCR 字段原文
- 营业执照图片或 Base64
- signed URL 和 object key
- 腾讯密钥、完整 provider 响应
- 完整 visitor token

## 9. 字段映射

后端保持现有标准化字段：

- `license_name`
- `license_code`
- `license_address`
- `license_period_begin`
- `license_period_end`
- `legal_representative_name`

企业名称和统一社会信用代码可回填空白字段，但必须允许用户修改。注册地址只作为
“使用注册地址”候选，不自动改变地图位置、行政区代码或服务区域。法定代表人不回填
管理员姓名。

## 10. 测试和验收

至少覆盖：

- domain scene 和 visitor capability
- visitor_session 路由认证
- 文件归属、场景、状态、MIME、大小和图像解码
- visitor scope migration CHECK、RLS、索引和旧数据兼容
- visitor AAD 及 tenant/platform AAD 回归
- 原子幂等、相同 key 不同文件冲突和并发唯一胜出
- processing lease 恢复
- visitor/IP/全局配额和 `Retry-After`
- provider 成功、失败、normalizer 失败和安全错误 details
- failed、processing、succeeded、expired GET
- TTL 清理
- 真实 dev visitor 上传、OCR、GET 恢复和申请提交 smoke

## 11. 发布和前端交接

`@gooes/domain` 从 `1.12.0` 升到 `1.13.0` 并重新打包。Orange 当前引用本地 tgz，
只能在后端 dev 契约稳定并提供新包后更新。

dev 发布后回传：

1. commit 和 API version
2. 三个最终接口路径
3. 总开关和专项开关状态
4. visitor、IP、并发配额
5. 结果 TTL 和 processing lease
6. 成功、幂等、processing 恢复、失败和过期真实响应
7. 脱敏测试文件或允许前端上传的联调说明

生产专项开关在 dev 联调通过前保持关闭。Orange 在本后端任务中保持只读。
