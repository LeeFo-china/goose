# 小程序端 H5 活动页线索提交对接文档

日期：2026-05-04

## 一、对接范围

当前后端已支持 H5 活动页线索提交防重复和小程序短期 H5 token：

1. 同一个活动页 `page_id + phone` 24 小时内重复提交，不再创建新线索
2. 重复提交会更新原线索的最新表单信息
3. 提交接口返回 `already_submitted`、`updated_existing`、`phone_tail`
4. 埋点事件名仍沿用现有枚举，不新增事件名
5. 小程序打开 H5 前可以申请短期 `h5_token`
6. H5 提交线索和埋点时会自动携带 token
7. token 有效时，后端会写入 `customer_id` / `wx_openid`

推荐小程序端打开 H5 活动页的链路：

```text
GET /public/marketing-pages?scene=marketing_list
  -> 取接口返回的 slug/url
  -> 调 POST /wechat/h5-session 换取短期 token
  -> web-view 打开 https://h5.goodcms.cn/p/{slug}?token={h5_token}
```

如果申请 token 失败，小程序仍可以直接打开接口返回的 `url`，H5 会按匿名链路继续提交线索。

## 二、申请 H5 短期 token

接口：

```text
POST https://h5.goodcms.cn/wechat/h5-session
```

鉴权：

```text
Authorization: Bearer {小程序登录 token}
```

请求：

```json
{
  "slug": "springsale",
  "scene": "marketing_list"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `slug` | 是 | H5 活动页路径 |
| `scene` | 否 | 小程序入口场景，例如 `home`、`customer_home`、`marketing_list` |

响应：

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_at": "2026-05-04T10:30:00.000Z",
    "identity_status": "identified",
    "customer_id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a"
  },
  "message": "H5 访问凭证已生成"
}
```

说明：

- token 默认有效期 30 分钟。
- token 只用于 H5 营销页提交和埋点，不是小程序登录 token。
- token 会绑定当前小程序登录用户的 `openid`。
- 如果当前登录用户已经绑定 customer，token 会包含 `customer_id`。
- 如果用户未绑定 customer，但有 openid，`identity_status` 仍可能是 `identified`，后端会至少写入 `wx_openid`。

小程序拼接 H5 URL：

```ts
const h5Url = `${page.url}?token=${encodeURIComponent(session.token)}`;
const webviewUrl = `/pages/webview/index?url=${encodeURIComponent(h5Url)}`;
```

H5 会在加载后读取 `token`，并从地址栏移除该参数，避免 token 留在分享 URL 或浏览器历史里。

## 三、H5 线索提交接口

接口：

```text
POST https://h5.goodcms.cn/public/marketing-pages/{slug}/leads
```

请求示例：

```json
{
  "name": "李先生",
  "phone": "18638374738",
  "community": "中原小区",
  "city": "郑州",
  "form_data": {
    "name": "李先生",
    "phone": "18638374738",
    "community": "中原小区"
  },
  "token": "H5短期token"
}
```

手机号为必填。后端会拒绝空手机号或格式无效的手机号，避免产生无法防重的空线索。

如果 H5 页面 URL 带了 `token`，H5 会自动提交该字段，小程序端不需要直接参与表单提交。

## 四、首次提交成功响应

```json
{
  "data": {
    "lead_id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
    "already_submitted": false,
    "updated_existing": false,
    "phone_tail": "4738",
    "identity_status": "anonymous",
    "message": "预约已提交",
    "lead": {
      "id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
      "phone": "18638374738",
      "customer_id": "customer-id-or-null",
      "wx_openid": "openid-or-null"
    }
  }
}
```

前端处理：

1. 表单切换为成功状态
2. 展示 `message`
3. 展示手机号后四位：`已提交手机号：****4738`
4. 写入本地缓存
5. 禁用当前页面重复提交

`identity_status` 可能值：

| 值 | 含义 | 前端处理 |
| --- | --- | --- |
| `identified` | token 有效，已识别小程序用户 | 正常成功态 |
| `expired` | token 过期 | 正常成功态，不要求用户重开页面 |
| `anonymous` | token 缺失或无效 | 正常成功态 |

推荐本地缓存：

```text
gooes:h5:lead:{slug}
```

缓存内容：

```json
{
  "slug": "springsale",
  "leadId": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
  "phoneTail": "4738",
  "submittedAt": "2026-05-04T10:30:00.000Z",
  "expiresAt": "2026-05-05T10:30:00.000Z"
}
```

## 五、24 小时内重复提交响应

同一个活动页、同一个手机号，24 小时内再次提交：

```json
{
  "data": {
    "lead_id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
    "already_submitted": true,
    "updated_existing": true,
    "phone_tail": "4738",
    "identity_status": "anonymous",
    "message": "你已提交预约",
    "lead": {
      "id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
      "phone": "18638374738"
    }
  }
}
```

前端处理：

1. 不把它当错误
2. 仍展示成功状态
3. 文案可用接口返回的 `message`
4. 更新本地缓存的 `submittedAt` 和 `expiresAt`
5. 不再允许直接继续点提交

说明：

- `already_submitted = true` 表示后端命中了 24 小时防重。
- `updated_existing = true` 表示后端没有新增线索，但已把最新填写的信息同步到原线索。

## 六、推荐 H5 成功态

提交成功后替换表单：

```text
预约已提交
顾问会尽快与您联系，请保持电话畅通
已提交手机号：****4738

[返回小程序] [继续浏览活动]
```

按钮行为：

1. `返回小程序`：优先调用 `wx.miniProgram.navigateBack()`
2. 非微信环境：降级 `history.back()`
3. 无法返回：隐藏按钮或显示“关闭页面后查看”
4. `继续浏览活动`：滚动到页面顶部或活动内容区

## 七、已提交用户再次进入

H5 页面加载时读取：

```text
gooes:h5:lead:{slug}
```

如果缓存存在且未过期：

```text
展示已提交状态
不默认展示空表单
显示手机号后四位
提供“返回小程序”和“修改信息”
```

如果用户点击“修改信息”：

```text
切回表单
允许用户重新填写
提交后仍调用同一个 leads 接口
```

后端会继续按 24 小时防重处理。

## 八、埋点对接

第一版不新增事件名，避免数据库约束错误。

### 表单提交

```text
POST /public/marketing-pages/{slug}/events
```

```json
{
  "event_name": "form_submit",
  "block_id": "lead_form_xxx",
  "payload": {
    "phase": "submit"
  },
  "token": "H5短期token"
}
```

### 提交成功

```json
{
  "event_name": "form_submit",
  "block_id": "lead_form_xxx",
  "payload": {
    "phase": "success",
    "lead_id": "7d6c9f7b-9e8f-4a6e-b7b7-3d0c0e4f3f9a",
    "already_submitted": false
  },
  "token": "H5短期token"
}
```

### 返回小程序点击

```json
{
  "event_name": "button_click",
  "block_id": "lead_form_xxx",
  "payload": {
    "action": "return_miniprogram_click"
  },
  "token": "H5短期token"
}
```

后端会自动把 `identity_status` 合并进埋点 payload，并在 token 有效时写入 `customer_id` / `wx_openid`。

当前允许的事件名只有：

```text
page_view
button_click
phone_click
form_submit
```

不要直接传：

```text
lead_submit_success
return_miniprogram_click
```

否则会被后端 schema 或数据库约束拒绝。

## 九、token 过期和降级

token 过期不阻断 H5：

```text
token 有效：
  -> 绑定 customer_id / wx_openid
  -> identity_status = identified

token 过期：
  -> 线索仍可提交
  -> 按 page_id + phone 做防重
  -> 不绑定 customer_id / wx_openid
  -> identity_status = expired

token 缺失或无效：
  -> 匿名提交
  -> identity_status = anonymous
```

小程序端建议：

1. 每次打开 H5 前都重新申请 token
2. 申请失败时仍打开原始 H5 URL
3. 不把 openid 直接拼到 H5 URL
4. 不缓存 H5 token 到长期存储

## 十、错误处理

推荐处理：

1. 申请 H5 token 失败：降级打开原始 H5 URL
2. 网络异常：保留表单，提示“提交失败，请稍后重试”
3. 手机号格式错误：提示“请输入有效的手机号”
4. `already_submitted = true`：不是错误，展示成功态
5. H5 页面未发布或下线：展示活动不可用

## 十一、验收清单

1. 首次提交后展示成功态
2. 成功态展示手机号后四位
3. 刷新页面后 24 小时内仍展示已提交状态
4. 同一活动同一手机号连续提交两次，后台只产生一条线索
5. 第二次提交接口返回 `already_submitted = true`
6. 点击“修改信息”后可以重新展开表单
7. 返回小程序按钮在微信 web-view 内可返回
8. 埋点写入不报事件名错误
9. 小程序打开 H5 前能成功申请 token
10. H5 提交线索后 `marketing_leads.wx_openid` 有值
11. 已绑定客户身份时 `marketing_leads.customer_id` 有值
