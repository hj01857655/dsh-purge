---
name: screenshot-evidence
description: 证据截图登记：把现场截图关联到得分点/命中（面板可看图、报告会嵌入）。批量得分点每个最多展示 3 张代表图，不必逐台截图
whenToUse: 拿到可视化成果需要留证时（回显、登录成功页面、文件列表、system 权限等）；记分（redteam_score_hit）后补图时
role: coordinator
enabled: true
---

# 证据截图（Shot Evidence）

截图是给面板和报告看的**可视化证据**。时机：记分（redteam_score_hit）之后、或拿到值得展示的回显/页面时。

## 工具

### redteam_shot_add —— 登记一张

参数：
- `path`（图片本机路径，相对靶标目录或绝对）**或** `data_base64`（base64，可带 data: 前缀；截图工具没落盘时用）——二选一
- `label`：图片说明，例如「域控 WEB-SHDC1 atexec 回显 nt authority\system」
- `kind`：`screenshot`（现场截图，默认）| `card`（由记录生成的证据摘录卡，报告里会标注）
- `point_code`：关联得分点 code（如 terminal-access / central-system）
- `hit_id`：关联到具体某条得分命中（score_hit id）；给了它这张图就只挂在那一条上
- `asset_id` / `target`：对应资产或目标（IP / URL）
- `note`：这张图证明了什么
- `source_ref`：原始来源（截图落盘路径或 runs/ 下的证据文件）
- `captured_at`：截图时间（ISO），缺省用当前时间

图片会被拷进靶标目录；面板展开得分点即可看图，报告里也会嵌入。

**批量得分点**（如终端权限）每个得分点最多展示 3 张代表图——不必逐台截图，挑代表性的。

### redteam_shot_list —— 列出

参数：`point_code`、`hit_id`、`asset_id`。返回所属得分点、目标、类型、落盘文件。

### redteam_shot_delete —— 删除

参数：`id`（shot_list 里返回的 id）。连同磁盘文件一起删。
