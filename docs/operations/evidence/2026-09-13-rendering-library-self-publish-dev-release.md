# 租户效果素材自助发布：开发环境验收记录

日期：2026-09-13。范围仅为 gooes 开发库、API、Admin 与非客户合成图片；未访问生产库，未修改 `orange`。API/Admin 运行镜像的提交为 `7bd8b4819f78112cd29532f38d408209c561f2e9`，来自 `feat/customer-rendering-quota`。后续证据文档提交不改变运行镜像。

## 迁移与隔离 SQL

- [应用前 plan](https://github.com/LeeFo-china/goose/actions/runs/34729471368)：开发库 618 个已应用版本，仅 `20260913001512` 待执行。
- [既有迁移工作流 apply](https://github.com/LeeFo-china/goose/actions/runs/34729500808)：仅应用 `20260913001512_publish_tenant_rendering_styles.sql`；版本数 618 → 619，最新版本为 `20260913001512`。没有手工远端 DDL/DML 修库。
- [应用后只读 plan](https://github.com/LeeFo-china/goose/actions/runs/34729548226)：待执行数 0。
- [严格核对与 SQL 测试](https://github.com/LeeFo-china/goose/actions/runs/34729805792)：使用开发 runner 上已配置的直连 URL 执行 `supabase@2.99.0 migration list`，`verify-migration-history.mjs` 报告 `migration_history_aligned=true`、`target_migration_present=true`；`supabase/tests/tenant_rendering_style_publication.sql` 退出成功且以 `ROLLBACK` 结束。复核仍为 619 个版本、待执行数 0。SQL 中的合成租户、员工及文件行未持久化。

以上 SQL 覆盖角色权限、跨租户引用、发布快照、租约和幂等的串行可观察结果；不等同真实双连接锁等待测试。若需撤回应用行为，应停止相关 API/Admin 入口并通过新的前向 migration 处理，不能删除既有发布事实或直接回滚迁移历史。

## 构建、发布与网络 smoke

- [开发镜像构建](https://github.com/LeeFo-china/goose/actions/runs/34729926174)：API、Admin 构建成功。仅这两项被选择部署；未部署 Web/H5/Worker 或小程序。
- [API 开发发布](https://github.com/LeeFo-china/goose/actions/runs/34730212024)及[Admin 开发发布](https://github.com/LeeFo-china/goose/actions/runs/34730302715)均成功，工作流核对镜像摘要、修订号、健康状态和已有项目健康 smoke。
- 额外 HTTPS 检查：API `/` 为 200；微信与抖音素材列表无 token 均为 401；Admin 登录及 `/rendering-library` 页面为 200；登录后 Admin 代理列表为 200，`page=1&pageSize=1` 的分页结构有效。
- 使用既有开发租户 Admin smoke 账号和进程内会话，上传程序生成的纯色 PNG，服务端转换为 WebP。私有签名预览为 200、去除签名后的匿名读取为 403；创建、发布均为 200。COS 原站公开副本匿名读取为 200，SHA-256 与签名读取的源图一致。相同幂等键重放仍是原版本；随后隐藏成功，Admin 详情状态为 `hidden`。样本标题标明“开发验收合成样本”，来源标为 `ai_concept`；没有使用客户房间照片。测试账号、token、文件 ID、签名 URL 和对象路径均未写入证据。

## 尚未验收

- 没有可用的同租户微信 visitor 和抖音小程序有效测试会话；因此尚未在真实已认证双端列表/详情上验证发布可见、隐藏后的列表消失与详情 404。离线接口测试及 SQL 断言不能替代此项。
- 公开副本验证的是 COS 原站匿名访问，不是配置的最终 CDN/客户端 `image_url`；CDN 缓存与隐藏后的旧 URL 可访问性没有验收。隐藏只保证新 API 请求不返回该记录，不撤销已缓存图片。
- 合成样本的素材记录已隐藏，私有源与公开副本对象仍保留以供审计；本次没有执行对象删除或回滚演练。
- 微信 `orange` 页面、抖音小程序页面、客户照片上传/AI 生成、方舟计费调用及装修建议均不在本次发布范围。
