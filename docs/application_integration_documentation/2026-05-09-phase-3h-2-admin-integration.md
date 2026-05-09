# 阶段 3H-2 Admin 对接说明：双租户验收

日期：2026-05-09

## 1. 对 admin 功能的影响

本阶段没有新增 admin 页面，也没有改变接口返回结构。

新增的是后端验收脚本：

```bash
bun run seed:tenant:phase3
bun run verify:tenant:phase3
```

## 2. Admin 联调需要准备的数据

为了跑完整双租户验收，需要准备：

- 方式一：用真实 A/B 租户数据，手动准备 A 租户管理员 token 和 B 租户资源 ID。
- 方式二：执行 `bun run seed:tenant:phase3` 自动生成模拟数据。

模拟脚本会输出：

- A 租户验收 token。
- B 租户费用申请 ID。
- B 租户工序验收 ID。
- B 租户项目 ID。
- B 租户摄像头 ID。
- B 租户短视频转写任务 ID。

建议 B 租户资源 ID 同时放入：

```bash
TENANT_B_FORBIDDEN_IDS=...
```

脚本会检查 A 租户列表和统计接口中是否泄露这些 ID。

## 3. 验收命令

```bash
STRICT_TENANT_VERIFY=1 \
API_BASE_URL=https://admin.goodcms.cn/api/backend \
TENANT_A_TOKEN=xxx \
TENANT_B_FORBIDDEN_IDS=xxx,yyy,zzz \
TENANT_B_EXPENSE_REQUEST_ID=xxx \
TENANT_B_PROJECT_ACCEPTANCE_ID=yyy \
TENANT_B_PROJECT_ID=project-b \
TENANT_B_CAMERA_ID=camera-b \
TENANT_B_SOCIAL_VIDEO_TRANSCRIPTION_ID=zzz \
bun run verify:tenant:phase3
```

## 4. 通过标准

- 所有检查 `PASS`。
- 没有 `FAIL`。
- 严格模式下没有 `SKIP`。

2026-05-09 已用模拟数据跑通一次严格验收：

```text
Summary: 12 passed, 0 failed, 0 skipped.
```

如果有失败项，优先修后端租户过滤，不建议 admin 前端做隐藏兜底。
