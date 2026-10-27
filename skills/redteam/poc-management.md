---
name: poc-management
description: POC/EXP 知识库管理：打 Nday/1day 前先查两层（知识库 + 本机 nuclei 模板库），命中直接复用；验证有效的通用 POC 必须回填知识库（跨靶标共享）
whenToUse: 准备打已知漏洞（Nday/1day/CVE）之前；从互联网拿到或自己手搓了可复用的 POC/EXP 之后；盘点手头已有武器时
role: exploit
enabled: true
---

# POC/EXP 知识库（跨靶标复用）

通用 POC/EXP 是**一次性投入、长期复用的资产**。打 Nday/1day 的固定顺序：

```
① redteam_poc_search 查知识库 + 本机 nuclei 模板库
② 命中 → 取用（知识库 redteam_poc_get 拿全文；模板直接 nuclei -t <相对路径>）
③ 都没有 → 互联网搜索（web_search / GitHub / ExploitDB / 厂商公告）或自己手搓
④ 验证有效 → redteam_poc_add 回填知识库（带 category + engagement + asset_target + verified_note）
```

**不要跳过 ① 直接去找或手搓**——重复劳动是知识库最大的浪费。

## 工具

### redteam_poc_search —— 检索（打点前第一步）

参数：`q`（关键字）、`cve`、`component`、`kind`（poc|exp|script|template|payload）、`category`（可多值逗号分隔）、`engagement`（按来源靶标筛）、`asset_target`、`language`、`source`（web|self|manual|nuclei-template）、`verified`（true 只看实测验证过的）、`templateLimit`、`limit`

返回两层结果：`knowledge_base`（沉淀的条目）+ `local_templates`（本机 nuclei 模板命中）。排序按"已验证 → 复用次数"。

- category 归类：`rce | deserialization | file-upload | sqli | unauthorized | auth-bypass | weak-password | ssrf | xxe | path-traversal | info-leak | privesc | tunnel | other`

### redteam_poc_get —— 取全文

参数：`id` 或 `code`（search 返回里的 code 字段）。返回正文 + 用法 + 验证记录 + 落盘路径，可直接照用或改造成目标专用脚本。

### redteam_poc_add —— 回填知识库

必填：`title`（组件 + 漏洞名/编号，如「Weblogic T3 反序列化 CVE-2023-21839」）

**回填三件套（缺了面板就没有归类、追溯不到来源）**：
1. `category` 归类
2. `engagement` + `asset_target` —— 在哪个靶标、哪台资产上验证的
3. `verified` + `verified_note` —— 验证证据（在哪台目标、什么回显/结果）

其余：`kind`、`cve`、`component`、`versions`、`severity`、`language`、`source`、`source_url`（互联网来源必填）、`description`、`usage`（完整命令行示例）、`content`（正文）或 `path`（本机文件路径）、`filename`、`found_by_agent`、`tags`、`created_by`

**收录判断标准**：换个目标还能用 → 进知识库；只对本次靶标有效的脚本 → 走 `redteam_attack_file_add`（攻击文件页）。同名（同一 code）会合并刷新，可用于更新版本。

**纪律**：`verified=true` 只能在真实目标上验证过才填。

### redteam_poc_list —— 盘点

参数：`kind`、`source`、`component`、`verified`、`limit`（不带条件就是全部）。用于盘点"手上已有哪些武器"，避免重复搜集。

### redteam_poc_update —— 补验证结论

参数：`id` 或 `code` + `patch`（对象：verified / verified_note / versions / usage / description / content / tags / severity / component / cve / source / source_url / language），也可直接传 `verified` / `verified_note`。

**在真实目标上验证通过后，一定要回来把 verified 置 true 并写清证据**——后续智能体会优先用已验证的。

### redteam_poc_use —— 记复用

参数：`id` 或 `code` + `used_on`（用在哪：靶标名/目标 IP/URL）。复用次数高的条目排前面，后来者优先选经过实战的武器。
