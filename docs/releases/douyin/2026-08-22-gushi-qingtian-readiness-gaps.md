# 固始晴天装饰抖音提审就绪缺口记录

记录时间：2026-08-22  
目标租户：`3eebca47-961f-4899-b976-a3d3208d326b` / 固始晴天装饰工程有限公司  
目标商家安装：`82061c96-29ac-4426-baff-5efc1061fbc8` / AppID 后缀 `ccd301`

## 当前结论

当前开发库未达到抖音提审条件。代码、migration 和基础静态检查已具备继续验证的条件，但公开内容和预算报价数据仍缺业务输入，不能由工程侧猜测或伪造。

## 数据库与迁移状态

- 使用 `/Users/leefo/Public/work/gooes/.env` 中的开发库连接检查。
- `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"` 显示 Local/Remote 已对齐至 `20260821105690`。
- `supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --dry-run` 返回 `Remote database is up to date`。

## Readiness 命令

```bash
cd apps/api
DOUYIN_RELEASE_REQUIRED_HOSTS=douyin \
  bun --env-file=/Users/leefo/Public/work/gooes/.env \
  src/scripts/douyin-release-readiness.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b
```

结果：exit code `2`，`ready: false`。

关键指标：

- `published_project_count`: 0
- `in_progress_project_count`: 0
- `completed_project_count`: 0
- `active_service_area_count`: 1
- `active_pricing_version`: 0
- `required_host_count`: 1

阻断项：

1. `PUBLIC_PROFILE_INCOMPLETE`：公开公司资料不完整。
2. `PUBLIC_PROJECT_COUNT_LOW`：公开项目数量 0，要求至少 6。
3. `PUBLIC_PROJECT_PHASE_COVERAGE_LOW`：施工中和已完工项目数量不足。
4. `PUBLIC_PROJECT_PROGRESS_LOG_LOW`：施工中项目进度记录不足，当前 0，要求至少 2。
5. `BUDGET_PRICING_MISSING`：预算报价未启用。

警告项：

- `PUBLIC_PROJECT_LOG_LOW`：施工中项目进度记录偏少。

## 只读事实盘点

### 安装与租户

- 租户名称：固始晴天装饰工程有限公司
- 租户状态：active
- 商家安装状态：active
- 安装类型：merchant
- 隐私协议版本：`2026-07-19`
- 最近已提交 release：`0.1.3`，状态 `audit_rejected`，host 为 `douyin`
- 最近驳回原因：抖音、抖音 Lite、抖音火山版均反馈“小程序功能不完整且可用性低，请丰富小程序内容和功能，提高用户体验”

### 公开资料

- 公开资料状态：published
- 公开名称：固始晴天装饰工程有限公司
- 公开电话：已配置
- 服务区域：河南省 / 信阳市 / 固始县，active
- Logo：未配置
- 公司简介：当前 13 字，未达到 readiness 要求的 80 字

### 项目

- 租户内部项目数：11
- 公开项目 profile 数：0
- 现有内部项目包含 Smoke/E2E/客户姓名/楼栋房号等内容，不能直接改名发布为提审内容。
- 若要发布项目，必须通过后台项目公开资料页录入业务确认后的公开标题、描述、图片、预算带、风格和进度日志。

### 预算报价

- `douyin_budget_pricing_versions`: 0
- `douyin_budget_pricing_items`: 0
- 不存在可启用的草稿报价版本。必须由业务提供公司批准的报价规则、免责声明和生效时间后，通过后台预算报价管理创建并激活。

## 后续必须补齐的数据

1. 公司批准的 Logo 与公开介绍文案，介绍不少于 80 个有效字符。
2. 至少 6 个真实可公开项目：
   - 至少 2 个施工中；
   - 至少 2 个已完工；
   - 每个项目至少 3 张真实图片；
   - 每个项目有公开标题、公开描述、面积、户型、风格、预算带；
   - 至少 2 个施工中项目有公开进度记录；
   - 公开内容不能包含客户姓名、手机号、精确门牌、Smoke/E2E/测试痕迹或时间戳。
3. 公司批准的预算报价版本：
   - 六个 base 条目覆盖完整；
   - 可选项按业务确认配置；
   - 免责声明真实有效；
   - 激活后 readiness 应显示 `active_pricing_version: 1`。
4. 补齐后重新执行 readiness 命令，结果必须为 exit code `0` 且 `ready: true`。

## 当前不可执行项

以下动作在缺少业务批准内容前不执行：

- 直接发布现有内部 Smoke/E2E 项目；
- 用测试 fixture 或设计文案替代公司真实介绍；
- 猜测预算单价、报价项或免责声明；
- 提交抖音审核。
