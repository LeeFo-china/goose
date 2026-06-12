---
target: 工地监控页
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-06-12T05-26-46Z
slug: apps-admin-app-console-cameras-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---:|---:|---|
| 1 | Visibility of System Status | 2/4 | 有在线、隐藏、设备数，但缺少同步时间、接入可信度、最近异常和处理优先级。 |
| 2 | Match System / Real World | 3/4 | “项目摄像头 / 设备接入”贴近业务，但设备资产、通道、绑定关系仍偏系统概念。 |
| 3 | User Control and Freedom | 3/4 | Tab、搜索、清除、分页明确；绑定、新增、同步后的恢复路径和下一步不够明显。 |
| 4 | Consistency and Standards | 3/4 | shadcn/Radix 语汇统一；部分 Badge 语义存在混用风险。 |
| 5 | Error Prevention | 2/4 | 无设备或空态时仍突出“绑定摄像头”，前置条件没有被界面约束出来。 |
| 6 | Recognition Rather Than Recall | 2/4 | 用户需要自己推断“新增设备 → 同步通道 → 绑定到项目”的顺序。 |
| 7 | Flexibility and Efficiency | 2/4 | 有搜索，但缺少离线、未绑定、客户不可见、不可播放等异常优先入口。 |
| 8 | Aesthetic and Minimalist Design | 3/4 | 视觉克制可信，但摘要重复，空态下操作和分页仍显得机械。 |
| 9 | Error Recovery | 2/4 | 有 StatusAlert，但页面层没有重试、重新同步、排查指引等恢复动作。 |
| 10 | Help and Documentation | 2/4 | 简短说明不足以指导首次接入和异常处理。 |
| **Total** | | **26/40** | **中等，可用但工作流表达不足** |

## Anti-Patterns Verdict

LLM assessment: 页面不像明显 AI 生成。它保留了 Gooes Admin 应有的浅色工作台、克制黄黑、标准 tabs/table/badge 语汇，没有深色监控大屏、玻璃、紫色渐变或营销页构图。真正的问题不是视觉花哨，而是“产品空态模板化”：空数据时仍保留搜索、清除、分页、多个 0 值摘要和并列 CTA，像标准列表页，而不是一个设备接入工作流。

Deterministic scan: CLI detector 对目标源码返回空数组，exit code 0，源码层没有命中规则。

Browser overlay: 可变注入成功，detect.js 注入成功，console 捕获到 13 条 anti-pattern 信号。可信信号包括 text-overflow、tiny-text、layout-transition、nested-cards、thin-border-wide-shadow。需要谨慎处理的信号包括 single-font 和 cream-palette，因为产品 register 和 DESIGN.md 明确允许单一 sans 字体和 Gooes cream 背景；low-contrast 里出现 #141414 on #000000，可能来自 overlay/runtime 对不可见或特殊背景的采样，需要复核后再定性。

Visual overlay note: overlay 注入成功，但没有收到结构化 impeccable-results postMessage，最终 fallback 使用 console 日志。live-server 已清理。

## Overall Impression

这版已经从重卡片页面收敛成了轻量工作台，方向对。最大机会是把“工地监控”从 CRUD 列表推进到接入和异常处理流程：空态告诉用户下一步，非空态优先暴露离线、未绑定、客户不可见这些风险。

## What's Working

1. 视觉方向正确：没有把监控做成暗色大屏，仍然是租户后台的运营工具，符合 Gooes Admin 的产品定位。
2. 基础结构稳定：页头、tabs、搜索、列表、设备资产池都有明确位置，用户不会迷路。
3. 响应式基础过关：desktop 1280x900 和 mobile 390x844 均无页面级横向溢出，heading 和 tabs 可见，没有明显重叠。

## Priority Issues

**[P1] 设备接入与绑定摄像头的链路不清**
Why it matters: 首次接入时，用户不知道先新增设备、同步通道，还是绑定摄像头。空态下同时出现“绑定摄像头”“设备接入”“新增设备”“同步资产”，会让非技术角色犹豫。
Fix: 把空态改成状态驱动的 3 步任务：新增设备 → 同步通道 → 绑定到项目。根据当前数据高亮唯一下一步，例如无设备时主 CTA 是“新增设备”，有未绑定设备时主 CTA 才是“绑定摄像头”。
Suggested command: $impeccable onboard

**[P1] 摘要信息重复，空态噪音偏高**
Why it matters: 顶部 badge、tab 右侧 summary、列表标题都在重复摄像头/设备/隐藏数量。空数据时，多个 0 值让页面显得机械，削弱关键行动。
Fix: 顶部保留跨页面总览；tab 内容区只保留当前 tab 相关状态。空态时隐藏低价值 0 值和分页句，改成一句明确状态加一个下一步动作。
Suggested command: $impeccable distill

**[P2] 缺少异常优先的运营视角**
Why it matters: 工地监控页的价值不只是管理资料，而是尽快发现影响客户查看工地的问题。现在搜索只能找项目/客户，不能快速处理离线、未绑定、客户不可见、不可播放。
Fix: 增加轻量状态筛选或快捷入口：离线、未绑定设备、客户不可见、不可播放/加密。非空态列表优先显示风险项目或给风险 badge 更清晰的语义。
Suggested command: $impeccable shape

**[P2] 移动端空态操作密度不合理**
Why it matters: mobile 空态里搜索框、搜索按钮、清除按钮、分页按钮占据大量空间，真正下一步“接入/绑定”被稀释。
Fix: 无关键字时隐藏“清除”；空态时弱化搜索和分页，优先展示接入流程 CTA。分页在 total=0 时可隐藏或替换成简短状态。
Suggested command: $impeccable adapt

**[P3] 状态 Badge 语义需要重整**
Why it matters: 能力类、风险类、权限类状态混在 success/secondary/warning 里，用户可能把“可控制”误读成风险，或把“隐藏”误读成低优先级。
Fix: 能力类用 neutral/outline，风险类才用 warning/danger，权限类明确写“客户可见 / 客户隐藏”。避免只靠颜色表达状态。
Suggested command: $impeccable clarify

## Persona Red Flags

**Alex, Power User**: 需要快速处理所有离线、未绑定、客户不可见摄像头，但当前只有关键词搜索和分页。高频运营会被迫逐项目扫描。

**Jordan, First-Timer**: 会卡在空态。页面同时出现绑定、设备接入、新增设备、同步资产，但没有解释设备资产和项目摄像头的关系，也没有明确第一步。

**Operations Supervisor**: 进来能看到数量，但看不到风险级别和处理进度。主管需要 5 秒内知道“今天有没有影响客户查看的问题”，当前页面还需要进入列表后逐项判断。

## Minor Observations

- 无关键词时“清除”按钮仍占位，移动端浪费空间。
- 空态文案“点击右上角”在移动端不完全成立，按钮已经进入内容流。
- “每页 5 个项目，共 0 个”在空态下价值低。
- Browser overlay 报出一个 text-overflow selector，需要后续用真实数据复核，尤其是侧栏或租户信息长文本。
- Browser overlay 报 nested-cards，但当前 cameras 页面主内容已基本去掉内嵌卡，可能有部分来自 app shell 或其它已存在组件，需要 scoped 复核。

## Questions to Consider

1. 这个页面的第一使命是“管理摄像头资料”，还是“发现影响客户看工地的问题”？
2. 首次接入腾讯云设备时，用户能否只看到一个明确下一步？
3. “隐藏”是正常隐私设置，还是需要运营关注的风险？当前语义需要业务先定清楚。
4. 空态是否应该保留完整列表工具栏，还是先展示接入流程？
