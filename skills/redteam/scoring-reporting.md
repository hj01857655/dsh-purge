---
name: scoring-reporting
description: 得分与汇报：25 项得分规则（8 类 + G1–G8 通用规则）的记分纪律（三条红线）、五阶段攻击链、收尾出报告。规划前先看 score_list，汇报用 score_report
whenToUse: 每次规划下一步行动之前（看分值决定先打什么）；拿到权限/账号/数据后记分时；阶段收口或需要交付报告时
role: coordinator
enabled: true
---

# 得分与汇报（Score & Report）

得分规则按《突破入侵类得分规则（合并版）》重构为 **25 项**（获取权限 21 项 + 突破网络边界 4 项，共 8 个类别），另有 **8 条通用规则 G1–G8** 横切全部条目。

## 工作流

```
规划前   → redteam_score_list（按分值高低决定先打什么；看 capped 当停止信号）
记分时   → redteam_score_hit（先用 score_list 核对实际 code，不要凭记忆写）
阶段判断 → redteam_attack_chain（五阶段：现在在第几阶段、下一步打哪）
交报告   → redteam_score_report（只收录"拿到了分"的成果，附可复现原始请求）
```

## redteam_score_list —— 得分目标面板

每次规划下一步之前先看这里。返回按 8 个类别分组的全部得分点：code、分值、上限（cap）、已用（cap_used）、是否已拿下（achieved）、命中证据。

**`capped` 是停止信号**：该条已达上限或已被顶掉，换别的条目推进，不要在同一条上刷。

## redteam_score_hit —— 记分

必填：`evidence`（**只写结果**：目标资产 + 拿到了什么，如「后台管理员 tomcat/Tomcat@2024（已实测浏览器可登录）」「导出 132 万条用户数据」。不要写取得过程——过程由攻击链步骤负责）。

其余参数：`engagement`、`code`（或 point_id / point_name，**先用 score_list 核对**）、`points`、`target`（带上端口，口径按「资产+端口」判定）、`asset_id`、`port`、`vuln_id`（能指向用哪个漏洞拿到的就带，报告自动附原始请求）、`step_id`、`self_created`、`note`、`recorded_by`。

**多档条目用 `points` 指定本档分值**（如服务器主机权限普通 10 / 管理员 50；域名控制一级 50 / 二级 20）。同一系统只按最高权限计一次（G1）——先记普通档、后提权到管理员档，再记一条高档的，系统自动顶掉普通档那条。

### 三条红线

1. **账号类得分必须先实测能登录。** 拿到凭据后用浏览器（browser-automation / kimi-webbridge）或等价会话实测登录成功才记分——**只有凭据不算拿到账号**；登不进去的写进 redteam_asset_test 的 test 参数。
2. **自己注册的账号不算得分权限。** 自助注册、自建账号/权限都不算——演练得分针对**拿到别人已有的**。这类用 `self_created=true` 记录（留过程），不计分、不计数、不进报告。
3. **注意该条的计分口径（G1/G3）。** 每条自带口径（同一系统只算最高一次 / 同一服务只算最高一条 / 整个目标只算一次 / 按台·卡·个累加）与上限（服务器主机 600、Web 应用 2000、集权系统 4000）。返回 warning = 停止信号。

**数据成果单独计分（G2）**：邮件/业务/数据资产按重要程度另行记录，不与权限分混算；evidence 必须写出实际数据量。

## redteam_attack_chain —— 五阶段攻击链

① 信息收集（互联网侧）→ ② 互联网资产权限 → ③ 边界突破（搭隧道）→ ④ 内网资产权限 → ⑤ 靶标权限。

返回每阶段的阶段目标、实际得分与累计分、涉及资产、边界突破阶段的真实隧道。

**写攻击链步骤（redteam_chain_add）必须带 `stage_code`**（只接受 `recon/internet/boundary/internal/target`），写别的值步骤不落任何阶段。账号权限与数据库权限按「同资产同端口」封顶。

## redteam_score_report —— 交付报告

只收录**拿到了分**的成果（没得分的漏洞不进报告），每一项尽量附可直接粘贴进 Yakit Repeater 复现的原始请求。需要交付报告时用这个。

参数：`limit`（默认 500）、`markdown`（true 返回 markdown 全文；false 只返回条目摘要）。

**`redteam_report` 与 `redteam_report_targets` 已弃用**，都改用 `redteam_score_report`。

## redteam_score_point_save —— 新增/修改得分点

带 `id` 为修改，不带为新增。参数：`name`（必填）、`code`（建议给）、`category`、`points`、`description`、`enabled`。智能体只在必要时用（如发现规则里还有未被记录的得分项）；用户也会在界面上编辑。
