# 抖音私有图片上传客户端本地验收

2026-09-13。仅记录脱敏本地结果；没有使用家庭照片，也不记录 token、签名 URL、COS 对象路径或真实文件 ID。

- 详情页房间照必传、户型图可选；房间照确认 `pending_review` 前，户型图入口不可用。确认结果只保留私有 file_id 与待审核状态，没有 AI 生成入口。
- 已确认的 file_id 在同一小程序 API 会话内随详情页重进保留；不持久化图片字节或签名 URL。回归先复现重进后 file_id 变空，再修复并确认不会重复签发上传意图。
- intent/complete 由现有 `ApiClient` 发送业务会话，401 经既有会话刷新逻辑；COS PUT 独立使用 `tt.request`，发送 ArrayBuffer 原始字节，不使用 multipart，也不附加业务 Authorization。传给原生 API 的 `header` 对象与服务端返回值一致，且先核对声明长度、MIME、私有 ACL 和禁止覆盖头。网络结果不确定时仅尝试 complete；processing 409 退避重试同一 ID，仍未完成则在同一小程序会话内保留该 ID，离开详情页再进入仍可继续。页面隐藏时若 PUT 尚在传输，继续确认会等待原 PUT 结束；不会先用 422 清掉正在上传的 ID。终态 404/409 清除无效 ID 并提示重选。重复 complete 的客户端合同测试返回相同 file_id。
- 本地通过字节签名检查静态 JPEG、PNG、WebP，拒绝 APNG、动画 WebP、超出 10 MiB 和未真实转码的 HEIC/HEIF。抖音选择器若返回已实际转成 JPEG/PNG/WebP 的字节可继续，否则拒绝；没有通过修改扩展名或 MIME 伪装转码。
- `apps/douyin-mini/project.config.json` 的 `urlCheck` 为 true。打开本机抖音开发者工具 4.5.5 中的该项目后，工程配置显示“**不校验合法域名**”未勾选；域名配置显示开发项目的 request 合法域名**仅有 API 开发域名**，没有 COS 主机，upload 合法域名也未设置。由于 PUT 使用 `tt.request`，必须将签名 URL 的实际 COS origin 加入目标小程序的 **request** 合法域名；签名主机随 bucket/region 变化，要在开放平台「开发 > 开发配置 > 域名管理」核对。开发者工具开启“跳过域名校验”不构成验收。抖音[网络规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/network/network)要求 HTTPS 白名单，并建议关闭跳过校验后测试。[tt.request 规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/network/http/tt-request)支持 PUT 与 ArrayBuffer，但没有承诺各端原样发送手动设置的 Content-Length。
- 本机有已配对 iPhone。开发者工具首次启动时，进程继承了本机 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量；平台设置请求在 `mp_request_meta` 阶段报 `protocol mismatch`，随后运行时错误地请求 `app-dist/undefined/webview.js`，本地服务返回 HTML 404，触发 MIME 报错。对同一平台设置请求做隔离测试：工具所用 HTTP 客户端经代理失败，直连返回 200；退出旧工具进程并由系统正常启动（新进程未继承这些代理变量）后，模拟器成功显示小程序首页，原两条报错消失。该 MIME 报错是启动失败后的次生现象，没有修改项目源码或关闭域名校验。当时因 COS request 域名缺失、私有输入服务端未发布，未执行真机签名 PUT，也未上传合成图片；后续服务端已发布，但本次仍无真机上传证据，模拟器恢复不等于真机上传通过。
- **待真机验证**：iOS 与 Android 各使用非家庭合成静态图，在跳过校验关闭后抓取脱敏请求头名称和值类别、HTTP 状态与实际传输字节数；确认 COS 请求没有 Bearer、不是 multipart，Content-Length 等于选图字节数，四个服务端头都到达 COS。分别验证 401、目标端 409、422、处理中同 ID 重试和重复确认同 file_id。只记录状态码、错误 code 与一致性布尔值，不能记录凭据、签名 URL 或图片。
- 服务端私有输入 migration、API/COS 已发布；真实 COS 策略核对与双端真机链路仍是上线前置条件，本地单测不能替代它们。
- 本地静态与单测（2026-09-14 复跑）：抖音 `bun run check` 364 通过、0 失败且 TypeScript 检查通过；API 相关 26 通过、0 失败；`git diff --check` 通过。

## 体验版选图失败复查

用户反馈“选择照片”显示通用上传失败。本地模拟器用页面相同参数调用 `tt.chooseImage`，原生失败回调为 `chooseImage:fail api scope is not declared in the privacy agreement`；页面此前把所有非取消的选择失败归为 `IMAGE_SELECTION_FAILED`，最终落入通用上传失败文案。失败发生在文件读取和 intent 之前，因此本次没有发出 COS PUT，也没有处理真实照片。开发环境使用现有会话向 intent 发送无效空 DTO，得到 400 `VALIDATION_ERROR`，仅证明开发环境路由可达，不能证明体验版目标环境和有效上传链路已就绪。

本地客户端现已识别未声明的隐私范围、隐私协议未授权及普通选择失败，并给出不同提示；对应模拟器原生错误的回归测试已补。实际选图仍取决于应用所有者在抖音开放平台为 `tt.chooseImage` 声明“相册”信息类型并据实填写用途、生成协议。[官方开发指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/security-requirements/privacy-authorize)指出该错误对应未声明隐私类型，补充声明实时生效。平台协议尚未由本次本地排障提交；COS request 域名与真机 PUT 验收仍单独待办。
