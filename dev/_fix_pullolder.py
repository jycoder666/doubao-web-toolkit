# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r'F:/doubao-web-toolkit/content/features/navigator/module.js')
t = p.read_text(encoding='utf-8')
old = """  async function pullOlder(sc) {
    if (!sc || !sc.isConnected) return false;
    const beforeH = sc.scrollHeight;
    const beforeKey = visibleTexts().join('\\n');
    nudge(sc, 0);
    requestOlder(sc);
    await sleep(700);
    if (!sc.isConnected) return false;
    const grewH = sc.scrollHeight > beforeH + 80;
    const grewT = visibleTexts().join('\\n') !== beforeKey;
    return grewH || grewT;
  }"""
new = """  async function pullOlder(sc) {
    if (!sc || !sc.isConnected) return false;
    const beforeH = sc.scrollHeight;
    nudge(sc, 0);
    requestOlder(sc);
    await sleep(700);
    if (!sc.isConnected) return false;
    // 只认高度增长：滚到顶时视口文案必变，不能当「拉到更早消息」
    return sc.scrollHeight > beforeH + 80;
  }"""
if old not in t:
    raise SystemExit('pullOlder block not found')
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('pullOlder fixed')

sp = Path(r'F:/docs/skills/cursor-builtin-browser-extension/SKILL.md')
st = sp.read_text(encoding='utf-8')
st2 = st.replace(
    '| 禁止死循环滚动 |\n\n| 面板内容溢出',
    '| 禁止死循环滚动 |\n| 面板内容溢出',
)
if st2 != st:
    sp.write_text(st2, encoding='utf-8')
    print('skill table fixed')
else:
    print('skill table unchanged')
