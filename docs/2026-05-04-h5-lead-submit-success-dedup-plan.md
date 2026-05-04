# H5 活动页线索提交成功态与防重复提交落地方案

日期：2026-05-04

## 当前执行状态

截至 2026-05-04，以下能力已落地：

1. 已新增 `marketing_leads(page_id, phone, created_at DESC)` 防重查询索引
2. 已在 H5 线索提交接口中增加 24 小时 `page_id + phone` 幂等
3. 重复提交命中时不新增线索，更新原线索最新表单信息
4. 提交响应已返回 `lead_id`、`already_submitted`、`updated_existing`、`phone_tail`、`identity_status`
5. 埋点仍沿用现有事件名，未扩展数据库事件枚举
6. H5 前端已支持提交成功态、`localStorage` 已提交回显、返回小程序、继续浏览活动、修改信息
7. 已新增小程序 H5 短期 token 生成接口
8. H5 线索提交和埋点已支持携带短期 token
9. token 有效时，后端会写入 `customer_id` / `wx_openid`
10. token 过期或缺失时，H5 仍按匿名链路正常提交

未落地：

1. 小程序端实际调用 `POST /wechat/h5-session` 并拼接 web-view URL
2. H5 页面加载时通过 token 查询当前客户是否已提交该活动

## 一、目标

H5 活动页用户提交预约信息后，页面需要从“可填写表单”切换为明确的“已提交状态”，并且同一页面本次会话内不能继续重复提交。

同时，已提交过信息的用户再次进入同一个 H5 活动页时，页面应优先展示“已预约 / 已提交状态”，不要默认再次展示空表单。

本方案目标：

1. 提升用户提交后的确定感
2. 减少用户连续点击导致的重复线索
3. 支持用户返回小程序或继续浏览活动
4. 保留“修改信息”入口，避免用户填错后无法处理
5. 后端增加 24 小时幂等，保证数据层不会产生短时间重复线索

## 二、推荐 MVP 行为

```text
用户提交表单
  -> 提交按钮进入 loading
  -> 调用 H5 线索提交接口
  -> 成功后表单替换为成功提示
  -> 当前会话禁用重复提交
  -> 展示两个动作：
       1. 返回小程序
       2. 继续浏览活动

用户再次进入同一个 slug
  -> H5 读取本地提交记录
  -> 命中后展示已提交状态
  -> 不默认展示空表单
  -> 展示手机号后四位
  -> 提供：
       1. 返回小程序
       2. 修改信息
```

成功态文案：

```text
预约已提交
顾问会尽快与您联系，请保持电话畅通
已提交手机号：****4738
```

## 三、前端状态设计

H5 表单建议维护 4 个状态：

| 状态 | 含义 | 页面表现 |
| --- | --- | --- |
| `idle` | 初始可填写 | 展示表单和提交按钮 |
| `submitting` | 正在提交 | 按钮 loading，禁用表单 |
| `submitted` | 已提交成功 | 用成功提示替换表单 |
| `editing` | 用户点击修改信息 | 重新展开表单，允许再次提交 |

状态切换：

```text
idle -> submitting -> submitted
submitted -> editing
editing -> submitting -> submitted
```

注意：

- `submitting` 状态必须禁用提交按钮，防止连续点击。
- `submitted` 状态不展示原提交按钮。
- 如果允许用户重新提交，必须通过“修改信息”入口进入 `editing`，不要直接保留提交按钮。

## 四、本地缓存规则

MVP 先使用 `localStorage` 作为体验优化，不作为业务唯一依据。

推荐 key：

```text
gooes:h5:lead:{slug}
```

推荐 value：

```json
{
  "slug": "springsale",
  "leadId": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
  "phoneTail": "4738",
  "submittedAt": "2026-05-04T10:30:00.000Z",
  "expiresAt": "2026-05-05T10:30:00.000Z"
}
```

读取规则：

1. 页面加载时读取 `gooes:h5:lead:{slug}`
2. 如果存在且 `expiresAt` 未过期，直接进入 `submitted` 状态
3. 如果不存在或已过期，展示正常表单
4. 如果 JSON 解析失败，清理该 key 后展示正常表单

有效期建议：

- MVP 与后端幂等窗口保持一致，先用 24 小时。
- 后续如果业务希望长期提示“你已预约过”，需要引入小程序登录态 / H5 session token，由后端返回当前用户对该活动的提交状态。

## 五、后端防重规则

前端缓存只能改善体验，不能保证数据干净。后端必须做幂等。

MVP 推荐规则：

```text
同一个 page_id + phone
如果 24 小时内已经存在 marketing_leads 记录：
  -> 不创建新线索
  -> 返回原 lead_id
  -> 返回 already_submitted = true
  -> 推荐同步更新原线索的最新表单信息，方便“修改信息”生效

如果 24 小时内不存在：
  -> 创建新线索
  -> 返回 already_submitted = false
```

建议查重条件：

```text
page_id = 当前活动页 ID
phone = 当前提交手机号
created_at >= now() - interval '24 hours'
lead_status != 'invalid'
```

推荐索引：

```sql
CREATE INDEX IF NOT EXISTS idx_marketing_leads_page_phone_created_at
ON public.marketing_leads(page_id, phone, created_at DESC);
```

接口响应建议：

```json
{
  "data": {
    "lead_id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
    "already_submitted": false,
    "updated_existing": false,
    "phone_tail": "4738",
    "message": "预约已提交"
  }
}
```

重复提交时：

```json
{
  "data": {
    "lead_id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
    "already_submitted": true,
    "updated_existing": true,
    "phone_tail": "4738",
    "message": "你已提交预约"
  }
}
```

说明：

- `already_submitted = true` 不代表错误，前端仍展示成功态。
- `updated_existing = true` 表示没有新增线索，但已把用户最新填写的信息同步到原线索。
- 手机号必须填写且格式有效；后端会拒绝空手机号，避免产生无法按 `page_id + phone` 防重的空线索。

## 六、返回小程序交互

成功态展示两个按钮：

```text
[返回小程序] [继续浏览活动]
```

`返回小程序` 是主按钮。

行为建议：

1. H5 引入微信 JS-SDK 后使用 `wx.miniProgram` 路由能力
2. 如果 URL 带 `returnPath + returnMethod`，优先跳到指定小程序页面
3. 未传固定返回页时，调用 `wx.miniProgram.navigateBack({ delta: 1 })`
4. 如果不在微信 web-view 内，降级为 `history.back()`
5. 如果 `history.length <= 1` 且没有微信能力，隐藏按钮或文案降级为“关闭页面后查看”

小程序打开 H5 时建议携带：

```text
returnPath=/pages/index/index
returnMethod=switchTab
```

`returnMethod` 需要和页面类型匹配：tabBar 页面用 `switchTab`，普通页面用 `redirectTo` 或 `navigateTo`。

伪代码：

```ts
async function returnToMiniProgram() {
  await trackReturnClick();

  const miniProgram = window.wx?.miniProgram;
  if (miniProgram && returnPath && returnMethod !== "navigateBack") {
    miniProgram[returnMethod]({ url: returnPath });
    return;
  }

  if (miniProgram?.navigateBack) {
    miniProgram.navigateBack({ delta: 1 });
    return;
  }

  if (window.history.length > 1) {
    window.history.back();
  }
}
```

`继续浏览活动` 是次级按钮。

行为建议：

- 滚动到页面顶部，或滚动到活动内容区第一个模块。
- 不重新展示空表单。
- 如果页面存在多个表单模块，只处理当前提交的表单模块，其它模块是否隐藏需要按后续业务再定。

## 七、埋点设计

用户提出的目标事件：

```text
form_submit
lead_submit_success
return_miniprogram_click
```

当前系统已支持的事件名：

```text
page_view
button_click
phone_click
form_submit
```

当前数据库 `marketing_events_event_name_check` 也只允许以上 4 个值。因此落代码时有两个选择。

### 方案 A：MVP 兼容现有事件名

不改数据库枚举，先用现有事件名：

1. 点击提交或发起提交时记录 `form_submit`
2. 提交成功后仍记录 `form_submit`，但 payload 增加：

```json
{
  "phase": "success",
  "lead_id": "xxx",
  "already_submitted": false
}
```

3. 点击返回小程序时记录 `button_click`，payload 增加：

```json
{
  "action": "return_miniprogram_click"
}
```

优点：改动小，不需要 migration。

缺点：后台统计时需要按 payload 聚合。

### 方案 B：扩展事件名

新增事件名：

```text
lead_submit_success
return_miniprogram_click
```

需要同步修改：

1. `packages/domain/src/marketing-page.ts`
2. `apps/api/src/schema/marketing-pages.ts` 使用的 domain 枚举
3. Supabase migration，放宽 `marketing_events_event_name_check`
4. admin 统计展示中的事件 label
5. 小程序端如果依赖 domain 包，需要同步更新 `@gooes/domain`

优点：事件语义清晰，统计查询简单。

缺点：需要数据库、domain、API、admin 同步发布。

推荐：本次如果只做提交成功态，先用方案 A；如果要把数据统计也一并产品化，直接做方案 B。

## 八、前后端接口落点

### H5 前端

预计修改：

```text
apps/h5
```

需要实现：

1. 表单提交 loading
2. 提交成功态组件
3. `localStorage` 读取和写入
4. “返回小程序”能力检测与降级
5. “继续浏览活动”滚动行为
6. “修改信息”切回表单
7. 埋点调用

### API

预计修改：

```text
apps/api/src/services/marketing-pages.ts
apps/api/src/repositories/marketing-pages.ts
apps/api/src/controllers/marketing-pages/index.ts
apps/api/src/schema/marketing-pages.ts
```

需要实现：

1. `submitLead` 中增加 24 小时查重
2. repository 增加 `findRecentLeadByPageAndPhone`
3. 查到重复时返回原线索，不新增记录
4. 推荐更新原线索的最新表单字段
5. 响应中增加 `already_submitted`、`updated_existing`、`phone_tail`

### Supabase

如果加索引：

```text
supabase/migrations
```

如果采用事件方案 B，还需要新增放宽埋点事件约束的 migration。

## 九、验收标准

### 提交成功态

1. 用户点击提交后按钮进入 loading
2. 请求未完成前不能再次点击提交
3. 提交成功后表单被成功提示替换
4. 成功提示展示手机号后四位
5. 页面展示“返回小程序”和“继续浏览活动”

### 已提交回访

1. 用户提交成功后刷新当前 H5 页面，仍展示已提交状态
2. 24 小时内再次进入同一个 slug，展示已提交状态
3. 点击“修改信息”后重新展示表单
4. localStorage 过期后恢复正常表单

### 后端防重

1. 同一 `page_id + phone` 24 小时内连续提交，只保留一条有效线索
2. 第二次提交返回 `already_submitted = true`
3. 第二次提交不产生新的 `marketing_leads` 行
4. 不同手机号可以正常创建新线索
5. 同手机号但不同活动页可以正常创建新线索

### 埋点

1. 表单提交有 `form_submit`
2. 提交成功能被统计到
3. 点击返回小程序能被统计到
4. 埋点写入不能触发数据库约束错误

### 微信 web-view

1. 微信 web-view 内点击“返回小程序”可以回到小程序上一页或指定页面
2. 非微信环境下可以降级 `history.back()`
3. 无法返回时不展示失效按钮，或展示明确降级文案

## 十、后续增强方向

MVP 跑通后，再考虑：

1. 小程序打开 H5 前换取短期 H5 session token
2. H5 通过 token 查询当前用户是否已提交该活动
3. 后端按 `customer_id/openid + page_id` 做更准确的提交状态判断
4. admin 后台展示重复提交次数和最近修改时间
5. 支持活动页级别的提交后跳转配置
6. 支持用户提交后领取券、进群、预约到店等下一步动作

## 十一、推荐执行顺序

1. 先实现 H5 前端成功态和 `localStorage` 回显
2. 再实现 API 24 小时幂等
3. 同步调整接口响应，前端兼容旧响应
4. 做埋点兼容，先避免数据库约束错误
5. 最后验证微信 web-view 内返回能力

这样可以先把用户体验和重复线索风险降下来，再逐步增强身份识别能力。

## 十二、H5 session token 过期处理

如果后续接入“小程序打开 H5 前换取短期 token”的方案，token 过期后不建议强制用户回小程序重新打开页面。营销活动页的优先级是转化，token 只是身份识别增强能力，不能因为身份过期阻断预约提交。

推荐原则：

```text
token 有效：
  -> API 绑定 customer_id/openid
  -> 可查询当前用户是否已提交该活动
  -> 线索、埋点都能做用户归因

token 过期：
  -> 活动页仍可正常浏览
  -> 表单仍可提交
  -> 线索按 page_id + phone 做 24 小时防重
  -> 不绑定 customer_id/openid
  -> 前端仍展示正常成功态
```

### 1. 页面加载时 token 已过期

H5 仍正常展示活动页，不直接报错。

处理规则：

1. 如果本地 `localStorage` 命中过当前 `slug` 的已提交记录，展示已提交状态
2. 如果本地没有记录，展示正常表单
3. H5 可以把身份状态标记为 `anonymous` 或 `expired`
4. 不展示“登录失效，请重新打开”这类会打断转化的提示

### 2. 提交线索时 token 过期

后端不应该因为 token 过期让预约失败。

推荐行为：

1. 后端识别 token 过期
2. 线索继续创建或按手机号幂等命中已有线索
3. `customer_id`、`wx_openid` 留空
4. 响应里返回身份状态，方便前端调试和埋点

响应示例：

```json
{
  "data": {
    "lead_id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
    "already_submitted": false,
    "updated_existing": false,
    "phone_tail": "4738",
    "identity_status": "expired",
    "message": "预约已提交"
  }
}
```

前端收到后仍进入 `submitted` 状态，并写入本地缓存。

### 3. 埋点时 token 过期

埋点照常写入，不绑定用户身份。

建议 payload 增加：

```json
{
  "identity_status": "expired"
}
```

这样后续统计时可以区分：

1. 已识别用户行为
2. token 过期但仍完成转化的行为
3. 完全匿名访问行为

### 4. 已提交状态查询时 token 过期

如果后续新增“查询当前用户是否已提交当前活动”的接口，token 过期时不能再准确判断当前客户身份。

推荐降级：

1. 后端返回 `identity_status = expired`
2. 前端不弹错误
3. 前端回退使用 `localStorage`
4. 如果本地没有记录，展示表单

### 5. token 有效期建议

推荐有效期：

```text
30 分钟
```

原因：

1. 足够用户浏览活动页并填写预约
2. 泄露风险可控
3. 小程序每次打开 H5 前都可以重新申请 token，正常用户很少会遇到过期

如果活动页内容很长，或者用户平均停留时间较高，可以放宽到 60 分钟，但不建议超过 2 小时。

### 6. 不推荐的处理方式

不建议：

1. token 过期后强制跳回小程序
2. token 过期后禁止提交表单
3. token 过期后要求用户重新登录
4. 把 `openid` 直接拼到 H5 URL

这些都会增加流失，且没有必要。H5 的核心业务目标是收集线索，身份绑定应该增强链路，而不是阻断链路。
