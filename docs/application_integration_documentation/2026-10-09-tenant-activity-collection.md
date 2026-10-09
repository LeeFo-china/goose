# 租户员工活跃统计：小程序配套与平台展示

本次实现于 gooes；不修改 orange。本文件记录接口及统计口径，尚未上线生产。

## 目标与范围

超管租户列表增加近7日有效使用摘要：最后使用、跨端去重员工数、后台/小程序员工数、活跃天数。详情增加成功登录次数和五类业务动作数量。统计按北京时间自然日，窗口包含今天，不做活跃评分、累计历史还原或30日趋势。

有效使用=主动浏览受权业务页面，或服务端记录的成功业务动作。登录次数独立统计，单纯登录不会增加有效使用人数/天数。公司管理员也是员工身份；客户、访客、平台员工排除。同一手机兼员工/客户按当前认证身份，不按手机号合并。

## 小程序主动浏览接口

```http
POST /tenant-activity/view
Authorization: Bearer <当前员工token>
Content-Type: application/json

{"screen":"projects"}
```

screen 仅 customers / projects / dashboard / finance，分别要求 customer.read / project.read / dashboard.read / finance.reports.read 及对应服务模块访问权限。不接受tenant_id、employee_id、channel、计数或时间。后端从认证token与有效员工上下文取得租户/员工/渠道；不满足员工条件返回403，非法body400，认证失败401。

成功响应：`{data:{recorded:true|false},message:"success"}`。false表示事件重复等未新增情况，不代表未登录。服务端按租户/员工/渠道/screen/5分钟桶去重，时间由服务器确定。该POST只写使用统计，业务访问按read处理，允许合法只读宽限期，不放开业务写入。

小程序团队应仅在员工主动进入成功加载的业务页面、从后台恢复到可见业务页面时上报；不得在定时轮询、静默登录、预加载、onShow重复回调中无限上报。同一员工/租户/screen本地5分钟去重、请求期间去重；跨北京时间午夜允许新一天首次上报；仅成功后记录去重标记。失败不阻断业务，下次真实导航/恢复时再尝试，不循环重试。切换租户/员工须更换去重key。客户和访客页面不上报。

gooes 后台已接入主动导航/恢复可见采集。orange 未改动，未配套前小程序员工“纯浏览”不在覆盖范围，超管页面明确说明这一限制。

## 后端自动采集

仅成功HTTP响应对应的明确动作；实际账号权限仍由原业务接口决定。

- 后台登录：POST /admin/auth/login 返回有效租户员工会话。
- 小程序主动登录：POST /auth/phone-login/verify、/auth/phone-login/select、/auth/verify-role 返回有效员工会话；待选身份、客户、访客、平台管理员不计。微信静默鉴权不计，所以名称为主动登录次数，不是小程序打开次数或所有token签发次数。
- 新增客户：POST /customers。
- 新增跟进：POST /customers/:id/follow_ups。
- 新建项目：POST /projects。
- 施工日志：POST /project-logs。
- 员工处理验收：POST /project-acceptances/:id/{submit,approve,reject,rectification}；客户确认不混入。

新增类动作以成功返回的持久化资源ID幂等；验收状态变更使用ID+状态+更新时间，整改使用本次持久化动作ID。手机号登录使用服务端验证/选择会话ID，避免身份选择重试重新签发token时重复计数；其他登录使用token不可逆摘要。幂等键最终均摘要存储，不保存token。内部事件标识绑定在响应对象的WeakMap中，不增加对外响应字段。业务响应发出后采集，失败记录TENANT_ACTIVITY_COLLECTION_FAILED结构化告警，不能使成功业务被客户端当成失败重试。此为尽力采集的运营指标，并非财务审计账本；停机或采集异常不能从缺失数据推断零活跃。

## 平台读取

沿用 GET /platform/tenants 的分页及 GET /platform/tenants/:id 权限（platform.tenant.read），追加activity。单次最多100租户批量读取近7日汇总，无逐租户明细扫描；端内人数分别去重，总人数再跨端去重，不能简单相加。最后使用不受近7日窗口截断，登录本身不更新最后有效使用。

字段：status、collection_started_at、window_start、window_end、observed_days、last_active_at、active_employee_count、admin_active_employee_count、mini_active_employee_count、active_days、admin_login_count、mini_login_count、business_actions。

status=collecting 表示采集不足完整窗口；无采集起点时所有计数为null，不显示成0。ready表示已覆盖窗口；读取失败unavailable、计数null。采集不足7天必须展示起点和观察天数。上述状态是采集状态，不是租户活跃评分。

business_actions 分别含 customer_created、follow_up_created、project_created、construction_log_created、acceptance_handled；不合成缺乏业务意义的总分。

## 发布与验收

先应用受版本控制的migration，再部署API，再部署admin。不得手动在生产补造历史事件。应用migration前核对清单，后用supabase migration list验证对齐。

小程序验收：同员工跨端总人数1；客户身份不计；恢复可见去重；仅登录不算有效使用；主动看项目可在只读宽限期计活跃；失败不阻断页面；无轮询刷数。平台验收：未采集、采集中、已采集零值、不可用四种文案区分，列表和详情数据一致，租户隔离，分页正常。
