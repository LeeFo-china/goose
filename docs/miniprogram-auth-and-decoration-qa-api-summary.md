# 小程序身份验证与装修问答接口摘要

本轮前端已完成以下能力，需要后端配合实现 3 个接口。

## 1. 身份验证 - 发送验证码
### 接口
```http
POST /auth/send-code
```

### 用途
游客页点击：
- 我是客户
- 我是员工

后，输入手机号并点击“获取验证码”时调用。

### 请求参数
```json
{
  "phone": "13877778888",
  "scene": "bind_customer"
}
```

或：
```json
{
  "phone": "13877778888",
  "scene": "bind_employee"
}
```

### 参数说明
- `phone`: 用户输入的手机号
- `scene`:
  - `bind_customer`
  - `bind_employee`

### 响应格式
```json
{
  "message": "验证码已发送"
}
```

### 后端职责
- 校验手机号格式
- 按场景发送短信验证码
- 做发送频控（如 60 秒内不可重复发送）
- 验证码建议设置有效期（如 5 分钟）

---

## 2. 身份验证 - 校验角色并升级登录态
### 接口
```http
POST /auth/verify-role
```

### 用途
游客在 visitor 页面完成手机号 + 验证码校验后，调用该接口完成身份识别与切换。

### 请求参数
```json
{
  "phone": "13877778888",
  "code": "123456",
  "target_role": "customer"
}
```

或：
```json
{
  "phone": "13877778888",
  "code": "123456",
  "target_role": "employee"
}
```

### 参数说明
- `phone`: 用户输入手机号
- `code`: 短信验证码
- `target_role`:
  - `customer`
  - `employee`

### 前端现状说明
当前调用这个接口时，前端已经持有 visitor 登录态，即：
- 已经通过 `/auth` 拿到 token
- 已经有当前微信用户身份（openid 对应 visitor）

### 后端推荐处理逻辑
#### 如果 `target_role = customer`
1. 校验验证码
2. 用手机号查客户数据
3. 将当前微信用户 / auth_user 与 customer 建立绑定关系
4. 重新签发 JWT
5. 返回 customer 角色

#### 如果 `target_role = employee`
1. 校验验证码
2. 用手机号查员工数据
3. 将当前微信用户 / auth_user 与 employee 建立绑定关系
4. 重新签发 JWT
5. 返回 employee 角色

### 成功响应格式
```json
{
  "data": {
    "token": "jwt-token",
    "user_id": "auth-user-id",
    "roles": ["customer"],
    "is_new_user": false
  },
  "message": "身份验证成功"
}
```

或：
```json
{
  "data": {
    "token": "jwt-token",
    "user_id": "auth-user-id",
    "roles": ["employee"],
    "is_new_user": false
  },
  "message": "身份验证成功"
}
```

### 前端收到后会做什么
前端会：
1. 更新本地 `token`
2. 更新本地 `userInfo`
3. 根据 `roles` 跳转：
   - `employee` → 工作台
   - `customer` → 客户主页
   - 否则 → visitor 页

### 失败响应建议
请返回明确 `message`，前端会直接展示给用户。

例如：
```json
{
  "message": "验证码错误"
}
```

或：
```json
{
  "message": "该手机号未绑定客户身份"
}
```

### 注意
请不要把“手机号查不到对应员工/客户”返回成 500。
这属于业务校验失败，建议返回 400/422，并带清晰 message。

---

## 3. 装修知识问答
### 接口
```http
POST /ai/decoration-qa
```

### 用途
游客页点击“装修知识问答”后进入独立问答页，输入问题或点击热门问题时调用。

### 请求参数
```json
{
  "question": "装修预算怎么控制？",
  "history": [
    {
      "role": "user",
      "content": "装修预算怎么控制？"
    },
    {
      "role": "assistant",
      "content": "建议从硬装、主材、软装三个维度控制预算..."
    }
  ]
}
```

### 参数说明
- `question`: 当前问题
- `history`: 之前的问答上下文
  - `role`: `user` / `assistant`
  - `content`: 消息内容

### 成功响应格式
```json
{
  "data": {
    "answer": "控制装修预算建议从以下几个方面入手：1. 明确总预算；2. 区分必做项与可选项；3. 控制材料升级范围。",
    "suggestions": [
      "全包和半包怎么选？",
      "如何避免装修增项？"
    ]
  },
  "message": "success"
}
```

### 字段说明
- `answer`: AI 主回答内容
- `suggestions`: 推荐追问，可选

### 后端建议
后端调用大模型时，建议加装修场景系统提示词，例如：

#### 系统角色建议
- 你是装修顾问
- 擅长回答：
  - 装修预算
  - 材料选择
  - 工期安排
  - 施工流程
  - 家装避坑建议

#### 回答要求
- 简洁
- 条理化
- 尽量列表化
- 不要夸大承诺
- 不替代结构安全判断
- 涉及高风险施工时提醒“以现场专业评估为准”

### 前端现状
前端已支持：
- 推荐问题点击提问
- 输入框提问
- 多轮问答 history 传递
- 展示 answer
- 展示 suggestions（会拼接在回答末尾）

### 失败响应建议
请返回可读 `message`，例如：
```json
{
  "message": "问答服务暂时不可用，请稍后重试"
}
```

---

# 统一返回规范建议

## 成功
```json
{
  "data": { ... },
  "message": "success"
}
```

## 失败
```json
{
  "message": "错误原因说明"
}
```

并配合正确 HTTP 状态码：
- 400 / 422：业务校验失败
- 401：未登录或 token 失效
- 500：服务端异常

---

# 当前前端已完成对接
前端已完成以下页面和能力：

## visitor 页
- 身份验证入口
- 获取验证码
- 提交身份验证
- 装修问答入口
- 热门问题跳转

## 问答子包页
- 路径：
```text
/packageAi/pages/decorationQa/index
```
- 已支持：
  - 输入提问
  - 推荐问题
  - history 透传
  - 展示 answer / suggestions
