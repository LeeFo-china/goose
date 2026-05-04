# 小程序端 H5 活动页线索提交对接文档

日期：2026-05-04

## 一、对接范围

本次后端第一版已支持 H5 活动页线索提交防重复：

1. 同一个活动页 `page_id + phone` 24 小时内重复提交，不再创建新线索
2. 重复提交会更新原线索的最新表单信息
3. 提交接口返回 `already_submitted`、`updated_existing`、`phone_tail`
4. 埋点事件名仍沿用现有枚举，不新增事件名
5. 暂不接入小程序 `openid` / H5 短期 token

小程序端现有 `web-view` 打开 H5 活动页的链路不需要改：

```text
GET /public/marketing-pages?scene=marketing_list
  -> 取接口返回的 url
  -> web-view 打开 https://h5.goodcms.cn/p/{slug}
```

## 二、H5 线索提交接口

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
  }
}
```

手机号建议必填。第一版后端仍兼容空手机号，但空手机号无法按 `page_id + phone` 做防重复。

## 三、首次提交成功响应

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
      "phone": "18638374738"
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

## 四、24 小时内重复提交响应

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

## 五、推荐 H5 成功态

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

## 六、已提交用户再次进入

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

## 七、埋点对接

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
  }
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
  }
}
```

### 返回小程序点击

```json
{
  "event_name": "button_click",
  "block_id": "lead_form_xxx",
  "payload": {
    "action": "return_miniprogram_click"
  }
}
```

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

## 八、错误处理

推荐处理：

1. 网络异常：保留表单，提示“提交失败，请稍后重试”
2. 手机号格式错误：提示“请输入有效的手机号”
3. `already_submitted = true`：不是错误，展示成功态
4. H5 页面未发布或下线：展示活动不可用

## 九、后续 token 版本预留

第一版 `identity_status` 固定为：

```text
anonymous
```

后续接入小程序 H5 短期 token 后，可能返回：

```text
identified
expired
anonymous
```

小程序端后续才需要在打开 H5 前做：

```text
小程序登录态
  -> 请求后端换取 h5_token
  -> web-view 打开 https://h5.goodcms.cn/p/{slug}?token={h5_token}
```

第一版无需实现这一步。

## 十、验收清单

1. 首次提交后展示成功态
2. 成功态展示手机号后四位
3. 刷新页面后 24 小时内仍展示已提交状态
4. 同一活动同一手机号连续提交两次，后台只产生一条线索
5. 第二次提交接口返回 `already_submitted = true`
6. 点击“修改信息”后可以重新展开表单
7. 返回小程序按钮在微信 web-view 内可返回
8. 埋点写入不报事件名错误
