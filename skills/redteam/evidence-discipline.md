---
name: evidence-discipline
description: 红队证据纪律：四档置信度（claimed/observed/derived/inferred）+ ev_id 语义哈希防篡改 + 未解决问题登记与闭环。子智能体口头报告不得直接采信，必须由指挥中心核实后再升级
whenToUse: 每次产出或上报红队结论、汇报成果、收尾出报告前；收到子智能体"我拿到了 X"这类口头报告时；确认还有未核实 claimed 或未解决的作战问题时要先登记再行动
role: coordinator
enabled: true
---

# 证据纪律（Evidence Ledger）

红队作战必须建立**证据账本**：每条结论带可信度标记、防篡改哈希、可回查的来源，未解决的问题单独登记，避免"假装打完了"。

## 核心纪律：四档置信度

```
claimed      = 子智能体口头报告（如"我已在 10.0.0.5 上拿到 shell"）
              → 红色词，**禁止直接采信**，必须由指挥中心核实
observed    = 实际工具回显 / 数据库记录证实
              → 指挥中心核对后采信
derived     = 从 observed 证据推理出来的
              → 必须标注推导来源，不得当作已实测
inferred    = 子智能体或指挥智能体的推测
              → 必须标注"推测"，不得当作已达成
```

- 只有 `observed` 可以直接作为已达成结论写进报告。
- `claimed` 和 `inferred` **一律需要核实**才能升级（工具提供 `redteam_evidence_upgrade`）。
- 子智能体回报必须用 `authority: subagent-report` 记录，对应 `claimed`。

## 防篡改：ev_id 语义哈希

每条证据的 ID 由内容哈希生成：

```
ev_id = "ev_" + sha256(规范化语义)
```

- 语义 = `{ operation, parameters(规范化), result(规范化), confidence, authority, limitations, supporting_ev_ids }`
- 规范化时 JSON 键按码点排序，保证**语义相同则哈希相同**；内容改一字哈希即变。
- 落库后可用 `redteam_evidence_verify` 核对：指挥智能体按子智能体报告的内容用同样参数调用 verify，`matched=true` 说明库里有同一条；`matched=false` 说明子智能体**改口、夸大或库里没有**。

## 工具清单（7 个，均挂到当前靶标 SQLite 账本）

账本挂在靶标数据库句柄上：`new EvidenceLedger(store.db(engagementId))`，表结构由 `EVIDENCE_LEDGER_DDL` 自动建（`evidence` + `residual_unknown`，不动现有 schema）。

### 证据记录

- `redteam_evidence_record`
  记录一条作战证据。
  - 必填：`operation`（操作名，如 `nmap_scan`、`webshell_established`、`sql_injection_confirmed`）、`result`（规范化结果，JSON 对象）
  - 可选：`engagement`、`parameters`（JSON 对象，参与哈希）、`confidence`（默认 observed）、`authority`（默认 tool-output）、`limitations`（字符串数组，写局限性）、`supporting_ev_ids`（支撑此条的 ev_id）、`source_agent`（哪个子智能体产出，`claimed` 时必填）、`raw_ref`
  - 返回 `{ ok, ev_id, duplicate }`；`duplicate=true` 说明内容已存在（幂等）
  - 纪律：`confidence` 必须如实填写，禁止把口头报告填成 observed

- `redteam_evidence_verify`
  核对子智能体回报与账本是否一致（哈希级核对）。
  - 参数：`operation`、`parameters`、`result`、可选 `confidence`/`authority`/`limitations`/`supporting_ev_ids`
  - 返回 `{ matched, ev_id }` 或 `{ matched: false, expected_ev_id, actual_ev_id }`
  - 用法：子智能体汇报"已做 X 得到 Y"时，用同样参数调 verify；`matched=false` 要当成**未证实**处理，不得写进报告

- `redteam_evidence_upgrade`
  把 `claimed` / `inferred` 升级为 `observed`。
  - 必填：`claimed_ev_id`、`verified_result`（亲自验证的实际结果）
  - 可选：`verified_by`（默认 coordinator）
  - 纪律：**必须先 verify 确认，再升级**；`verified_result` 必须是亲自实测的回显/数据

- `redteam_evidence_list`
  列出证据，按 `operation` / `confidence` 过滤，支持 `limit` / `offset`。
  - 汇报前先调用确认没有未升级的 `claimed`

### 未解决问题登记

- `redteam_unknown_record`
  记录一个还没解决的作战问题。`question` 与 `domain` 相同会去重。
  - 参数：`question`（必填）、`severity`（low|medium|high|critical，默认 medium）、`domain`（如 `internal-recon` / `boundary-break` / `lateral-movement`）、`recommended_probe`（建议验证手段）、`supporting_ev_ids`
  - 返回 `{ ok, unk_id, duplicate }`

- `redteam_unknown_list`
  列出未解决问题，派活前先看 `open` 项。参数：`status`（默认 open）、`severity`、`limit`。

- `redteam_unknown_resolve`
  把未解决问题标为 `resolved` / `contradicted` / `withdrawn`。
  - 参数：`unk_id`（必填）、`disposition`（`resolved` | `contradicted` | `withdrawn`，必填）、`resolution`（解决说明）
  - `contradicted` 表示发现是错的；`withdrawn` 表示撤销；只有 `resolved` 才算完成

## 执行纪律

1. **记录先于行动**：每次产生实际攻击/探测动作前，先把结果用 `redteam_evidence_record` 落账，并如实填 `confidence`。
2. **口头报告不得直接采信**：子智能体说"拿到了"就记 `confidence=claimed`，禁止填 `observed`。
3. **汇报前先清未升级 claimed**：用 `redteam_evidence_list` + `redteam_evidence_upgrade` 把未核实的 claimed 全部核实升级，`claimed` 未清零的汇报要明确提示未核实条数。
4. **未解决的问题要登记**：没打完、证据不足的作战问题（如"22 端口可能是 SSH 但还没试出凭据"）必须用 `redteam_unknown_record` 登记，不能假装已解决。
5. **收尾时清 unknown**：完成某项工作后，有结论的标 `resolved`，有反证的标 `contradicted`，有撤销的标 `withdrawn`。
6. **证据要能回查**：报告里涉及结论的，给出对应的 `ev_id`，指挥智能体可用 verify 回查是否一致。

## 审计数字

- `redteam_unverified_count（返回口径：countUnresolvedClaims）`：`countUnverified` —— claimed/inferred 总条数
- `redteam_unverified_count`：`countUnresolvedClaims` —— 还有多少 claimed/inferred **没有任何 observed 支撑**（0 = 所有子智能体报告都亲自核实过）

返回 >0 时，汇报必须提醒未核实条数。
