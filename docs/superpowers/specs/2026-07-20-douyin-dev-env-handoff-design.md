# 抖音开发环境九项凭证安全交接设计

**日期：** 2026-07-20

**状态：** 待书面确认

**动作编号：** A01

**目标环境：** development

## 1. 背景与目标

河南好店大数据科技有限公司主体的抖音开放平台服务商应用已经具备第三方小程序代开发权限。当前 Gooes 开发 API 需要九项 `DOUYIN_*` 配置，才能继续部署、配置回调并接收真实 `component_ticket`。

Chrome 控制通道已经按支持范围完成恢复与重试，但仍无法建立只读连接。用户已明确授权改用本机终端隐藏输入方案，并授权 A01：生成开发密钥并原子更新逻辑服务器 `gooes-dev-vm-0-11` 的 `/opt/gooes-dev/docker/.env.dev.api`；本动作不得重启容器、部署代码或配置抖音回调。

本设计的目标是提供一套可复用、可测试、默认不泄密的运维工具，使用户只需在本机终端隐藏输入四项控制台值，即可安全完成九项配置的生成、校验、备份和原子写入。

## 2. 范围

### 2.1 本次包含

- 隐藏读取 Component AppID、Component AppSecret、Template AppID、Template AppSecret。
- 对两项 AppSecret 进行二次隐藏确认。
- 使用本机 OpenSSL 生成其余五项开发配置。
- 复用 API 的真实 `loadDouyinMiniappConfig` 契约校验完整九项配置。
- 通过固定 SSH 别名 `gooes-dev` 更新固定目标文件。
- 写入前保留同权限时间戳备份和 SHA-256 摘要。
- 在目标所在文件系统构造候选文件，并用单次原子重命名替换目标。
- 写入失败时保持原文件不变，或使用备份进行原子恢复。
- 对临时文件进行精确清理，不使用通配符。
- 只输出脱敏元数据和布尔校验结果。
- 写入后只读确认九项键、目标权限、所有者、备份和容器未被本工具重启。

### 2.2 本次不包含

- 不修改本地或远端 Supabase，不创建或执行 migration。
- 不重启、重建或部署 `gooes-api-dev`。
- 不推送 Git 分支，不触发 GitHub Actions。
- 不保存授权事件 URL、消息事件 URL、Token 或 EncodingAESKey 到抖音控制台。
- 不接收 Ticket，不创建模板开发安装，不发短信，不上传模板。
- 不提交审核，不正式发布。
- 不读取或修改 `/Users/leefo/Public/work/orange`。

## 3. 已选方案

采用“Bash 交互入口 + TypeScript 校验核心 + Bash 远端原子应用器”。

选择理由：Bash 能可靠访问真实 TTY、SSH、SCP、OpenSSL 和远端 GNU 工具；TypeScript 能直接复用生产 API 的 Zod 配置契约，避免在 Shell 中维护第二套业务校验。二者职责分离后，交互、领域校验和远端文件事务都可以独立测试。

未选择的方案：

- 纯 Bash：会复制并弱化 API 的 Base64、AES Key、keyring 与长度校验，长期容易漂移。
- 纯 TypeScript CLI：TTY 与 SSH 文件事务可实现，但会增加进程与信号处理复杂度，且不比 Shell 入口更便于人工审计。
- 聊天或命令行参数传递：会让 AppSecret 进入聊天记录、Shell 历史或进程参数，不能接受。
- 再次尝试浏览器自动化：Chrome 支持范围内的恢复和重试已经耗尽，本动作不再尝试浏览器控制。

## 4. 文件边界

实施阶段只新增以下文件，不修改 API 配置契约，不引入依赖：

| 文件 | 职责 |
| --- | --- |
| `scripts/ops/configure-douyin-dev-env.sh` | 本机唯一人工入口；隐藏输入、生成密钥、调用校验、上传、触发远端应用、清理和脱敏汇总 |
| `scripts/ops/douyin-dev-env.ts` | 解析受保护 payload，验证键集合和 `.env` 安全边界，调用 `loadDouyinMiniappConfig`，返回不含值的元数据 |
| `scripts/ops/apply-douyin-dev-env-remote.sh` | 固定主机侧目标；加锁、备份、合并、原子替换、校验、恢复和清理 |
| `scripts/ops/douyin-dev-env.test.ts` | TypeScript 核心、入口契约和远端文件事务的 Bun 测试 |

用户最终只运行：

```bash
bash scripts/ops/configure-douyin-dev-env.sh
```

入口脚本从自身路径解析仓库根目录，不依赖用户当前目录。生产入口不接受主机、目标文件或九项值作为命令行参数。

## 5. 九项配置契约

| 变量 | 来源 | 生成或校验规则 |
| --- | --- | --- |
| `DOUYIN_COMPONENT_APP_ID` | 用户隐藏输入 | 原值必须等于首尾空白去除后的值且非空，最多 128 字符；只接受无需 `.env` 转义的保守 ASCII 字符集 |
| `DOUYIN_COMPONENT_APP_SECRET` | 用户隐藏输入两次 | 两次完全一致；原值必须等于首尾空白去除后的值且非空，最多 512 字符；字符集规则同 AppID |
| `DOUYIN_COMPONENT_MESSAGE_TOKEN` | 本机生成 | OpenSSL 生成 16 个随机字节并编码为 32 位小写十六进制 |
| `DOUYIN_COMPONENT_MESSAGE_AES_KEY` | 本机生成 | OpenSSL 生成 32 个随机字节，编码为标准 Base64 并去掉唯一末尾 `=`，结果必须是规范 43 字符且解码为 32 字节 |
| `DOUYIN_TEMPLATE_APP_ID` | 用户隐藏输入 | 规则同 Component AppID |
| `DOUYIN_TEMPLATE_APP_SECRET` | 用户隐藏输入两次 | 规则同 Component AppSecret |
| `DOUYIN_CREDENTIAL_KEYS_JSON` | 本机生成 | 只包含一个自有属性 `v1` 的 JSON object；属性值是 32 个随机字节的规范标准 Base64，保留末尾 `=` |
| `DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION` | 固定值 | `v1`，且必须是 keyring 自有属性 |
| `DOUYIN_SUBJECT_HASH_KEY` | 本机生成 | OpenSSL 生成 32 个随机字节并编码为 64 位小写十六进制 |

用户输入的保守 ASCII 字符集固定为 `[A-Za-z0-9._~+/=-]`；CR、LF、NUL、空白、引号、反斜杠、`#`、`$` 和反引号均拒绝。这样原值可以作为 Docker Compose `env_file` 的未加引号值保存，不发生 Shell 或 Compose 插值。若控制台实际值不满足该字符集，工具必须在生成远端临时文件前停止，不尝试转义或改写，也不得要求用户在聊天中提供该值。

抖音第三方小程序官方文档说明“消息验证 TOKEN”用于验签、“消息加密解密 KEY”用于解密，但公开页面没有给出第三方小程序 Token 的长度。32 位十六进制 Token 是本项目的保守工程选择：字符集无需 `.env` 转义、随机性充足，并满足当前 API 的 1–512 字符契约；不得把抖音小游戏文档中的字段限制表述为第三方小程序官方限制。后续 A04 保存控制台配置时仍须以届时控制台的实际字段校验为准；若控制台拒绝该格式，应停止 A04，并对新的 A01 变更另行取得授权。

TypeScript 核心把九项值组成隔离对象后调用 `apps/api/src/services/douyin-miniapp/config.ts` 导出的 `loadDouyinMiniappConfig`。它不得读取或合并调用进程的其他环境变量，也不得在成功输出或错误详情中返回任何配置值。

## 6. 本机交互与临时文件

1. 入口校验 Bash 3.2、Bun、OpenSSL、SSH、SCP 和固定脚本文件可用。
2. 入口将 `umask` 设为 `077`，使用 `mktemp -d` 创建唯一工作目录，并为所有退出路径安装 `EXIT`、`HUP`、`INT`、`TERM` 清理处理器。
3. 四项控制台值一律从 `/dev/tty` 隐藏读取，不从标准输入、环境变量、命令行参数或剪贴板读取。Component 与 Template AppSecret 均须重复输入且逐字节一致。
4. 空输入、两次 Secret 不一致、TTY 关闭、Ctrl-C 或生成命令失败都会在远端写入前退出。
5. 入口在工作目录内创建固定名称的 payload，创建后立即确认它是非符号链接的普通文件且权限为 `600`。
6. payload 使用固定顺序的九行 `KEY=value`。解析器按第一个 `=` 分割，只接受精确九项键、每项恰好一次、LF 行尾和非空值；拒绝未知键、重复键、注释伪装、CR、NUL 和缺失末尾换行。
7. TypeScript 核心完成结构校验和真实 API 契约校验后，只返回：九项键均有效、Component AppID 尾六位、Template AppID 尾六位、活动版本为 `v1`。AppID 不足七个字符时只返回 `short-id` 布尔状态，不返回其中任何字符；它不得返回完整 AppID 或任何其他值。
8. 写入前，终端显示固定环境、逻辑服务器、SSH 别名、目标路径、九个键名以及“不重启、不部署、不配置回调”。用户必须准确输入确认短语 `APPLY DOUYIN DEV ENV A01`，否则取消。
9. 本机 payload 只存在于该次运行的临时目录。无论成功或失败，都使用已记录的精确文件路径删除，再删除精确目录；禁止 `rm -rf`、通配符和宽目录清理。

脚本不打印隐藏输入，不启用 `set -x`，不把 payload 放入环境变量，不把值传给子进程参数，不把 payload 内容写入 Git、证据文件、日志或聊天。

## 7. 固定远端边界与预检

生产入口固定使用：

- 逻辑服务器：`gooes-dev-vm-0-11`
- SSH 别名：`gooes-dev`
- 远端系统主机名：`VM-0-11-ubuntu`
- 远端用户：`ubuntu`
- 目标目录：`/opt/gooes-dev/docker`
- 目标文件：`/opt/gooes-dev/docker/.env.dev.api`
- 期望权限与所有者：`600`、`ubuntu:ubuntu`

主机、用户和目标路径不可由生产命令行或普通环境变量覆盖。远端应用器只接受一个由入口创建的上传临时文件路径，并要求该路径位于固定目标目录、basename 符合固定随机前缀、是 `ubuntu:ubuntu` 所有的 `600` 普通文件且不是符号链接。

写入前必须在远端锁内再次验证：

- `/opt`、`/opt/gooes-dev`、`/opt/gooes-dev/docker` 都是目录且不是符号链接。
- 目标存在，是普通文件且不是符号链接，权限和所有者精确匹配。
- `bash`、`flock`、`mktemp`、`install`、`stat`、`awk`、`grep`、`mv`、`cp`、`rm`、`rmdir`、`sha256sum`、`cmp`、`date`、`od`、`tail`、`wc` 和只读 `docker inspect` 可用。
- 上传 payload 的九项键各出现一次，没有未知键、空值、CR、NUL 或多余内容。
- 现有目标内，每个目标键最多出现一次；任意目标键重复都视为现有文件状态异常，原文件保持不变。

远端脚本只解析文本，绝不 `source`、执行或 `eval` 目标文件和 payload。

## 8. 加锁、备份与原子替换

1. 远端脚本以固定目标目录打开文件描述符并在该描述符上取得独占 `flock`。不创建持久锁文件。
2. 加锁后重新执行路径、目标、权限、所有者、payload 和重复键检查，消除预检与写入之间的正常竞态。
3. 使用 `YYYYMMDDHHMMSS` 生成固定格式备份名 `.env.dev.api.backup-<timestamp>`；若同名文件已存在则失败，不覆盖旧备份。
4. 用保留元数据的复制方式创建备份，确认备份是 `600`、`ubuntu:ubuntu` 普通文件，并确认备份 SHA-256 与替换前目标 SHA-256 一致。
5. 以备份而不是持续变化的目标为源，在同一目录使用 `mktemp` 创建候选文件。合并器只移除旧目标记录占用的完整字节区间，在原顺序中逐字节复制所有其他区间；如追加边界缺少 LF，只插入分隔新 block 所必需的一个 LF。随后在文件尾写入固定顺序的新九项。除移除旧目标记录、必要的单个分隔 LF 和加入新九项外，不改写其他配置字节。
6. 候选文件必须是 `600`、`ubuntu:ubuntu` 普通文件。再次校验九项键恰好一次、值非空、无 CR/NUL、非目标内容与替换前一致，并用本机已通过真实 API 校验的 payload 摘要确认候选中九项值与上传内容一致。
7. 候选和目标位于同一文件系统。替换前再次确认当前目标 SHA-256 仍等于加锁后记录的替换前摘要；如不同，按并发修改失败处理，不覆盖目标。确认一致后使用单次 `mv` 原子替换目标，不使用就地编辑。
8. 替换后再次验证目标类型、权限、所有者、候选摘要、九项键、payload 摘要和非目标内容。
9. 替换前的任一失败都删除精确候选与上传临时文件并退出，目标保持不变，已成功创建的备份保留。
10. 替换后的文件校验失败时，只有当前目标摘要仍等于刚移动候选的已知摘要，才能从备份创建同目录 `600` 恢复候选，验证其 SHA-256 等于替换前摘要，再以单次 `mv` 原子恢复目标。若当前目标已被外部改动，则返回 `REMOTE_CONCURRENT_CHANGE`，不得覆盖未知新状态；恢复本身失败则返回高优先级 `REMOTE_ROLLBACK_FAILED`，不得声称 A01 已回滚。
11. 成功后保留时间戳备份用于人工恢复，删除上传和候选临时文件，释放锁。

不使用 `sed -i`、直接追加、非原子覆盖或未解析的 `sudoedit`。脚本不需要提权；远端身份和文件所有权不符合预期时直接停止。

## 9. 错误、清理与日志脱敏

所有错误使用稳定阶段码，例如 `LOCAL_INPUT_INVALID`、`LOCAL_CONFIG_INVALID`、`REMOTE_PREFLIGHT_FAILED`、`REMOTE_TARGET_STATE_INVALID`、`REMOTE_APPLY_FAILED`、`REMOTE_ROLLBACK_FAILED`、`CLEANUP_FAILED`。错误正文只能包含阶段、固定主机/路径、键名或布尔结果，不包含值、payload 行、Secret 长度、完整 AppID 或远端环境文件内容。

允许输出的成功元数据只有：

- environment=`development`
- logical_server=`gooes-dev-vm-0-11`
- target=`/opt/gooes-dev/docker/.env.dev.api`
- Component / Template AppID 尾六位
- backup 的固定路径和替换前 SHA-256
- `nine_keys_valid=true`
- `target_mode_600=true`
- `target_owner_ubuntu=true`
- `container_identity_unchanged=true`
- `local_cleanup=true`、`remote_cleanup=true`

清理失败使 A01 整体返回非零，即使远端替换已经成功。此时输出必须明确“目标可能已更新，先只读核对，禁止盲目重跑”，避免第二次运行掩盖现场。备份不属于临时文件，不在成功清理中删除。

## 10. 容器不变性与写后只读核验

入口在写入前后分别只读获取 `gooes-api-dev` 的容器 ID、启动时间、配置镜像引用和健康状态，并比较不透明摘要。入口和远端脚本中不得出现 Docker 重启、Compose `up`、部署或信号发送命令。

写后只读核验要求：

- 目标仍为 `600`、`ubuntu:ubuntu` 的非符号链接普通文件。
- 九项目标键各出现一次，没有未知的第十项 `DOUYIN_*` 配置被本工具加入。
- 目标内九项值的摘要与本机已校验 payload 一致，但不输出摘要对应的值。
- 备份存在，其摘要等于写入前目标摘要。
- 容器 ID、启动时间和镜像引用与写入前一致，健康状态仍为 `healthy`。

若文件核验在远端原子应用器内失败，执行第 8 节的原子恢复。若文件已验证成功、但后续容器不变性比较发现外部并发变化，工具只报告 A01 验收失败并停止，不擅自操作容器或再次改写环境文件；后续先进行只读归因。

## 11. 测试驱动实施

实施严格按失败测试先行，不新增依赖。最低测试矩阵如下。

### 11.1 TypeScript 核心

- 接受固定顺序、精确九项且满足真实 API 契约的 payload。
- 拒绝缺失、重复、未知、空值、错序、CR、NUL、无末尾 LF 和多余行。
- 拒绝非规范 43 位 AES Key、非 32 字节规范 Base64 keyring、缺失活动版本和过短主体哈希密钥。
- 拒绝超长 ID / Secret 和带首尾空白的输入，避免 API 运行时静默 trim 后与控制台值不一致。
- 失败对象、stdout 和 stderr 不包含测试 Secret、Token、AES Key、keyring、subject key 或完整 AppID。
- 成功只返回固定键集合、尾六位和布尔值。

### 11.2 远端应用器

使用真实临时目录和文件验证：

- 首次添加九项时保留非目标内容。
- 重跑时替换单份旧九项，不累积重复键。
- 备份内容、摘要、模式和所有者检查正确。
- 目标、父目录或上传文件为符号链接时拒绝。
- 目标已有重复键、上传键缺失/重复/未知或权限错误时，目标字节不变。
- 候选验证失败发生在 `mv` 前，目标不变。
- 注入写后验证失败时，目标原子恢复为替换前内容。
- 注入恢复失败时返回 `REMOTE_ROLLBACK_FAILED`，不输出内容。
- 临时文件只按精确路径删除；模拟清理失败时整体失败并提示先核对状态。
- 备份始终保留且不会被通配符清理。

Shell 文件把纯函数与文件事务函数放在 `main` 之前；Bun 测试以 source-only 模式调用内部函数，并传入临时根目录和命令适配器。直接执行脚本始终进入 `main`，`main` 内硬编码本设计固定的主机、用户和路径，不读取测试根目录变量。生产入口通过契约测试保证只会直接执行远端 `main`，不会 source 远端脚本或暴露覆盖参数。

### 11.3 本机入口

通过临时 `PATH` 中的 SSH、SCP、OpenSSL、Bun 命令替身和测试输入适配器验证：

- 生产契约固定 `gooes-dev` 与目标路径，拒绝位置参数。
- 直接执行时必须从真实 TTY 隐藏读取；Bun 测试只 source 内部编排函数并显式传入输入适配器，生产 `main` 不读取该适配器或测试输入环境变量。
- 两次 AppSecret 不一致、用户取消、错误确认短语和任一子命令失败时不调用远端应用。
- 信号、上传失败、远端失败和成功路径都执行精确本地/远端清理。
- stdout、stderr 和构造的失败消息均不包含任何哨兵 Secret。
- 不存在 `set -x`、宽删除、Docker 变更命令、部署命令或回调配置命令。

### 11.4 最小验证命令

实施计划将固定实际命令；至少包括：

```bash
bash -n scripts/ops/configure-douyin-dev-env.sh
bash -n scripts/ops/apply-douyin-dev-env-remote.sh
bun test scripts/ops/douyin-dev-env.test.ts
bun run api:typecheck
bun run api:build
git diff --check
```

还需运行现有抖音小程序/API 聚焦测试、稳定根测试和凭证扫描。任何新提交都会改变待部署 SHA，因此脚本实施提交后必须重新执行 Task 5 门禁，并在证据文件中记录新的完整 SHA 与非敏感结果。

## 12. 执行、验收与证据

设计和实施提交不得包含当前未提交的 `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`；该文件只在真实 A01 完成后单独记录非敏感证据。

真实执行前再次确认仓库脚本 SHA、A01 授权范围和服务器只读基线。用户在自己的 Terminal 中运行单一命令并完成隐藏输入；九项值不经过聊天。

A01 通过必须同时满足：

- 入口退出码为 0。
- 远端目标原子更新并通过九项真实契约与结构核验。
- 时间戳备份存在且可由摘要证明等于更新前目标。
- 本地与远端临时文件均已精确清理。
- `gooes-api-dev` 未被本工具重启、重建或部署且仍健康。
- 未配置任何回调，未产生其他外部写操作。

证据文件只记录执行北京时间、脚本 Git SHA、固定环境/主机/目标、两项 AppID 尾六位、备份路径、非敏感摘要、权限/所有者布尔值、九项键布尔值、容器不变性布尔值、清理布尔值和 A01 授权原文引用。不得记录任何完整配置值。

本地 payload 清理后，生成的 Token 与 EncodingAESKey 只保存在受控服务器目标及其备份中。后续 A04 如需人工填入抖音控制台，必须采用新的动作时授权和不经聊天的受控读取/粘贴流程；A01 授权不能自动扩展到 A04。

## 13. 恢复策略

- 原子替换前失败：目标不变；保留已成功生成的备份，清理临时文件。
- 原子替换后文件核验失败：用备份候选原子恢复，并验证恢复后摘要。
- A01 成功后需要人工恢复：先取得新的具体授权，在无并发部署窗口内从证据记录的备份创建同目录恢复候选，验证摘要/模式/所有者后原子替换；不直接覆盖，不删除新文件。
- 环境文件恢复后仍不会自动影响正在运行的容器；是否重新部署或重启属于独立外部动作，必须另行授权。
- `REMOTE_ROLLBACK_FAILED` 或清理失败：停止后续 A02–A15，先只读确定目标、备份、临时文件和容器的真实状态。

## 14. 官方依据

- 抖音开放平台《第二步：授权测试/添加模板小程序》说明授权事件 URL、消息验证 Token、消息加密解密 Key 和消息事件 URL 的配置职责：<https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/guide/customization/establish>
- 抖音开放平台《消息推送及加解密说明》说明 Token 用于签名验证、Key 用于解密、配置位置以及成功响应必须是纯文本 `success`：<https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/encryption>
- 抖音开放平台《授权环节说明》说明 `component_ticket`、`component_appid` 和 `component_appsecret` 在第三方小程序授权链路中的作用：<https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/authorization>
- 抖音开放平台《获取第三方小程序接口调用凭据 V2》给出 Component AppID / AppSecret 的控制台获取路径和 Ticket 换取凭据的接口要求：<https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/component-access-token-v2>
