# 抖音客户线索视频与账号归因设计

## 目标与边界

后续从已绑定品牌号或员工号的视频、直播或主页进入小程序并完成量房申请时，租户 Admin 的线索详情显示本次留资来源账号、视频或直播标识，以及归因依据。首期只做详情展示，不做列表筛选、统计、视频标题与封面，也不将客户端采集结果用于分佣结算。现有历史线索不补造归因。

## 来源采集

每次可识别的外部进入都重新读取启动路径与 query，并异步调用 `tt.getAnalysisInfo`。官方结果只接受文档列出的场景、账号、视频和直播字段；短视频以 `itemId` 为视频标识，`uniqueId` 为展示用抖音号，`postId` 为作者在小程序内的 openId。直播以 `roomId`、`anchorId` 为标识。未绑定的账号、不支持的入口或调用失败均视为未取得官方归因，不沿用上一次进入的数据。运行时要求基础库至少 2.99.0；`showFrom=10` 与启动信息变化用于识别重新进入，无法区分的同参数后台唤起需在真机验收中验证。

原有 `campaign_code`、`content_id` 继续作为开发者标记保留。官方信息优先；标记仅作为明确标注的兜底，不能伪装为平台识别。采集失败不阻止用户留资。应用内页面跳转沿用本次外部进入的快照。

## 留资与读取

扩展现有 `DouyinLaunchContextSchema` 和对应小程序类型，采用受限字段与长度校验。提交量房申请时最多等待 500 毫秒；超时固定本次入口的未知来源或标记来源，迟到的回调不能改变同一幂等键的请求。服务层将归因写入现有预约 `source_snapshot.attribution`，幂等重放复用原快照。租户详情仍从最近一次预约的不可变快照投影，明确该展示为“本次留资来源”。无需更改表结构，但现有预约 RPC 的归因白名单只允许五个字符串字段，必须通过前向 migration 扩展验证器后才能部署新客户端。

## Admin 与验证

详情展示来源类型、来源账号、视频或直播标识和采集依据。缺失字段显示“未识别”，不展示推断的账号或视频。验收用品牌号/员工号真实视频、直播、主页、直接打开和不支持入口，覆盖 iOS/Android、重复预约和快速提交。开发者工具的模拟结果只证明页面和接口联通，不替代真机入口验证。不开启生产数据库手工写入。

官方参考：[流量来源识别](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/open-capacity/operation/traffic-source-identification)、[tt.getAnalysisInfo](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/open-interface/analysis-info/tt-get-analysis-info)。
