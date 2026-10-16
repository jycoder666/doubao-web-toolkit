# -*- coding: utf-8 -*-
from pathlib import Path
import re

p = Path(r"F:\docs\projects\doubao-web-toolkit\FEATURE_INTEGRATION_TRACKER.md")
t = p.read_text(encoding="utf-8")

pat = re.compile(
    r"^\| (\d+) \| (?P<body>.+?) \| OK \| no \| \[ \] \| (?P<reason>[^|]+) \| (?P<mod>[^|]+) \| (?P<p>[^|]+) \|$",
    re.M,
)


def repl(m):
    reason = m.group("reason").strip()
    markers = ("形态外", "扩展目标", "非本扩展", "非对话", "非豆包", "非功能")
    if reason.startswith("待实现") and any(x in reason for x in markers):
        tail = reason
        for prefix in ("待实现 — ", "待实现—", "待实现：", "待实现:", "待实现"):
            if tail.startswith(prefix):
                tail = tail[len(prefix) :].lstrip(" ：:—-")
                break
        reason2 = "放弃 — " + tail
        return (
            f"| {m.group(1)} | {m.group('body')} | OK | no | [ ] | "
            f"{reason2} | {m.group('mod').strip()} | {m.group('p').strip()} |"
        )
    return m.group(0)


t2, n = pat.subn(repl, t)
print("rewrote", n)

todo = []
for m in re.finditer(
    r"^\| (\d+) \| .+? \| OK \| no \| \[ \] \| ([^|]+) \|", t2, re.M
):
    if m.group(2).strip().startswith("待实现"):
        todo.append((m.group(1), m.group(2).strip()))

print("still 待实现 total", len(todo))
for rid, reason in todo[:20]:
    print(rid, reason[:80])

impl_x = len(re.findall(r"\| OK \| no \| \[x\] \|", t2))
t2 = re.sub(r"\*\*impl \[x\]\*\* \| \*\*\d+\*\*", f"**impl [x]** | **{impl_x}**", t2, count=1)
t2 = re.sub(
    r"\*\*remaining-todo\*\* \| \*\*\d+\*\*",
    f"**remaining-todo** | **{len(todo)}**",
    t2,
    count=1,
)
p.write_text(t2, encoding="utf-8")
print("impl_x", impl_x)
