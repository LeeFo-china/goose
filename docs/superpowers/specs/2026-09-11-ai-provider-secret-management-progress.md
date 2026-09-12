# AI 供应商密钥管理实施记录

日期：2026-09-11

范围：本记录主体为本地功能实现；后续开发发布结果见文末补充。没有读取真实凭据或调用收费模型，不涉及生产部署。

## 实施

- 供应商编辑页改为选择登记的 AI 密钥配置；保存基本信息后继续停留在编辑区，可独立配置／更换真实密钥。
- 密钥弹窗显示目标配置、共享影响及“未验证”语义。空白不发送请求，保存期间禁止重复提交，关闭或切换目标清空输入；错误不自动重试。
- GET `/platform/ai-config/secret-settings` 返回 `{ list, can_manage }`；固定四项、单次有界查询，显式元数据 DTO，无秘密值或密文。
- PATCH `/platform/ai-config/secret-settings/:key` 只接受非空 `{ value }`，返回 `{ key, saved: true }`。平台身份及 AI／系统配置双权限前置，沿用加密、缓存失效及无值变更审计。
- 新增和显式更换供应商引用检查登记元数据。OpenRouter 固定引用；历史错误绑定只读脱敏、标记异常，无关字段修改保留旧绑定，不自动搬运疑似密钥。
- AI 系统配置页空白不再清空；非 AI 编辑器原行为不变。
- 已覆盖的 API 控制器/错误处理和 Admin 代理密钥响应设置 private/no-store；解析错误、URL 参数及连接失败日志定向脱敏。后续开发 smoke 发现直连 API 的全局未认证 401 不携带该头，不能将本地覆盖范围泛化到全部前置认证响应。
- 后端新增文件最终命名为 `schema/ai-secret-settings.ts`、`services/ai-config/secret-settings.ts`、`provider-reference.ts`，与计划职责一致。

## 根因与回归

1. 原通用编辑器把空输入转换为 null，已配置秘密也被视为 dirty；通过 AI 范围空白规则和 submit 防护解决，保留非 AI 清空。
2. 窄屏供应商网格挤压表格行，分页栏挡住编辑按钮；窄屏使用内容高度行，桌面保留等高工作区。浏览器先失败后通过，没有使用强制点击。
3. 供应商每次提交未变化的类型可能触发历史坏引用的校验；前端省略未变化类型，后端只对实际变更或显式引用重验，真实请求形态回归通过。
4. 系统配置元数据异常可能绕过加密或进入审计值；持久化前再次校验 AI 配置属性，审计按登记 key 强制去值。
5. Admin 连接失败原日志直接包含请求路径和异常文本；合成负例复现后增加定向脱敏。

## 本轮验证

- API：98 tests / 422 assertions 通过（AI 配置服务与控制器、schema、系统配置仓储、加密及定义回归）。
- Admin：97 tests / 559 assertions 通过（platform-ai、settings、backend proxy）。其中代理失败测试有预期的本地模拟连接失败日志，不含真实凭据。
- API 全量类型检查、API 构建通过（983 modules）。
- Admin `check` 通过，包括文件大小、Next route typegen 和 TypeScript 检查。
- Playwright Chromium：4 tests 通过，覆盖桌面／窄屏录入、独立保存、取消清空、未保存引用、失败不重试、只读／403／加载恢复及系统配置 AI/非 AI 空输入行为。
- 浏览器截图已人工检查；截图与 mock 只使用合成身份和输入，不证明真实模型可用。未运行全仓库所有测试。
- 规格独立复审和最终质量审查通过，无剩余 Critical/Important 问题。质量审查另行运行 API 21 tests / 120 assertions、Admin 12 tests / 47 assertions，全部通过。

## 实施完成时的发布准备

当前源码中的完整凭据形态测试字面量已替换为明确合成的测试数据；但原未发布祖先提交仍保留，不能声称 GitHub 历史扫描已解除。后续以保留原功能分支的方式准备干净发布历史，不允许绕过保护或强推共享分支。

开发发布前仍需复核精确待执行 migrations、备份、目标环境与固定版本，应用后使用 `supabase migration list` 验证；真实密钥由用户通过后台新入口填写。供应商密钥配置成功不等于模型登记、能力验证或真实生图成功。

## 后续开发发布补充

2026-09-11 用户确认后，保留功能历史并推送同树独立发布分支，GitHub 扫描通过；备份和两条开发 migration 应用完成，Supabase CLI 验证 614 条完整对齐。API/Admin 发布版本 `1384562fb465f930f6d00459431ea483aab455de`，Release Dev `34602675150` 成功，独立容器版本、digest、健康与未认证 smoke 检查完成。详情见 `docs/operations/evidence/2026-09-11-rendering-library-ai-secrets-dev-release.md`。

真实密钥录入、登录态业务写入和收费模型联调仍未执行；“已配置（未验证）”不代表调用成功。
