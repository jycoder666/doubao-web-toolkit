# -*- coding: utf-8 -*-
from pathlib import Path
import re

tracker = Path(r"F:\docs\projects\doubao-web-toolkit\FEATURE_INTEGRATION_TRACKER.md")
overview = Path(r"F:\docs\projects\doubao-web-toolkit\豆包插件功能总览_2026-10-15.md")
text = tracker.read_text(encoding="utf-8")

impl = {
    56: ("[x]", "本地关键词拼检索词，不请求外站", "keyword-spark"),
    87: ("[x]", "宽屏+长回复折叠（页内精简）", "page-comfort"),
    93: ("[x]", "合集拆分覆盖：导航/导出/语料/宽屏等已有模块", "多个模块"),
    96: ("[x]", "选中英语拆行并插入解释提示（非听写）", "context-lines"),
    105: ("[x]", "arXiv 编号→解读提示插入输入框（不抓论文）", "arxiv-prompt"),
}
abandon = {
    64: ("[ ]", "形态外/能力受限 — 跨应用语音粘贴，本扩展仅 doubao.com content script", "—"),
    60: ("[ ]", "形态外 — 多 Agent 技能注入与宿主深度耦合，超出本扩展边界", "—"),
    97: ("[ ]", "形态外 — 多 AI 快捷聊天，超出豆包单站 DOM 增强", "—"),
    98: ("[ ]", "形态外 — 独立搜索扩展形态，非对话页增强", "—"),
    100: ("[ ]", "形态外 — 多模型并排聊天", "—"),
    103: ("[ ]", "形态外 — 多模型集体综合", "—"),
    104: ("[ ]", "形态外 — 通用侧栏停靠，非豆包专属", "—"),
    106: ("[ ]", "形态外 — 通用 AI 侧栏", "—"),
    51: ("[ ]", "形态外 — 本地项目文件夹桥接", "—"),
    85: ("[ ]", "形态外 — 知乎反爬管线，非豆包核心", "—"),
    59: ("[ ]", "形态外 — 数字人看板框架", "—"),
    89: ("[ ]", "说明不足放弃 — 开发者向、文档过少", "—"),
    90: ("[ ]", "说明不足放弃 — 仓库说明空白", "—"),
    91: ("[ ]", "形态外 — 标签页整理，非豆包专属", "—"),
    94: ("[ ]", "非功能放弃 — 官方扩展英文化", "—"),
    95: ("[ ]", "说明不足放弃 — 说明空白", "—"),
    99: ("[ ]", "形态外 — A2A 协议桥接，偏开发者", "—"),
    102: ("[ ]", "边界放弃 — API 监听型，合规风险", "—"),
    107: ("[ ]", "形态外 — 订单+飞书后端，非对话增强", "—"),
}


def upd_full_row(src, rid, status, reason, mod):
    pat = re.compile(
        rf"^\| {rid} \| (?P<body>.+?) \| OK \| no \| \[.?\] \| [^|]+ \| [^|]+ \| (?P<p>[^|]+) \|$",
        re.M,
    )

    def repl(m):
        body = m.group("body")
        prio = m.group("p").strip()
        return f"| {rid} | {body} | OK | no | {status} | {reason} | {mod} | {prio} |"

    new, n = pat.subn(repl, src, count=1)
    return new, n


for rid, (st, reason, mod) in {**impl, **abandon}.items():
    text, n = upd_full_row(text, rid, st, reason, mod)
    print(f"full {rid}: {n}")

for rid, (st, reason, mod) in impl.items():
    text = re.sub(
        rf"(\| {rid} \| \[[^\]]+\]\([^)]+\) \| \d+ \| [^|]+ \| )待实现[^\n|]*",
        rf"\1✅ {mod}",
        text,
        count=2,
    )

for rid, (st, reason, mod) in abandon.items():
    short = reason.split("—", 1)[-1].strip() if "—" in reason else reason
    text = re.sub(
        rf"(\| {rid} \| \[[^\]]+\]\([^)]+\) \| \d+ \| [^|]+ \| )待实现[^\n|]*",
        rf"\1放弃 — {short}",
        text,
        count=2,
    )

impl_x = len(re.findall(r"\| OK \| no \| \[x\] \|", text))
todo_open = 0
for m in re.finditer(r"^\| (\d+) \| .+? \| OK \| no \| \[ \] \| ([^|]+) \|", text, re.M):
    reason = m.group(2).strip()
    if reason.startswith("待实现"):
        todo_open += 1
print("OK [x] rows:", impl_x)
print("still 待实现:", todo_open)

text = re.sub(r"\*\*impl \[x\]\*\* \| \*\*\d+\*\*", f"**impl [x]** | **{impl_x}**", text, count=1)
text = re.sub(
    r"\*\*remaining-todo\*\* \| \*\*\d+\*\*",
    f"**remaining-todo** | **{todo_open}**",
    text,
    count=1,
)
note = "\n> **2026-10-17 晨**：补勾 #56/#87/#93/#96/#105；多 AI/跨应用/说明空白项改为明确放弃原因。\n"
if "补勾 #56" not in text:
    text = text.replace("## 0. 计数摘要", note + "\n## 0. 计数摘要", 1)

tracker.write_text(text, encoding="utf-8")

ov_lines = overview.read_text(encoding="utf-8").splitlines()
keys = {
    "PinSpark": 56,
    "doubao-pp": 87,
    "Context-Lines": 96,
    "arXiv_to_AI_Explainer": 105,
    "DoubaoPlus": 93,
}
out = []
for line in ov_lines:
    for key in keys:
        if key in line and "| [ ] |" in line:
            line = line.replace("| [ ] |", "| [x] |", 1)
    out.append(line)
overview.write_text("\n".join(out) + "\n", encoding="utf-8")
print("overview updated")

# list remaining 待实现
print("--- remaining 待实现 ---")
for m in re.finditer(r"^\| (\d+) \| \[([^\]]+)\][^|]*\| OK \| no \| \[ \] \| ([^|]+) \|", text, re.M):
    if m.group(3).strip().startswith("待实现"):
        print(m.group(1), m.group(2), m.group(3).strip()[:60])
