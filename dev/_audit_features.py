# -*- coding: utf-8 -*-
"""Audit overview table vs code modules; emit FEATURE_INTEGRATION_TRACKER.md"""
import re
from pathlib import Path
from collections import Counter, defaultdict
from datetime import date

OVERVIEW = Path(r"F:\docs\projects\doubao-web-toolkit\豆包插件功能总览_2026-10-15.md")
OUT = Path(r"F:\docs\projects\doubao-web-toolkit\FEATURE_INTEGRATION_TRACKER.md")
STATUS = Path(r"F:\docs\projects\doubao-web-toolkit\PROJECT_STATUS.md")

# Code module → covered overview row IDs (from PROJECT_STATUS + overview notes)
MODULE_COVERS = {
    "export": list(range(26, 38)) + [13],  # #26-37 + #13 AIExporter (same capability)
    "navigator": list(range(38, 51)),  # #38-50 nav/TOC
    "conversation-manager": [52, 53, 54, 55],  # partial on 53/54 folders
    "theme": [57, 61, 62],
    "input-enhance": [67, 69, 70],
    "prompt-bar": list(range(71, 78)),  # #71-77 prompt family
    "source-inspector": list(range(78, 83)),  # #78-82
    "reading-mark": [108],
    "chat-digest": [30, 109],  # also overlaps digest aspect of #30
    "enhance": [],  # auto-scroll 自研；#84 Better_Doubao 仍待拆解
    "batch-input": [],  # custom, not in 225
    "debug-panel": [],  # custom
}

# Rows that should be [x] because dwt already covers the capability (sync overview)
FORCE_IMPL = {
    13: ("export", "能力已被 export 覆盖（MD/JSON 导出）"),
}

# Doubao built-in capabilities (web product already ships) — skip integration
# Reason strings used when compliant item is abandoned because Doubao has it.
DOUBAO_BUILTIN = {
    # Theme: Doubao web has light/dark / system theme in settings (2024+)
    # Keep #57/#61/#62 as [x] already implemented in dwt — don't reclassify as builtin abandon
    # Voice/TTS: Doubao has built-in voice read-aloud for replies
    65: "豆包网页版自带回复朗读/TTS，外挂下载收益低",
    66: "豆包网页版自带语音朗读，系统 TTS 可替代",
    # Expert mode / model switch: Doubao UI already has model & mode pickers
    68: "豆包输入区已有专家模式/模型切换入口，自动切换脚本边际收益低",
    # Recommendation blocker: Doubao settings may hide feed; still useful as CSS hide — keep as todo unless clear
    # Digital avatar dashboard — not builtin
}

# Items marked [x] in overview — trust table unless we find contradiction
# Partial implementations noted in overview remarks
PARTIAL = {
    53: "部分：批量选择删除已实现，分组待做",
    54: "部分：批量选择删除已实现，文件夹待做",
    70: "部分：模型记忆已实现，自动切换依赖页面 UI",
    78: "部分：域名可信度分级已实现",
    80: "部分：来源标注已实现，内容核实待做",
    82: "部分：来源标注已实现，二次追问待做",
}

# Form factors that are out of scope for Chrome extension on doubao.com
OUT_OF_SCOPE_GROUPS = ("分组二", "分组三", "分组四", "分组五")

# #213 DoubaoWatermark was marked ✅ in overview but description is watermark removal — reclassify
COMPLIANCE_OVERRIDE = {
    213: ("SKIP", "A 类去水印（总表误标 ✅，功能说明为去水印）"),
    # #13 GrantTotinov/AIExporter — compliant export (not watermark)
}

# Features that are clearly Doubao-web-extension relevant (group 1)
# For non-group-1 compliant items: mark as 待实现 with reason "形态非本扩展目标/第三方集成" or backlog P2


def parse_overview(text):
    rows = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        parts = [c.strip() for c in line.strip("|").split("|")]
        if len(parts) < 11:
            continue
        if not parts[0].isdigit():
            continue
        num = int(parts[0])
        repo_cell = parts[1]
        m = re.search(r"\[([^\]]+)\]\(([^)]+)\)", repo_cell)
        if m:
            short, url = m.group(1), m.group(2)
        else:
            short, url = repo_cell, ""
        impl_raw = parts[9]
        impl_x = "[x]" in impl_raw.replace(" ", "")
        rows.append(
            {
                "id": num,
                "repo": short,
                "url": url,
                "stars": parts[2],
                "group": parts[3],
                "category": parts[4],
                "form": parts[5],
                "desc": parts[6],
                "compliance_raw": parts[7],
                "priority_raw": parts[8],
                "impl_x": impl_x,
                "note": parts[10] if len(parts) > 10 else "",
            }
        )
    return rows


def classify(row):
    """Return dict with compliance, builtin, impl_status, reason, backlog_pri"""
    rid = row["id"]
    note = row["note"]
    comp_raw = row["compliance_raw"]
    pri_raw = row["priority_raw"]

    # Compliance override
    if rid in COMPLIANCE_OVERRIDE:
        status, reason = COMPLIANCE_OVERRIDE[rid]
        return {
            "compliance": "SKIP",
            "compliance_detail": reason,
            "builtin": "no",
            "builtin_reason": "",
            "impl": "[ ]",
            "impl_reason": "合规放弃",
            "backlog": "SKIP",
            "dwt_module": "",
        }

    if comp_raw in ("❌", "⚠️") or pri_raw == "SKIP":
        detail = note or ("灰区" if comp_raw == "⚠️" else "违规")
        return {
            "compliance": "SKIP",
            "compliance_detail": detail,
            "builtin": "no",
            "builtin_reason": "",
            "impl": "[ ]",
            "impl_reason": "合规放弃",
            "backlog": "SKIP",
            "dwt_module": "",
        }

    # Doubao builtin abandon (only if not already implemented)
    if rid in DOUBAO_BUILTIN and not row["impl_x"]:
        return {
            "compliance": "OK",
            "compliance_detail": "合规",
            "builtin": "yes",
            "builtin_reason": DOUBAO_BUILTIN[rid],
            "impl": "[ ]",
            "impl_reason": "豆包已有",
            "backlog": "SKIP-BUILTIN",
            "dwt_module": "",
        }

    # Force-impl: capability already covered by an existing dwt module
    if rid in FORCE_IMPL:
        mod, detail = FORCE_IMPL[rid]
        return {
            "compliance": "OK",
            "compliance_detail": "合规",
            "builtin": "no",
            "builtin_reason": "",
            "impl": "[x]",
            "impl_reason": f"已实现 — {detail}",
            "backlog": "DONE",
            "dwt_module": mod,
            "sync_overview": not row["impl_x"],
        }

    # Implemented
    if row["impl_x"]:
        partial = PARTIAL.get(rid, "")
        reason = "已实现" + (f"（{partial}）" if partial else "")
        # map module
        mod = ""
        for mname, ids in MODULE_COVERS.items():
            if rid in ids:
                mod = mname
                break
        return {
            "compliance": "OK",
            "compliance_detail": "合规",
            "builtin": "no",
            "builtin_reason": "",
            "impl": "[x]",
            "impl_reason": reason,
            "backlog": "DONE",
            "dwt_module": mod,
        }

    # Compliant not implemented
    group = row["group"]
    # Out of scope form factors
    if any(g in group for g in OUT_OF_SCOPE_GROUPS):
        # Group 3 P1 marked as browser extension in table but usually 3rd-party — still out of dwt scope
        return {
            "compliance": "OK",
            "compliance_detail": "合规",
            "builtin": "no",
            "builtin_reason": "",
            "impl": "[ ]",
            "impl_reason": "待实现（形态非 doubao.com 扩展目标：分组二三四五 / 第三方软件）",
            "backlog": "P2" if pri_raw == "P2" else ("P2" if "分组" in group else pri_raw),
            "dwt_module": "",
            "scope": "out",
        }

    # Group 1 remaining
    backlog = pri_raw if pri_raw in ("P0", "P1", "P2") else "P2"
    # Refine some low-value / weak relevance
    weak = {
        56: ("P2", "PinSpark 视觉关键词生成器，与豆包网页增强相关度弱"),
        59: ("P2", "数字人看板框架，非核心对话增强"),
        60: ("P1", "多 Agent 技能注入，需评估与豆包页面耦合"),
        63: ("P1", "背景更换 QoL"),
        64: ("P1", "语音输入粘贴到任意位置，跨应用能力受限"),
        85: ("P2", "知乎反爬管线，非豆包核心"),
        86: ("P1", "可拖拽悬浮聊天窗"),
        87: ("P1", "Deepseek-pp 移植增强"),
        89: ("P2", "开发者向，说明过少"),
        90: ("P2", "仓库说明空白"),
        91: ("P2", "标签页整理，非豆包专属"),
        93: ("P1", "豆包 AI 增强合集，需拆解原子功能"),
        94: ("P2", "官方扩展英文化，非功能"),
        95: ("P2", "说明空白"),
        96: ("P1", "英语听后解释"),
        97: ("P1", "多 AI 快捷聊天"),
        98: ("P1", "豆包搜索扩展"),
        99: ("P2", "A2A 协议桥接，偏开发者"),
        100: ("P1", "多模型并排聊天"),
        101: ("P0", "划词碎片知识收藏 — 与导出互补"),
        102: ("P2", "API 监听型，边界需审"),
        103: ("P1", "多模型集体综合"),
        104: ("P1", "侧边栏面板停靠"),
        105: ("P1", "arXiv 解释器"),
        106: ("P1", "AI 侧栏"),
        107: ("P2", "订单扩展+飞书后端，非对话增强"),
        51: ("P2", "本地项目文件夹桥接，形态偏工具"),
        58: ("P1", "首页推荐屏蔽"),
        84: ("P0", "Better_Doubao 综合舒适增强（高星）"),
    }
    reason = "待实现"
    if rid in weak:
        backlog, extra = weak[rid]
        reason = f"待实现 — {extra}"
    elif rid in PARTIAL:
        reason = f"待实现 — {PARTIAL[rid]}"  # shouldn't hit if impl_x
    else:
        reason = f"待实现 — {row['category'] or '功能增强'}"

    return {
        "compliance": "OK",
        "compliance_detail": "合规",
        "builtin": "no",
        "builtin_reason": "",
        "impl": "[ ]",
        "impl_reason": reason,
        "backlog": backlog,
        "dwt_module": "",
        "scope": "in",
    }


def main():
    text = OVERVIEW.read_text(encoding="utf-8")
    rows = parse_overview(text)
    assert len(rows) == 225, len(rows)

    classified = []
    for r in rows:
        c = classify(r)
        classified.append({**r, **c})

    total = len(classified)
    impl = sum(1 for r in classified if r["impl"] == "[x]")
    skip_comp = sum(1 for r in classified if r["impl_reason"] == "合规放弃")
    skip_builtin = sum(1 for r in classified if r["impl_reason"] == "豆包已有")
    remaining = sum(
        1
        for r in classified
        if r["impl"] == "[ ]" and r["impl_reason"] not in ("合规放弃", "豆包已有")
    )
    # split remaining: in-scope group1 vs out-of-scope
    rem_in = [
        r
        for r in classified
        if r["impl"] == "[ ]"
        and r["impl_reason"] not in ("合规放弃", "豆包已有")
        and r.get("scope") != "out"
        and "分组一" in r["group"]
    ]
    rem_out = [
        r
        for r in classified
        if r["impl"] == "[ ]"
        and r["impl_reason"] not in ("合规放弃", "豆包已有")
        and (r.get("scope") == "out" or "分组一" not in r["group"])
    ]

    # Also count overview-native skip (priority SKIP) for comparison
    overview_skip = sum(1 for r in rows if r["priority_raw"] == "SKIP" or r["compliance_raw"] in ("❌", "⚠️"))
    overview_impl = sum(1 for r in rows if r["impl_x"])

    # Prioritized backlog for in-scope remaining
    backlog_p0 = [r for r in rem_in if r["backlog"] == "P0"]
    backlog_p1 = [r for r in rem_in if r["backlog"] == "P1"]
    backlog_p2 = [r for r in rem_in if r["backlog"] == "P2"]

    # Sort by stars desc within priority
    def stars_key(r):
        try:
            return -int(r["stars"])
        except Exception:
            return 0

    backlog_p0.sort(key=stars_key)
    backlog_p1.sort(key=stars_key)
    backlog_p2.sort(key=stars_key)

    # Top 10 next to implement
    top10 = (backlog_p0 + backlog_p1 + backlog_p2)[:10]

    today = "2026-10-16"
    lines = []
    lines.append("# FEATURE_INTEGRATION_TRACKER · 225 行功能整合跟踪")
    lines.append("")
    lines.append(f"> **生成日期**: {today} ｜ **审计轮次**: 首轮（表盘点 + 代码交叉核对，未批量实现）")
    lines.append(f"> **源表**: [豆包插件功能总览_2026-10-15.md](./豆包插件功能总览_2026-10-15.md)")
    lines.append(f"> **合规报告**: [豆包插件高价值筛选与合规评估_2026-10-15.md](./豆包插件高价值筛选与合规评估_2026-10-15.md)")
    lines.append(f"> **代码根**: `F:\\doubao-web-toolkit`")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 0. 计数摘要")
    lines.append("")
    lines.append("| 指标 | 数量 | 说明 |")
    lines.append("| --- | ---: | --- |")
    lines.append(f"| **total** | **{total}** | 总表行数 |")
    lines.append(f"| **impl [x]** | **{impl}** | 已在 dwt 落地（总表原勾选 {overview_impl}；本轮同步 +{impl - overview_impl}） |")
    lines.append(f"| **skip-compliance** | **{skip_comp}** | 合规放弃（❌/⚠️/误标修正），总表原生 SKIP≈{overview_skip} |")
    lines.append(f"| **skip-builtin** | **{skip_builtin}** | 豆包网页版已有能力，放弃外挂 |")
    lines.append(f"| **remaining-todo** | **{remaining}** | 合规且未实现（含非本扩展形态） |")
    lines.append(f"| ↳ 其中分组一（本扩展目标） | {len(rem_in)} | 后续实现主队列 |")
    lines.append(f"| ↳ 其中分组二～五（形态外） | {len(rem_out)} | 默认 P2 / 不进本扩展主线 |")
    lines.append("")
    lines.append("> **勘误**：`PROJECT_STATUS` 曾写「56 行 `[x]`」；按总表单元格实测为 **49**，加上本轮能力覆盖同步后见上表。")
    lines.append("")
    lines.append("### 代码模块对照（已落地）")
    lines.append("")
    lines.append("| 模块路径 | 覆盖总表 # | 状态 |")
    lines.append("| --- | --- | --- |")
    lines.append("| `content/features/export/module.js` | #13, #26–37 | ✅ |")
    lines.append("| `content/features/navigator/module.js` | #38–50（含 #38 搜索） | ✅ |")
    lines.append("| `content/features/conversation-manager/module.js` | #52–55（#53/#54 分组/文件夹待补） | ✅ 部分 |")
    lines.append("| `content/features/theme/module.js` | #57, #61, #62 | ✅ |")
    lines.append("| `content/features/input-enhance/module.js` | #67, #69, #70 | ✅ |")
    lines.append("| `content/features/prompt-bar/module.js` | #71–77 | ✅ |")
    lines.append("| `content/features/source-inspector/module.js` | #78–82（核实/二次追问待补） | ✅ 部分 |")
    lines.append("| `content/features/reading-mark/module.js` | #108 | ✅ |")
    lines.append("| `content/features/chat-digest/module.js` | #30, #109 | ✅ |")
    lines.append("| `content/features/enhance/module.js` | 自动滚动（自研） | ✅ 自研 |")
    lines.append("| `content/features/batch-input/*` | 自研（总表无对应） | ✅ 自研 |")
    lines.append("| `content/features/debug-panel/module.js` | 自研（总表无对应） | ✅ 自研 |")
    lines.append("| `popup/` + `options/` | 开关与配置入口 | ✅ |")
    lines.append("")
    lines.append("**本轮结论**：以代码为准校正勾选（#13→`[x]`）；新增 builtin/形态分类与 P0–P2 backlog；**未**开始批量实现新功能。")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 1. 优先级 backlog（分组一 · 合规 · 未实现 · 非 builtin）")
    lines.append("")
    lines.append(f"- **P0**: {len(backlog_p0)} 条")
    lines.append(f"- **P1**: {len(backlog_p1)} 条")
    lines.append(f"- **P2**: {len(backlog_p2)} 条")
    lines.append("")
    lines.append("### Top 10 下一轮优先实现")
    lines.append("")
    lines.append("| 序 | # | 仓库 | Stars | 建议优先级 | 功能要点 |")
    lines.append("| ---: | ---: | --- | ---: | --- | --- |")
    for i, r in enumerate(top10, 1):
        desc = (r["desc"] or "")[:48].replace("|", "/")
        lines.append(
            f"| {i} | {r['id']} | [{r['repo']}]({r['url']}) | {r['stars']} | {r['backlog']} | {desc} |"
        )
    lines.append("")
    lines.append("### P0 清单")
    lines.append("")
    if backlog_p0:
        lines.append("| # | 仓库 | Stars | 类目 | 原因/备注 |")
        lines.append("| ---: | --- | ---: | --- | --- |")
        for r in backlog_p0:
            lines.append(
                f"| {r['id']} | [{r['repo']}]({r['url']}) | {r['stars']} | {r['category']} | {r['impl_reason']} |"
            )
    else:
        lines.append("_（无）_")
    lines.append("")
    lines.append("### P1 清单")
    lines.append("")
    if backlog_p1:
        lines.append("| # | 仓库 | Stars | 类目 | 原因/备注 |")
        lines.append("| ---: | --- | ---: | --- | --- |")
        for r in backlog_p1:
            lines.append(
                f"| {r['id']} | [{r['repo']}]({r['url']}) | {r['stars']} | {r['category']} | {r['impl_reason']} |"
            )
    else:
        lines.append("_（无）_")
    lines.append("")
    lines.append("### P2 清单（分组一剩余）")
    lines.append("")
    if backlog_p2:
        lines.append("| # | 仓库 | Stars | 类目 | 原因/备注 |")
        lines.append("| ---: | --- | ---: | --- | --- |")
        for r in backlog_p2:
            lines.append(
                f"| {r['id']} | [{r['repo']}]({r['url']}) | {r['stars']} | {r['category']} | {r['impl_reason']} |"
            )
    else:
        lines.append("_（无）_")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 2. 全量跟踪表（按 # 顺序 1–225）")
    lines.append("")
    lines.append("| # | 仓库 | 合规 | 豆包已有? | impl | 若未实现：原因 | dwt 模块 | 原优先级 |")
    lines.append("| ---: | --- | --- | --- | --- | --- | --- | --- |")
    for r in classified:
        builtin = (
            f"yes→放弃：{r['builtin_reason']}"
            if r["builtin"] == "yes"
            else "no"
        )
        # shorten
        if len(builtin) > 40:
            builtin = builtin[:38] + "…"
        reason = r["impl_reason"]
        if len(reason) > 60:
            reason = reason[:58] + "…"
        lines.append(
            f"| {r['id']} | [{r['repo']}]({r['url']}) | {r['compliance']}"
            f"{(' · ' + r['compliance_detail']) if r['compliance']=='SKIP' else ''}"
            f" | {builtin} | {r['impl']} | {reason if r['impl']=='[ ]' else '—'} | {r.get('dwt_module') or '—'} | {r['priority_raw']} |"
        )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 3. 分类规则（本轮）")
    lines.append("")
    lines.append("1. **合规放弃**：总表 `❌` / `⚠️` / `priority=SKIP`；另将 #213（去水印误标 ✅）纠正为 SKIP。")
    lines.append("2. **豆包已有**：网页版已提供等价能力且外挂边际收益低（本轮：#65/#66 朗读、#68 专家模式自动切换）。")
    lines.append("3. **已实现 [x]**：与总表现有勾选及 `content/features/**` 模块对齐；部分项保留「部分实现」备注。")
    lines.append("4. **待实现**：合规 + 非 builtin + 未勾选；分组一进 P0/P1/P2 主队列；分组二～五标为形态外（默认不进本扩展）。")
    lines.append("5. **自研条目**（调试面板、批量输入+验证码暂停、enhance 自动滚动）不占 225 行，见总表文末「自定义功能」。")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 4. 后续实现轮次约定")
    lines.append("")
    lines.append("- 每轮只从「Top 10 / P0」取少量原子功能落地，并回写本表 `impl` 与总表勾选。")
    lines.append("- 不声称全量整合完成，直至 `remaining-todo（分组一）` = 0 或全部转为放弃原因。")
    lines.append("")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("WROTE", OUT)
    print("COUNTS", {
        "total": total,
        "impl": impl,
        "skip_compliance": skip_comp,
        "skip_builtin": skip_builtin,
        "remaining_todo": remaining,
        "remaining_group1": len(rem_in),
        "remaining_out": len(rem_out),
        "p0": len(backlog_p0),
        "p1": len(backlog_p1),
        "p2": len(backlog_p2),
    })
    print("TOP10")
    for i, r in enumerate(top10, 1):
        print(f"  {i}. #{r['id']} [{r['backlog']}] {r['repo']} stars={r['stars']}")

    # Update PROJECT_STATUS pointer
    status = STATUS.read_text(encoding="utf-8")
    pointer_block = (
        "## 功能整合跟踪（主入口）\n\n"
        f"> **最后审计**: {today}（首轮：表盘点 + 代码交叉核对）\n\n"
        f"- **跟踪表**: [FEATURE_INTEGRATION_TRACKER.md](./FEATURE_INTEGRATION_TRACKER.md)\n"
        f"  - total **{total}** / impl **{impl}** / skip-compliance **{skip_comp}** / "
        f"skip-builtin **{skip_builtin}** / remaining-todo **{remaining}**"
        f"（分组一 **{len(rem_in)}** + 形态外 **{len(rem_out)}**）\n"
        f"- 源总表仍见 [豆包插件功能总览_2026-10-15.md](./豆包插件功能总览_2026-10-15.md)"
        f"（实测原 {overview_impl} 行 `[x]`；本轮同步后 **{impl}**）\n"
    )
    if "## 功能整合跟踪（主入口）" in status:
        # replace existing block until next ##
        status = re.sub(
            r"## 功能整合跟踪（主入口）\n\n.*?(?=\n## |\Z)",
            pointer_block + "\n",
            status,
            count=1,
            flags=re.S,
        )
    else:
        # insert after first --- following title block, or before "## 1."
        if "## 1. 原始需求" in status:
            status = status.replace(
                "## 1. 原始需求",
                pointer_block + "\n## 1. 原始需求",
                1,
            )
        else:
            status = pointer_block + "\n" + status

    # Refresh section 8 index rows for overview + tracker
    status = re.sub(
        r"\| 功能总览表 \| `projects/doubao-web-toolkit/豆包插件功能总览_2026-10-15\.md` \| [^|]+\|",
        f"| 功能总览表 | `projects/doubao-web-toolkit/豆包插件功能总览_2026-10-15.md` | 225 行全量 + {impl} 行 impl 勾选 |",
        status,
        count=1,
    )
    if "FEATURE_INTEGRATION_TRACKER.md`" not in status:
        status = status.replace(
            f"| 功能总览表 | `projects/doubao-web-toolkit/豆包插件功能总览_2026-10-15.md` | 225 行全量 + {impl} 行 impl 勾选 |",
            f"| 功能总览表 | `projects/doubao-web-toolkit/豆包插件功能总览_2026-10-15.md` | 225 行全量 + {impl} 行 impl 勾选 |\n"
            f"| **功能整合跟踪** | `projects/doubao-web-toolkit/FEATURE_INTEGRATION_TRACKER.md` | "
            f"全量 225 行合规/builtin/impl/backlog；主进度入口 |",
            1,
        )
    # Also fix section 3 bullet that claimed 56
    status = re.sub(
        r"- \*\*\d+ 行\*\*已从 `\[ \]` → `\[x\]`.+",
        f"- **{impl} 行**已勾选 `[x]`（总表原 {overview_impl}；本轮按代码能力同步，见 FEATURE_INTEGRATION_TRACKER）",
        status,
        count=1,
    )

    # Update last-updated line lightly
    status = re.sub(
        r"> \*\*最后更新\*\*:.*",
        f"> **最后更新**: {today}（晚：FEATURE_INTEGRATION_TRACKER 首轮审计；内置浏览器 live-boot + navigator「共 21 条」验收通过）",
        status,
        count=1,
    )

    # Sync overview checkboxes for FORCE_IMPL rows still unchecked
    overview = text
    synced = []
    for rid, (mod, detail) in FORCE_IMPL.items():
        # match table row start "| {rid} |" ... impl column
        pattern = re.compile(
            rf"^(\| {rid} \|.*?\| ✅ \| P\d \| )(\[ \])( \|.*)$",
            re.M,
        )
        def _repl(m, _detail=detail):
            note = m.group(3)
            if "→ dwt" not in note:
                note = note.rstrip()
                if note.endswith("|"):
                    # append into last cell
                    note = note[:-1].rstrip() + f" → dwt（{_detail}） |"
            return m.group(1) + "[x]" + note

        new_overview, n = pattern.subn(_repl, overview, count=1)
        if n:
            overview = new_overview
            synced.append(rid)
    if synced:
        OVERVIEW.write_text(overview, encoding="utf-8")
        print("SYNCED_OVERVIEW", synced)

    # Fix stale "56 行" claims in PROJECT_STATUS
    status = re.sub(r"\*\*56 行\*\*", f"**{impl} 行**", status)
    status = re.sub(r"56 行 impl", f"{impl} 行 impl", status)
    status = re.sub(r"56 行`\[x\]`", f"{impl} 行 `[x]`", status)
    status = re.sub(
        r"225 行全量 \+ 56 行 impl 勾选",
        f"225 行全量 + {impl} 行 impl 勾选",
        status,
    )
    status = re.sub(
        rf"源总表仍见 \[豆包插件功能总览_2026-10-15.md\]\(\./豆包插件功能总览_2026-10-15.md\)（56 行 `\[x\]` 与代码一致，本轮未改勾选）",
        f"源总表仍见 [豆包插件功能总览_2026-10-15.md](./豆包插件功能总览_2026-10-15.md)"
        f"（实测原 {overview_impl} 行 `[x]`；本轮同步后 **{impl}**）",
        status,
    )

    STATUS.write_text(status, encoding="utf-8")
    print("UPDATED", STATUS)


if __name__ == "__main__":
    main()

