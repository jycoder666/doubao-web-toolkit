// batch-input/panel.js — 批量问答主界面面板 v5
// v5.23.1: 新对话控件优先 role=button; sessionWatch 忽略旧 id 防回写
// v5.23: 会话关联 — JSON 根 sessionId/sessionUrl; 「从头开始」点侧栏「新对话」绑定新会话;
//        「继续」优先导航到 sessionId, 失败再建新会话; URL 监听补 id; 每条完成后 persist
// v5.22: 附件持久化硬修 — chrome.storage + localStorage 双写; 单文件 dataUrl≤2.5MB;
//        超限/配额失败仍落 fileName 元数据(角标保留, needsReselect); hydrate 恢复 File
// v5.21: 删 JSON 区长 tip(#dwt-batch-json-tip); schema 说明并入 #dwt-batch-help; 运行中加固「应用到队列」禁触
// v5.20: JSON 根改为对象 {prefixOn,prefix,items}; 兼容旧数组根; 应用/导入同步前置词到 UI+storage
// v5.19: 前置词 pill 开关 CSS 落地（隐藏原生勾选 + 蓝灰 track）
// v5.18: 合入止闪烁+附件持久化收尾（同 rev 不重挂 / 内存共享 / rail 不反复 remove）
// v5.17: 前置词原生勾选→柔和 pill 开关; 表格/JSON tabs 软边; 导出 JSON 与导入同级 outline
// v5.16: 同 rev 不重挂(止闪烁); 内存 queue 跨 reinject 共享; 弹层开时 renderQueue 重建弹层;
//        附件 persist fileName/mime/dataUrl(≤1MB); 大文件 needsReselect; 重载 hydrate File
// v5.15: 附件弹层 tip-hd 与 hint 合并一行「按照顺序发送豆包 n/10」; 删独立 att-hint 段
// v5.14: 「附」多附件管理弹层(增/删/换/拖拽排序); attachments[] 上限对齐豆包 maxFileCount=10
// v5.13: 面板固定高~500px flex 列; table-wrap/json-wrap 中部可滚; thead sticky; 柔和滚动条
// v5.12: 回复列缩窄(查看+tip); 附图→附件(对齐豆包 accept); 队列存 fileName/mime/objectUrl|dataUrl
// v5.11: 导出文案「导出 JSON」; 空队列禁用导出; 添加/导出空闲可用态对比度
// v5.10: 删底部状态行; .btns 态矩阵(空闲/运行/暂停可续/有断点); 导出运行中仍可
// v5.9: 间隔/回复超时移出面板 row2 → options 配置页 (仍读 dwt_min_interval / dwt_reply_timeout)
// v5.8: 删底部 .foot 提示; 「完成后自动停/空闲可拖拽/运行中只读」并入 #dwt-batch-help tip 分行短列表
// v5.7: 删底部 details.import; 主按钮组「导入 JSON」(选文件/粘贴·追加或替换, 空闲可用)
// v5.6: 「应用到队列」+ JSON 编辑仅空闲可改; start 即锁, 等 status 前不误解锁
// v5.5: JSON placeholder/tip/帮助补全字段清单; 从队列刷新先同步 runner 再序列化 (含 imageDataUrl/status/reply)
// v5.4: JSON 编辑区右上角「复制」一键剪贴板 + 短暂已复制提示
// v5.3: 前置词开关 (关=隐藏编辑且发送不加; 开=编辑区在表格上方); 「＋添加」并入 .btns 最左, 去掉列表下虚线 qbar
// v5.2: 删「类型」列与 select.qtype; 类型由是否附图推断 (有图→图片问答 / 无图→纯文本)
// v5.1: (已废) 行内 select.qtype; 删「约束」列; 操作列「图」为可选附图
// v5: JSON 配置区强化 (大编辑区/schema tip/应用同步态) · 记录 reply/result · 状态实时刷新 · 运行锁定
// v4: 表格/JSON 视图切换 · 空闲拖拽排序 · 断点续传 · tip 收纳长文 · 清爽说明
// 队列编辑区: 序号 | 内容 | 状态 | 回复 | 操作(多附件管理/删);
// 可选全局前置词 + tip; JSON 根对象含 prefixOn/prefix/sessionId/sessionUrl/items
// (旧数组根仅 items, 前置词/会话保持 UI);
// 间隔/超时在 options 配置页读写 dwt_min_interval / dwt_reply_timeout (与 popup 共用);
// 队列存 dwt_batch_queue_v2, 断点存 dwt_batch_breakpoint; 会话存 dwt_batch_session_*;
// 入口 dwt.rail (📋 批量问答)。
(function () {
  'use strict';

  const dwt = (window.dwt = window.dwt || {});
  const PANEL_ID = 'dwt-batch-panel';
  const STYLE_ID = 'dwt-batch-panel-style';
  const PANEL_VER = 'v5.24.4';
  const KEY_QUEUE = 'dwt_batch_queue_v2';
  const KEY_LINES = 'dwt_batch_lines';
  const KEY_JSON = 'dwt_batch_json';
  const KEY_MIN = 'dwt_min_interval';
  const KEY_TMO = 'dwt_reply_timeout';
  const KEY_PREFIX = 'dwt_batch_prefix';
  const KEY_PREFIX_ON = 'dwt_batch_prefix_on';
  const KEY_BP = 'dwt_batch_breakpoint';
  const KEY_SESSION_ID = 'dwt_batch_session_id';
  const KEY_SESSION_URL = 'dwt_batch_session_url';
  // 多任务: 索引键只存元信息 + 进度摘要; 每个任务自己的队列存独立键,
  // 这样某个任务的附件 dataUrl 撑爆配额时不会连累其他任务, 删任务也只需删一个键。
  // KEY_QUEUE/KEY_BP/... 仍是「当前活动任务」的镜像（技能硬约束 + popup/外部工具兼容）。
  const KEY_TASKS = 'dwt_batch_tasks_v1';
  const KEY_TASK_Q = 'dwt_batch_task_q_';
  const TASK_NAME_MAX = 40;
  // 对齐豆包网页主附件 input[type=file] accept（Glass 实证 2026-10-19）
  const DOUBAO_ATTACH_ACCEPT = '.pdf,.txt,.csv,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.md,.mobi,.epub,.png,.jpeg,.jpg,.webp,.mp3,.wav,.m4a,.wma,.aac,.ogg,.amr,.flac,.aiff,.ac3';
  // 对齐豆包 uploadMultiEntityConf.maxFileCount=10（chat.js + attachment_limit）
  const DOUBAO_ATTACH_MAX = 10;
  // ≤2.5MB 写 dataUrl；常见截图可跨刷新重建 File；更大仅元数据+角标
  const ATTACH_DATAURL_MAX = Math.floor(2.5 * 1024 * 1024);
  const ATTACH_FILE_MAX = 40 * 1024 * 1024;
  const JSON_PLACEHOLDER = [
    '{',
    '  "prefixOn": false,',
    '  "prefix": "",',
    '  "sessionId": "",',
    '  "sessionUrl": "",',
    '  "items": [',
    '    {"text":"必填·问题", "replyCheck":"", "attachments":[{"fileName":"a.png","mime":"image/png","dataUrl":"(可选)","filePath":null}]},',
    '    {"text":"旧单附件仍可用", "attachment":{"fileName":"b.pdf","mime":"application/pdf"}},',
    '    {"text":"示例", "replyCheck":"plain", "status":"DONE", "reply":"(跑完后写入)"}',
    '  ]',
    '}',
  ].join('\n');

  // 跨 live-boot reinject 共享内存队列，避免闪烁重挂后附件 File/objectUrl 丢失
  const _prev = window.__dwtBatchPanelState;
  let pollTimer = null;
  let doneFreezeTimer = null;
  let sessionWatchTimer = null;
  // imgs[] / 兼容 img: { fileName, mime, data?, objectUrl?, lastModified?, filePath?, file?(runtime) }
  let queue = (_prev && Array.isArray(_prev.queue)) ? _prev.queue : [];
  // 多任务: tasks = 索引数组(元信息+摘要), activeTaskId = 面板当前打开的任务
  let tasks = (_prev && Array.isArray(_prev.tasks)) ? _prev.tasks : [];
  let activeTaskId = (_prev && typeof _prev.activeTaskId === 'string') ? _prev.activeTaskId : '';
  let tasksLoaded = false;   // 每个面板实例只从 storage 载入一次
  let switching = false;     // 切换/新建/删除任务进行中, 防重入
  let pendingDeleteId = '';  // 删除任务二次确认
  let pendingDeleteAt = 0;
  let taskSelSig = '';       // 任务下拉的渲染签名(避免每次轮询重建 option)
  let pickIdx = -1; // 队列下标: 选文件时挂到哪条
  let pickReplaceAt = -1; // >=0 时替换该下标附件; -1=追加
  let attPanelIdx = (_prev && typeof _prev.attPanelIdx === 'number') ? _prev.attPanelIdx : -1;
  let attDragFrom = -1;
  let attDocHandler = null; // 附件弹层 outside-click 监听 (避免重开时误关)
  let viewMode = (_prev && (_prev.viewMode === 'json' || _prev.viewMode === 'table')) ? _prev.viewMode : 'table';
  let breakpoint = (_prev && _prev.breakpoint && typeof _prev.breakpoint.index === 'number')
    ? { index: _prev.breakpoint.index } : null;
  let sessionId = (_prev && typeof _prev.sessionId === 'string') ? _prev.sessionId : '';
  let sessionUrl = (_prev && typeof _prev.sessionUrl === 'string') ? _prev.sessionUrl : '';
  let sessionWatchAvoidId = ''; // 强制新会话时忽略旧 URL id，直到出现新 id
  let dragFrom = -1;
  let tipEl = null; // 当前 tip 浮层
  let jsonDirty = _prev ? !!_prev.jsonDirty : false;
  let jsonSyncLabel = '已同步'; // 应用/同步状态文案
  let prefixOn = _prev ? !!_prev.prefixOn : false;
  let awaitRunStatus = _prev ? !!_prev.awaitRunStatus : false;
  // 「本面板发起的运行还在跑」——只有它为真时才把 runner 的 items 按 index 贴到队列上。
  // 否则旧运行的 status/reply 会贴到改过的队列（实测：跑完后删条目/加条目 → 新条目显示旧「成功」）。
  let panelRunActive = _prev ? !!_prev.panelRunActive : false;
  let renderingQueue = false; // 防 renderQueue → openAttPanel → … 重入

  function publishState() {
    window.__dwtBatchPanelState = {
      ver: PANEL_VER,
      queue,
      breakpoint,
      viewMode,
      prefixOn,
      sessionId,
      sessionUrl,
      attPanelIdx,
      jsonDirty,
      awaitRunStatus,
      panelRunActive,
      tasks,
      activeTaskId,
    };
  }
  publishState();

  // Glass/无扩展: chrome.storage 常经 HTTP 桥且失败被吞; 页面 localStorage 作可靠兜底
  function hasChromeLocal() {
    try {
      return !!(typeof chrome !== 'undefined'
        && chrome.storage
        && chrome.storage.local
        && typeof chrome.storage.local.get === 'function'
        && typeof chrome.storage.local.set === 'function');
    } catch (_) { return false; }
  }
  function lsReadRaw(key) {
    try {
      if (typeof localStorage === 'undefined') return undefined;
      const v = localStorage.getItem(key);
      return v === null ? undefined : v;
    } catch (_) { return undefined; }
  }
  function lsWriteRaw(key, value) {
    if (typeof localStorage === 'undefined') return false;
    if (value === undefined || value === null) {
      try { localStorage.removeItem(key); } catch (_) {}
      return true;
    }
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, s);
    return true;
  }
  function lsSetItems(items) {
    const keys = Object.keys(items || {});
    for (let i = 0; i < keys.length; i++) {
      lsWriteRaw(keys[i], items[keys[i]]);
    }
  }
  function lsRemoveKeys(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    list.forEach((k) => {
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); } catch (_) {}
    });
  }
  function coerceStoredValue(key, raw) {
    if (raw === undefined) return undefined;
    if (key === KEY_PREFIX_ON) {
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'number') return !!raw;
      const s = String(raw).trim().toLowerCase();
      return s === '1' || s === 'true' || s === 'yes';
    }
    if (key === KEY_MIN || key === KEY_TMO) {
      if (typeof raw === 'number') return raw;
      const n = Number(raw);
      return isFinite(n) ? n : raw;
    }
    return raw;
  }
  function queuePersistScore(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return -1;
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return -1;
      let score = arr.length;
      arr.forEach((it) => {
        const atts = (it && (it.attachments || it.imgs)) || [];
        if (!Array.isArray(atts)) return;
        score += atts.length * 20;
        atts.forEach((a) => {
          if (a && (a.dataUrl || a.data)) score += 100;
          if (a && a.fileName) score += 2;
        });
      });
      return score;
    } catch (_) { return -1; }
  }
  async function storageGet(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    let chromeMap = {};
    if (hasChromeLocal()) {
      try { chromeMap = (await chrome.storage.local.get(list)) || {}; } catch (_) { chromeMap = {}; }
    }
    const out = {};
    list.forEach((k) => {
      const cv = chromeMap[k];
      const lv = lsReadRaw(k);
      if (k === KEY_QUEUE) {
        const pick = queuePersistScore(typeof cv === 'string' ? cv : '')
          >= queuePersistScore(typeof lv === 'string' ? lv : '')
          ? cv : lv;
        if (pick !== undefined) out[k] = pick;
        return;
      }
      if (cv !== undefined) out[k] = coerceStoredValue(k, cv);
      else if (lv !== undefined) out[k] = coerceStoredValue(k, lv);
    });
    return out;
  }
  async function storageSet(items) {
    let chromeErr = null;
    if (hasChromeLocal()) {
      try { await chrome.storage.local.set(items); } catch (e) { chromeErr = e; }
    }
    try {
      lsSetItems(items);
      return { ok: true, chromeErr };
    } catch (e) {
      if (!chromeErr) throw e;
      const err = e || chromeErr;
      throw err;
    }
  }
  async function storageRemove(keys) {
    if (hasChromeLocal()) {
      try { await chrome.storage.local.remove(keys); } catch (_) {}
    }
    lsRemoveKeys(keys);
  }

  const RUN_STATE_TEXT = {
    IDLE: '空闲',
    RUNNING: '发送中',
    WAITING_REPLY: '等待回复完成',
    WAITING_MANUAL: '等待放行',
    PAUSED_BY_CAPTCHA: '⚠ 检测到验证码, 已暂停',
    PAUSED_BY_TIMEOUT: '超时, 已暂停',
    PAUSED_BY_CONSTRAINT: '⚠ 回复未满足约束, 已暂停',
    PAUSED_BY_ATTACH: '⚠ 附件插入被拒, 已暂停',
    DONE: '已完成',
    STOPPED: '已停止',
  };
  const ITEM_TEXT = {
    PENDING: '待发送',
    SENDING: '发送中',
    WAITING: '等回复',
    DONE: '成功',
    FAILED: '失败',
    TIMEOUT: '超时',
    FAILED_CONSTRAINT: '约束未满足',
    PAUSED: '已暂停',
    SKIPPED: '已跳过',
  };
  function injectStyles() {
    const old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #${PANEL_ID} {
        position: fixed; right: 12px; bottom: 56px; z-index: 999998;
        width: 700px; height: 500px; max-height: min(500px, 78vh);
        overflow: hidden; display: none; flex-direction: column;
        box-sizing: border-box;
        background: var(--dwt-bg, #fff); color: var(--dwt-fg, #1f2328);
        border: 1px solid var(--dwt-border, #d0d7de); border-radius: 14px;
        box-shadow: 0 12px 32px rgba(0,0,0,.18); padding: 12px 12px 10px;
        font: 12px/1.5 -apple-system, 'Segoe UI', Roboto, sans-serif;
      }
      #${PANEL_ID} .hd { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-shrink:0; }
      #${PANEL_ID} .prog, #${PANEL_ID} .pfx-block, #${PANEL_ID} .bp-bar, #${PANEL_ID} .btns, #${PANEL_ID} .task-row { flex-shrink:0; }
      #${PANEL_ID} .hd-left { display:flex; align-items:center; gap:8px; min-width:0; }
      #${PANEL_ID} .hd b { font-size: 13px; }
      #${PANEL_ID} .hd button.x { border:none; background:transparent; cursor:pointer; font-size:15px; color:inherit; }
      #${PANEL_ID} .view-tabs {
        display:inline-flex; gap:0; padding:2px;
        border:1px solid var(--dwt-border,#d0d7de); border-radius:999px;
        background:var(--dwt-soft,#f6f8fa); overflow:hidden;
      }
      #${PANEL_ID} .view-tabs button {
        border:none; background:transparent; padding:2px 10px; font-size:11px; cursor:pointer;
        color:var(--dwt-muted,#8b949e); border-radius:999px; line-height:1.4;
      }
      #${PANEL_ID} .view-tabs button.on { background:#2d72de; color:#fff; }
      #${PANEL_ID} .view-tabs button:not(.on):hover { color:#2d72de; }
      #${PANEL_ID} .prog { height:4px; border-radius:2px; background:var(--dwt-soft,#f6f8fa); overflow:hidden; margin-bottom:8px; }
      #${PANEL_ID} .prog > i { display:block; height:100%; width:0; background:#2d72de; transition:width .3s; }
      #${PANEL_ID} .task-row { display:flex; gap:6px; align-items:center; margin-bottom:8px; }
      #${PANEL_ID} .task-row select {
        flex:1; min-width:0; height:24px; padding:0 6px;
        font:11px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;
        border:1px solid var(--dwt-border,#d0d7de); border-radius:6px;
        background:var(--dwt-bg,#fff); color:inherit; cursor:pointer;
      }
      #${PANEL_ID} .task-row select:disabled { opacity:.55; cursor:not-allowed; }
      #${PANEL_ID} .task-row button {
        height:24px; padding:0 8px; font-size:11px; cursor:pointer; white-space:nowrap;
        border:1px solid var(--dwt-border,#d0d7de); border-radius:6px;
        background:var(--dwt-bg,#fff); color:inherit;
      }
      #${PANEL_ID} .task-row button:hover:not(:disabled) { border-color:#2d72de; color:#2d72de; }
      #${PANEL_ID} .task-row button:disabled { opacity:.55; cursor:not-allowed; }
      #${PANEL_ID} .qlist {
        display:flex; flex-direction:column; gap:6px; margin:0; padding:0 2px 2px 0; list-style:none;
        flex:1; min-height:0; overflow-x:hidden; overflow-y:auto; scroll-behavior:smooth;
      }
      #${PANEL_ID} .thead, #${PANEL_ID} .qi {
        display:grid; grid-template-columns: 26px minmax(0,1.4fr) 52px 40px 48px;
        gap:4px; align-items:center;
      }
      #${PANEL_ID} .thead > span:nth-child(4),
      #${PANEL_ID} .qi > [data-reply] { justify-self:center; text-align:center; }
      #${PANEL_ID}[data-locked="1"] .task-row,
      #${PANEL_ID}[data-locked="1"] .qi button.mini,
      #${PANEL_ID}[data-locked="1"] #dwt-batch-add,
      #${PANEL_ID}[data-locked="1"] #dwt-batch-importjson,
      #${PANEL_ID}[data-locked="1"] .pfx-head,
      #${PANEL_ID}[data-locked="1"] .rowp,
      #${PANEL_ID}[data-locked="1"] .json-wrap textarea,
      #${PANEL_ID}[data-locked="1"] #dwt-batch-json-apply {
        opacity:.55; pointer-events:none; cursor:not-allowed;
      }
      #${PANEL_ID} .thead {
        position:sticky; top:0; z-index:2; flex-shrink:0;
        padding:4px 6px 6px; margin:0; color:var(--dwt-muted,#8b949e); font-size:10px;
        background:var(--dwt-bg,#fff); box-shadow:0 1px 0 var(--dwt-border,#d0d7de);
      }
      #${PANEL_ID} .qi {
        padding:5px 6px;
        border:1px solid var(--dwt-border,#d0d7de); border-radius:9px;
        background:var(--dwt-soft,#f6f8fa);
      }
      #${PANEL_ID} .qi.active { border-color:#2d72de; box-shadow:0 0 0 1px #2d72de inset; }
      #${PANEL_ID} .qi.bp {
        border-color:#d29922; box-shadow:0 0 0 1px #d29922 inset;
        background:linear-gradient(90deg, rgba(210,153,34,.12), var(--dwt-soft,#f6f8fa) 28%);
      }
      #${PANEL_ID} .qi.dragging { opacity:.45; }
      #${PANEL_ID} .qi.drag-over { border-color:#2d72de; border-style:dashed; }
      #${PANEL_ID} .qi .idx {
        display:flex; align-items:center; justify-content:center; gap:2px;
        color:var(--dwt-muted,#8b949e); font-size:10px; user-select:none;
      }
      #${PANEL_ID} .qi .drag {
        cursor:grab; color:var(--dwt-muted,#8b949e); font-size:11px; line-height:1;
        padding:0 1px; border:none; background:transparent;
      }
      #${PANEL_ID} .qi .drag:disabled { cursor:not-allowed; opacity:.35; }
      #${PANEL_ID} .qi .bp-mark {
        font-size:9px; color:#9a6700; background:#fff8c5; border-radius:4px;
        padding:0 3px; margin-left:2px; white-space:nowrap;
      }
      #${PANEL_ID} .qi .qcell { display:flex; gap:4px; align-items:center; min-width:0; }
      #${PANEL_ID} .qi img.th { flex:0 0 26px; width:26px; height:26px; object-fit:cover; border-radius:5px; border:1px solid var(--dwt-border,#d0d7de); }
      #${PANEL_ID} .qi .att-chip {
        flex:0 0 auto; max-width:52px; padding:1px 4px; border-radius:5px; font-size:9px;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        border:1px solid var(--dwt-border,#d0d7de); background:var(--dwt-bg,#fff);
        color:var(--dwt-muted,#8b949e); cursor:default;
      }
      #${PANEL_ID} .qi .qprev {
        flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        color:inherit; font:inherit; cursor:default;
      }
      #${PANEL_ID} .qi .qprev.empty { color:var(--dwt-muted,#8b949e); }
      #${PANEL_ID} .tip-btn {
        flex:0 0 auto; width:18px; height:18px; padding:0; line-height:16px; text-align:center;
        border:1px solid var(--dwt-border,#d0d7de); background:var(--dwt-bg,#fff);
        color:var(--dwt-muted,#8b949e); border-radius:50%; cursor:pointer; font-size:10px;
      }
      #${PANEL_ID} .tip-btn:hover, #${PANEL_ID} .tip-btn.on { color:#2d72de; border-color:#2d72de; }
      #${PANEL_ID} .qi .ops { display:flex; gap:3px; justify-content:flex-end; }
      #${PANEL_ID} .qi button.mini {
        flex:0 0 auto; width:20px; padding:2px 0; text-align:center;
        border:1px solid var(--dwt-border,#d0d7de); background:var(--dwt-bg,#fff);
        color:var(--dwt-muted,#8b949e); border-radius:6px; cursor:pointer; font-size:11px; line-height:1.3;
      }
      #${PANEL_ID} .qi button.mini:hover { color:var(--dwt-fg,#1f2328); }
      #${PANEL_ID} .qpill {
        padding:1px 4px; border-radius:999px; font-size:10px; white-space:nowrap;
        text-align:center; display:inline-block; max-width:100%; overflow:hidden; text-overflow:ellipsis;
        background:#eaeef2; color:#57606a; justify-self:start;
      }
      #${PANEL_ID} .qpill.sending { background:#eaf1fc; color:#2d72de; }
      #${PANEL_ID} .qpill.waiting { background:#fff8c5; color:#9a6700; }
      #${PANEL_ID} .qpill.done   { background:#e6f4ea; color:#1a7f37; }
      #${PANEL_ID} .qpill.failed { background:#ffebe9; color:#cf222e; }
      #${PANEL_ID} .qpill.timeout { background:#fff1e5; color:#bc4c00; }
      #${PANEL_ID} .qpill.failed_constraint { background:#ffebe9; color:#cf222e; }
      #${PANEL_ID} .qpill.paused { background:#fff3c4; color:#b58105; }
      #${PANEL_ID} .qi .rprev {
        min-width:0; max-width:40px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        color:var(--dwt-muted,#8b949e); font-size:11px; cursor:default;
      }
      #${PANEL_ID} .qi .rprev.has {
        color:#2d72de; cursor:pointer; text-decoration:underline; text-underline-offset:2px;
      }
      #${PANEL_ID} .table-wrap {
        display:none; flex:1; min-height:0; flex-direction:column; overflow:hidden; margin-top:0;
      }
      #${PANEL_ID} .table-wrap.on { display:flex; }
      #${PANEL_ID} .table-wrap.off { display:none; }
      #${PANEL_ID} .json-wrap {
        display:none; margin-top:0; flex:1; min-height:0; flex-direction:column; overflow:hidden;
      }
      #${PANEL_ID} .json-wrap.on { display:flex; }
      #${PANEL_ID} .json-head {
        display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px; flex-shrink:0;
      }
      #${PANEL_ID} .json-head .json-title { font-size:11px; color:var(--dwt-muted,#8b949e); }
      #${PANEL_ID} .json-sync {
        font-size:10px; padding:1px 7px; border-radius:999px; white-space:nowrap;
        background:#eaeef2; color:#57606a;
      }
      #${PANEL_ID} .json-sync.dirty { background:#fff8c5; color:#9a6700; }
      #${PANEL_ID} .json-sync.ok { background:#e6f4ea; color:#1a7f37; }
      #${PANEL_ID} .json-sync.locked { background:#ffebe9; color:#cf222e; }
      #${PANEL_ID} .json-ta-wrap {
        position:relative; flex:1; min-height:0; display:flex; overflow:hidden;
      }
      #${PANEL_ID} .json-copy {
        position:absolute; top:6px; right:6px; z-index:2;
        padding:2px 8px; font-size:10px; line-height:1.4; border-radius:6px; cursor:pointer;
        border:1px solid var(--dwt-border,#d0d7de); background:var(--dwt-bg,#fff);
        color:var(--dwt-fg,#1f2328); box-shadow:0 1px 2px rgba(0,0,0,.06);
      }
      #${PANEL_ID} .json-copy:hover { background:var(--dwt-soft,#f6f8fa); }
      #${PANEL_ID} .json-copy.ok { background:#e6f4ea; border-color:#1a7f37; color:#1a7f37; }
      #${PANEL_ID} .json-wrap textarea {
        width:100%; box-sizing:border-box; flex:1; height:100%; min-height:0; resize:none;
        font-family:ui-monospace,Consolas,monospace;
        background:var(--dwt-soft,#f6f8fa); color:var(--dwt-fg,#1f2328);
        border:1px solid var(--dwt-border,#d0d7de); border-radius:8px; padding:8px; padding-top:28px; font-size:11px; outline:none;
        overflow-x:hidden; overflow-y:auto; scroll-behavior:smooth;
      }
      #${PANEL_ID} .json-actions { display:flex; gap:6px; margin-top:6px; align-items:center; flex-shrink:0; }
      /* soft scrollbars: thin / rounded / translucent; deepen on hover */
      #${PANEL_ID} .qlist,
      #${PANEL_ID} .json-wrap textarea {
        scrollbar-width: thin;
        scrollbar-color: rgba(127,127,127,.35) transparent;
      }
      #${PANEL_ID} .qlist::-webkit-scrollbar,
      #${PANEL_ID} .json-wrap textarea::-webkit-scrollbar {
        width:6px; height:6px;
      }
      #${PANEL_ID} .qlist::-webkit-scrollbar-track,
      #${PANEL_ID} .json-wrap textarea::-webkit-scrollbar-track {
        background:transparent;
      }
      #${PANEL_ID} .qlist::-webkit-scrollbar-thumb,
      #${PANEL_ID} .json-wrap textarea::-webkit-scrollbar-thumb {
        background:rgba(127,127,127,.28); border-radius:999px;
      }
      #${PANEL_ID} .qlist::-webkit-scrollbar-thumb:hover,
      #${PANEL_ID} .json-wrap textarea::-webkit-scrollbar-thumb:hover {
        background:rgba(127,127,127,.48);
      }
      #${PANEL_ID} .json-actions button {
        flex:1; padding:5px 0; border-radius:8px; cursor:pointer; font-size:11px;
        border:1px solid var(--dwt-border,#d0d7de); background:var(--dwt-bg,#fff); color:var(--dwt-fg,#1f2328);
      }
      #${PANEL_ID} .json-actions button.primary {
        background:#2d72de; border-color:#2d72de; color:#fff; font-weight:600;
      }
      #${PANEL_ID} .json-actions button.primary.dirty { box-shadow:0 0 0 1px #d29922 inset; }
      #${PANEL_ID} .json-actions button:disabled { opacity:.55; cursor:default; }
      #${PANEL_ID} .pfx-block { margin-bottom:8px; }
      #${PANEL_ID} .pfx-head {
        display:flex; align-items:center; gap:6px; color:var(--dwt-muted,#8b949e); font-size:12px;
      }
      #${PANEL_ID} .pfx-head label.pfx-toggle {
        display:inline-flex; align-items:center; gap:7px; cursor:pointer; user-select:none;
        color:var(--dwt-muted,#8b949e);
      }
      #${PANEL_ID} .pfx-head label.pfx-toggle:hover { color:var(--dwt-fg,#1f2328); }
      #${PANEL_ID} .pfx-head input[type="checkbox"] {
        position:absolute; opacity:0; width:1px; height:1px; margin:0; padding:0;
        overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;
      }
      #${PANEL_ID} .pfx-switch {
        position:relative; flex:0 0 auto; width:30px; height:17px; border-radius:999px;
        background:#c9d1d9; border:1px solid transparent;
        transition:background .15s ease, border-color .15s ease;
        box-sizing:border-box;
      }
      #${PANEL_ID} .pfx-switch::after {
        content:''; position:absolute; top:1px; left:1px;
        width:13px; height:13px; border-radius:50%;
        background:#fff; box-shadow:0 1px 2px rgba(31,35,40,.18);
        transition:transform .15s ease;
      }
      #${PANEL_ID} .pfx-head input:checked + .pfx-switch {
        background:#2d72de; border-color:#2d72de;
      }
      #${PANEL_ID} .pfx-head input:checked + .pfx-switch::after { transform:translateX(13px); }
      #${PANEL_ID} .pfx-head input:focus-visible + .pfx-switch {
        box-shadow:0 0 0 2px rgba(45,114,222,.28);
      }
      #${PANEL_ID} .pfx-head input:checked ~ .pfx-lbl { color:#2d72de; }
      #${PANEL_ID} .rowp {
        display:none; gap:6px; margin-top:6px; align-items:center; color:var(--dwt-muted,#8b949e);
      }
      #${PANEL_ID} .rowp.on { display:flex; }
      #${PANEL_ID} .rowp .pfx-prev {
        flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        background:var(--dwt-soft,#f6f8fa); border:1px solid var(--dwt-border,#d0d7de);
        border-radius:6px; padding:4px 8px; color:var(--dwt-fg,#1f2328); font-size:12px; cursor:pointer;
      }
      #${PANEL_ID} .rowp .pfx-prev.empty { color:var(--dwt-muted,#8b949e); }
      #${PANEL_ID} .bp-bar {
        display:none; margin-top:8px; padding:6px 8px; border-radius:8px;
        background:#fff8c5; border:1px solid #e6c35c; color:#7a5a00; font-size:11px;
        align-items:center; gap:8px; flex-wrap:wrap;
      }
      #${PANEL_ID} .bp-bar.show { display:flex; }
      #${PANEL_ID} .bp-bar .bp-label { flex:1; min-width:120px; }
      #${PANEL_ID} .bp-bar button {
        padding:3px 10px; border-radius:6px; cursor:pointer; font-size:11px;
        border:1px solid #d0b04a; background:#fff; color:#7a5a00;
      }
      #${PANEL_ID} .bp-bar button.primary { background:#2d72de; border-color:#2d72de; color:#fff; }
      #${PANEL_ID} .btns { display:flex; gap:6px; margin-top:9px; }
      #${PANEL_ID} .btns button {
        flex:1; padding:6px 0; border-radius:8px; cursor:pointer; font-size:12px;
        border:1px solid var(--dwt-border,#d0d7de);
        background:var(--dwt-soft,#f6f8fa); color:var(--dwt-fg,#1f2328);
      }
      #${PANEL_ID} .btns button.add {
        border-style:dashed; border-color:#8b949e; background:transparent;
        color:var(--dwt-fg,#1f2328); font-weight:500;
      }
      #${PANEL_ID} .btns button.add:hover:not(:disabled) {
        color:#2d72de; border-color:#2d72de;
      }
      #${PANEL_ID} .btns button.outline {
        background:var(--dwt-soft,#f6f8fa); color:var(--dwt-fg,#1f2328);
        border:1px solid var(--dwt-border,#d0d7de); font-weight:inherit;
      }
      #${PANEL_ID} .btns button.outline:hover:not(:disabled) {
        color:#2d72de; border-color:#2d72de; background:var(--dwt-bg,#fff);
      }
      #${PANEL_ID} .btns button.primary { background:#2d72de; border-color:#2d72de; color:#fff; }
      #${PANEL_ID} .btns button.danger { color:#cf222e; border-color:#f0b0b0; }
      #${PANEL_ID} .btns button:disabled { opacity:.45; cursor:default; pointer-events:none; color:var(--dwt-muted,#8b949e); }
      #${PANEL_ID}-import .import-actions {
        display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;
      }
      #${PANEL_ID}-import .import-actions button {
        flex:1; min-width:72px; padding:5px 0; border-radius:8px; cursor:pointer; font-size:11px;
        border:1px solid var(--dwt-border,#d0d7de); background:var(--dwt-bg,#fff); color:var(--dwt-fg,#1f2328);
      }
      #${PANEL_ID}-import .import-actions button.primary { background:#2d72de; border-color:#2d72de; color:#fff; }
      #${PANEL_ID}-import .import-actions button.danger { color:#cf222e; border-color:#f0b0b0; }
      #${PANEL_ID}-import .import-hint {
        margin:0 0 6px; font-size:10px; color:var(--dwt-muted,#8b949e); line-height:1.4;
      }
      #${PANEL_ID}-tip, #${PANEL_ID}-import {
        position:fixed; z-index:999999; width:320px; max-width:90vw;
        background:var(--dwt-bg,#fff); color:var(--dwt-fg,#1f2328);
        border:1px solid var(--dwt-border,#d0d7de); border-radius:10px;
        box-shadow:0 10px 28px rgba(0,0,0,.2); padding:8px;
        font:12px/1.5 -apple-system, 'Segoe UI', Roboto, sans-serif;
      }
      #${PANEL_ID}-import { width:380px; }
      #${PANEL_ID}-tip .tip-hd, #${PANEL_ID}-import .tip-hd {
        display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; color:var(--dwt-muted,#8b949e); font-size:11px;
      }
      #${PANEL_ID}-tip .tip-hd button, #${PANEL_ID}-import .tip-hd button {
        border:none; background:transparent; cursor:pointer; color:inherit; font-size:14px;
      }
      #${PANEL_ID}-tip textarea, #${PANEL_ID}-import textarea {
        width:100%; box-sizing:border-box; height:120px; max-height:40vh; resize:vertical;
        background:var(--dwt-soft,#f6f8fa); color:var(--dwt-fg,#1f2328);
        border:1px solid var(--dwt-border,#d0d7de); border-radius:6px; padding:6px; font:inherit; outline:none;
      }
      #${PANEL_ID}-import textarea { height:160px; font-family:ui-monospace,Consolas,monospace; font-size:11px; }
      #${PANEL_ID}-tip .tip-body {
        max-height:40vh; overflow:auto; white-space:pre-wrap; word-break:break-word;
        background:var(--dwt-soft,#f6f8fa); border-radius:6px; padding:6px; border:1px solid var(--dwt-border,#d0d7de);
      }
      /* 结构化说明（blocks）：分节标题 + 表格，替代一整段「·」串文 */
      #${PANEL_ID}-tip .tip-body.tbl {
        white-space:normal; background:transparent; border:none; padding:0;
      }
      #${PANEL_ID}-tip .tip-sec {
        display:flex; align-items:center; gap:6px; margin:9px 0 4px;
        font-size:11px; font-weight:600; color:var(--dwt-accent,#2d72de);
      }
      /* 深色下 #2d72de 压在 #1f2430 上只有 3.4:1，就地提亮（与导航栏 #4d8bf5/#7fb0ff 同套），不动共享变量 */
      html.dwt-ui-dark #${PANEL_ID}-tip .tip-sec { color:#7fb0ff; }
      #${PANEL_ID}-tip .tip-sec:first-child { margin-top:0; }
      #${PANEL_ID}-tip .tip-sec::after {
        content:''; flex:1 1 auto; height:1px; background:var(--dwt-border,#d0d7de);
      }
      #${PANEL_ID}-tip table.tip-tbl {
        width:100%; border-collapse:collapse; font-size:11px; line-height:1.5;
        background:var(--dwt-soft,#f6f8fa);
        border:1px solid var(--dwt-border,#d0d7de); border-radius:6px;
      }
      #${PANEL_ID}-tip table.tip-tbl th {
        text-align:left; font-size:10px; font-weight:600; color:var(--dwt-muted,#8b949e);
        padding:3px 6px; border-bottom:1px solid var(--dwt-border,#d0d7de);
      }
      #${PANEL_ID}-tip table.tip-tbl td {
        padding:4px 6px; vertical-align:top;
        border-top:1px solid var(--dwt-border,#d0d7de);
        white-space:pre-line; word-break:break-word;
      }
      #${PANEL_ID}-tip table.tip-tbl tr:first-child td { border-top:none; }
      #${PANEL_ID}-tip table.tip-tbl td.k {
        width:1%; white-space:nowrap; font-weight:600; color:var(--dwt-fg,#1f2328);
      }
      #${PANEL_ID}-tip table.tip-tbl.mono td.k {
        font-family:ui-monospace,Consolas,monospace; font-size:10px; font-weight:500;
      }
      #${PANEL_ID}-att {
        position:fixed; z-index:999999; width:300px; max-width:92vw;
        background:var(--dwt-bg,#fff); color:var(--dwt-fg,#1f2328);
        border:1px solid var(--dwt-border,#d0d7de); border-radius:10px;
        box-shadow:0 10px 28px rgba(0,0,0,.2); padding:8px;
        font:12px/1.5 -apple-system, 'Segoe UI', Roboto, sans-serif;
      }
      #${PANEL_ID}-att .tip-hd {
        display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;
        color:var(--dwt-muted,#8b949e); font-size:11px;
      }
      #${PANEL_ID}-att .tip-hd button {
        border:none; background:transparent; cursor:pointer; color:inherit; font-size:14px;
      }
      #${PANEL_ID}-att .att-list > .att-hint {
        margin:0; padding:6px 4px; font-size:10px; color:var(--dwt-muted,#8b949e); list-style:none;
      }
      #${PANEL_ID}-att .att-list {
        list-style:none; margin:0; padding:0; max-height:220px; overflow:auto;
        display:flex; flex-direction:column; gap:4px;
      }
      #${PANEL_ID}-att .att-row {
        display:grid; grid-template-columns:16px 22px minmax(0,1fr) auto;
        gap:4px; align-items:center; padding:4px 6px;
        border:1px solid var(--dwt-border,#d0d7de); border-radius:8px;
        background:var(--dwt-soft,#f6f8fa);
      }
      #${PANEL_ID}-att .att-row.dragging { opacity:.45; }
      #${PANEL_ID}-att .att-row.drag-over { border-color:#2d72de; border-style:dashed; }
      #${PANEL_ID}-att .att-drag {
        cursor:grab; border:none; background:transparent; color:var(--dwt-muted,#8b949e);
        padding:0; font-size:11px; line-height:1;
      }
      #${PANEL_ID}-att .att-ico {
        width:22px; height:22px; border-radius:5px; display:flex; align-items:center; justify-content:center;
        font-size:12px; background:var(--dwt-bg,#fff); border:1px solid var(--dwt-border,#d0d7de);
      }
      #${PANEL_ID}-att .att-ico img {
        width:20px; height:20px; object-fit:cover; border-radius:4px;
      }
      #${PANEL_ID}-att .att-name {
        min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        font-size:11px;
      }
      #${PANEL_ID}-att .att-ops { display:flex; gap:3px; }
      #${PANEL_ID}-att .att-ops button {
        padding:1px 5px; font-size:10px; border-radius:5px; cursor:pointer;
        border:1px solid var(--dwt-border,#d0d7de); background:var(--dwt-bg,#fff);
        color:var(--dwt-muted,#8b949e);
      }
      #${PANEL_ID}-att .att-ops button:hover { color:var(--dwt-fg,#1f2328); }
      #${PANEL_ID}-att .att-foot {
        display:flex; gap:6px; margin-top:8px;
      }
      #${PANEL_ID}-att .att-foot button {
        flex:1; padding:5px 0; border-radius:8px; cursor:pointer; font-size:11px;
        border:1px solid var(--dwt-border,#d0d7de); background:var(--dwt-bg,#fff);
        color:var(--dwt-fg,#1f2328);
      }
      #${PANEL_ID}-att .att-foot button.primary {
        background:#2d72de; border-color:#2d72de; color:#fff; font-weight:600;
      }
      #${PANEL_ID}-att .att-foot button:disabled { opacity:.45; cursor:default; }
      #${PANEL_ID} .qi .att-badge {
        position:absolute; top:-4px; right:-4px; min-width:12px; height:12px; padding:0 3px;
        border-radius:999px; font-size:9px; line-height:12px; text-align:center;
        background:#2d72de; color:#fff;
      }
      #${PANEL_ID} .qi .ops { position:relative; }
      #${PANEL_ID} .qi button.mini.has-att { color:#2d72de; border-color:#2d72de; position:relative; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function canDrag() {
    const s = window.__dwtBatchStatus;
    if (!s || !s.state || s.state === 'IDLE' || s.state === 'DONE' || s.state === 'STOPPED') return true;
    return !isBusy(s.state);
  }

  function isBusy(state) {
    return state === 'RUNNING' || state === 'WAITING_REPLY'
      || state === 'PAUSED_BY_CAPTCHA' || state === 'PAUSED_BY_TIMEOUT' || state === 'WAITING_MANUAL'
      || state === 'PAUSED_BY_CONSTRAINT' || state === 'PAUSED_BY_ATTACH';
  }

  function isPausedResumable(state) {
    return state === 'PAUSED_BY_CAPTCHA' || state === 'PAUSED_BY_TIMEOUT'
      || state === 'PAUSED_BY_CONSTRAINT' || state === 'PAUSED_BY_ATTACH' || state === 'WAITING_MANUAL';
  }

  function isActivelyRunning(state) {
    return state === 'RUNNING' || state === 'WAITING_REPLY';
  }

  // 运行中 / 暂停可续 / 启动后等首包：禁止「应用到队列」（双保险: dataset + runner 态）
  function isJsonApplyBlocked() {
    if (awaitRunStatus) return true;
    const p = document.getElementById(PANEL_ID);
    if (p && p.dataset.locked === '1') return true;
    const state = window.__dwtBatchStatus && window.__dwtBatchStatus.state;
    return isActivelyRunning(state) || isBusy(state);
  }

  function hasValidBreakpoint() {
    return !!(breakpoint && typeof breakpoint.index === 'number'
      && breakpoint.index >= 0 && breakpoint.index < queue.length);
  }

  function setBtnDisabled(el, disabled) {
    if (!el) return;
    el.disabled = !!disabled;
  }

  // ---------- 多任务 (同一时期只允许一个任务在跑) ----------

  // 本页是否存在正在跑的批量运行(含本面板启动的 / popup 或另一处启动的)
  function runLocked() {
    const s = window.__dwtBatchStatus;
    return !!(awaitRunStatus || panelRunActive || (s && isBusy(s.state)));
  }

  function newTaskId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function taskById(id) {
    for (let i = 0; i < tasks.length; i++) if (tasks[i] && tasks[i].id === id) return tasks[i];
    return null;
  }
  function activeTask() { return taskById(activeTaskId); }
  function taskQueueKey(id) { return KEY_TASK_Q + id; }

  function summarizeStored(arr) {
    let done = 0, failed = 0;
    (Array.isArray(arr) ? arr : []).forEach((it) => {
      const st = String((it && it.status) || 'PENDING');
      if (st === 'DONE') done++;
      else if (st === 'FAILED' || st === 'SKIPPED') failed++;
    });
    return { done, failed, total: Array.isArray(arr) ? arr.length : 0 };
  }

  // 活动任务的摘要只认内存队列（唯一的实时真相源）。
  // 必要性: reinject 时 tasks 来自 __dwtBatchPanelState 快照, 若快照早于最后一次状态回写,
  // 摘要会比队列旧一步（实测: 跑完重挂 → 下拉显示「未完成 1/2」而队列两条都 DONE）。
  function refreshActiveTaskSummary() {
    if (!activeTaskId) return;
    const sum = summarizeStored(queue);
    tasks = tasks.map((t) => (t.id === activeTaskId
      ? (t.done === sum.done && t.failed === sum.failed && t.total === sum.total
        ? t
        : Object.assign({}, t, { done: sum.done, failed: sum.failed, total: sum.total }))
      : t));
  }

  function normalizeTask(t) {
    const o = (t && typeof t === 'object') ? t : {};
    const bp = (o.breakpoint && typeof o.breakpoint.index === 'number' && o.breakpoint.index >= 0)
      ? { index: o.breakpoint.index } : null;
    return {
      id: String(o.id || newTaskId()),
      name: String(o.name || '').replace(/\s+/g, ' ').trim().slice(0, TASK_NAME_MAX) || '未命名任务',
      createdAt: Number(o.createdAt) || Date.now(),
      updatedAt: Number(o.updatedAt) || Date.now(),
      breakpoint: bp,
      prefix: String(o.prefix == null ? '' : o.prefix),
      prefixOn: !!o.prefixOn,
      sessionId: String(o.sessionId || ''),
      sessionUrl: String(o.sessionUrl || ''),
      done: Number(o.done) || 0,
      failed: Number(o.failed) || 0,
      total: Number(o.total) || 0,
    };
  }

  function taskStateText(t) {
    if (!t) return '';
    // 只有「本面板发起的这次运行」才算该任务进行中（popup 起的临时队列不归任何任务）
    const running = (panelRunActive || awaitRunStatus) && t.id === activeTaskId;
    if (running) {
      const st = window.__dwtBatchStatus;
      const s = (st && st.total) ? st : null;
      return '进行中 ' + (s ? (Math.min(s.index + 1, s.total) + '/' + s.total) : (t.done + '/' + t.total));
    }
    if (!t.total) return '空任务';
    if (t.done + t.failed >= t.total) {
      return t.failed ? ('完成 ' + t.done + '/' + t.total + ' · ' + t.failed + ' 失败')
        : ('已完成 ' + t.done + '/' + t.total);
    }
    if (t.done || t.failed) return '未完成 ' + t.done + '/' + t.total;
    return '未开始 ' + t.total + ' 条';
  }

  function taskIndexJson() {
    return JSON.stringify({ v: 1, activeId: activeTaskId, tasks });
  }
  async function persistTaskIndex() {
    // 索引里的摘要一律从内存队列现算: 否则 persistBreakpoint 等「顺手写索引」的路径
    // 会把快照里的旧 done/total 写回去（跑完重挂后进度倒退的根因）
    refreshActiveTaskSummary();
    try { await storageSet({ [KEY_TASKS]: taskIndexJson() }); } catch (_) {}
  }

  async function readTaskQueue(id) {
    const k = taskQueueKey(id);
    try {
      const r = await storageGet([k]);
      const raw = r[k];
      if (typeof raw === 'string' && raw.trim()) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) return { found: true, items: p.map(normalizeItem) };
      }
      if (Array.isArray(raw)) return { found: true, items: raw.map(normalizeItem) };
      return { found: false, items: [] };
    } catch (_) { return { found: false, items: [] }; }
  }

  function nextTaskName() {
    let max = 0;
    tasks.forEach((t) => {
      const m = String((t && t.name) || '').match(/^任务\s*(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    });
    return '任务 ' + Math.max(max + 1, tasks.length + 1);
  }

  // 任务下拉 + 操作按钮态。运行中整体禁用: 同一时期只允许一个任务进行中,
  // 且 runner 按 index 回写状态, 面板显示的队列必须始终是「正在跑的那个」。
  function renderTaskSelect() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const sel = p.querySelector('#dwt-batch-task-sel');
    const newBtn = p.querySelector('#dwt-batch-task-new');
    const renBtn = p.querySelector('#dwt-batch-task-rename');
    const dupBtn = p.querySelector('#dwt-batch-task-dup');
    const delBtn = p.querySelector('#dwt-batch-task-del');
    if (!sel) return;
    const locked = runLocked();
    const confirmDel = !!(delBtn && pendingDeleteId === activeTaskId
      && pendingDeleteId && (Date.now() - pendingDeleteAt) < 4000);
    refreshActiveTaskSummary(); // 轮询路径也会走到这, 让摘要先于标签自愈
    const sig = locked + '|' + activeTaskId + '|' + (confirmDel ? 'confirm' : '')
      + '|' + tasks.map((t) => t.id + '~' + t.name + '~' + taskStateText(t)).join('§');
    if (sig !== taskSelSig) {
      taskSelSig = sig;
      sel.innerHTML = '';
      tasks.forEach((t) => {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = (t.name || t.id) + ' · ' + taskStateText(t);
        sel.appendChild(o);
      });
      if (taskById(activeTaskId)) sel.value = activeTaskId;
      else if (tasks[0]) sel.value = tasks[0].id;
    }
    sel.disabled = locked || tasks.length === 0;
    sel.title = locked
      ? '任务运行中: 先停止才能切换任务'
      : '切换任务（每个任务有独立队列/前置词/会话/进度）';
    setBtnDisabled(newBtn, locked);
    setBtnDisabled(renBtn, locked);
    setBtnDisabled(dupBtn, locked);
    setBtnDisabled(delBtn, locked || tasks.length <= 1);
    if (newBtn) newBtn.title = locked ? '运行中不能新建任务' : '新建一个空任务';
    if (renBtn) renBtn.title = locked ? '运行中不能重命名' : '重命名当前任务';
    if (dupBtn) dupBtn.title = locked ? '运行中不能复制' : '复制当前任务（队列/前置词/会话一起复制）';
    if (delBtn) {
      delBtn.title = tasks.length <= 1 ? '至少保留一个任务'
        : (locked ? '运行中不能删除任务' : '删除当前任务（点两次确认）');
      delBtn.textContent = confirmDel ? '确认删除' : '删除';
    }
  }

  // 把某个任务的队列与元信息装进面板（不落盘；落盘由调用方决定）
  async function loadTaskIntoPanel(id) {
    const t = taskById(id);
    if (!t) return false;
    const r = await readTaskQueue(id);
    activeTaskId = id;
    closeAttPanel();
    queue = r.items;
    hydrateQueueAtts();
    breakpoint = (t.breakpoint && typeof t.breakpoint.index === 'number') ? { index: t.breakpoint.index } : null;
    sessionId = t.sessionId || '';
    sessionUrl = t.sessionUrl || '';
    applyPrefixToUi(t.prefixOn, t.prefix || '');
    closeTip();
    renderQueue();
    updateJsonSyncUi();
    if (viewMode === 'json' && !jsonDirty) {
      const ta = document.getElementById('dwt-batch-jsonview');
      if (ta) ta.value = queueToJsonText();
    }
    updateBpBar();
    renderTaskSelect();
    syncBtnState();
    publishState();
    return true;
  }

  async function switchTask(id) {
    if (switching) return false;
    if (!id || id === activeTaskId) return false;
    if (!taskById(id)) return false;
    if (runLocked()) { setStatus('任务运行中, 先停止再切换', true); renderTaskSelect(); return false; }
    if (viewMode === 'json' && jsonDirty) {
      setStatus('JSON 视图有未应用的修改: 先「应用到队列」或「从队列刷新」再切换', true);
      return false;
    }
    switching = true;
    try {
      readQueueEditors();
      await persist();          // 先把当前任务整体落盘(队列/断点/前置词/会话/摘要)
      await persistBreakpoint();
      await loadTaskIntoPanel(id);
      await persist();          // legacy 键改指新活动任务 + 索引 activeId
      const t = taskById(id);
      setStatus('已切到「' + ((t && t.name) || id) + '」· ' + queue.length + ' 条');
      return true;
    } finally { switching = false; }
  }

  // opts.copyFrom = true → 复制当前任务(队列含附件 + 前置词 + 会话)
  async function createTask(opts) {
    const o = opts || {};
    if (switching) return false;
    if (runLocked()) { setStatus('任务运行中, 先停止再新建', true); renderTaskSelect(); return false; }
    if (viewMode === 'json' && jsonDirty && !o.copyFrom) {
      setStatus('JSON 视图有未应用的修改: 先应用或刷新再新建任务', true);
      return false;
    }
    switching = true;
    try {
      readQueueEditors();
      await persist();
      const src = o.copyFrom ? activeTask() : null;
      const t = normalizeTask({
        id: newTaskId(),
        name: o.name || (o.copyFrom
          ? (((src && src.name) || '任务') + ' 副本').slice(0, TASK_NAME_MAX)
          : nextTaskName()),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        breakpoint: null,
        prefix: o.copyFrom ? readPrefixText() : '',
        prefixOn: o.copyFrom ? isPrefixEnabled() : false,
        sessionId: o.copyFrom ? sessionId : '',
        sessionUrl: o.copyFrom ? sessionUrl : '',
      });
      if (o.copyFrom) {
        // 副本 = 可再跑的模板: 复制题目/附件/前置词/会话, 但清空上次运行的 status/reply
        const items = buildStoredQueue(false).map((it) => {
          const c = Object.assign({}, it, { status: 'PENDING', reply: '', result: '', reason: '' });
          return c;
        });
        t.done = 0; t.failed = 0; t.total = items.length;
        try { await storageSet({ [taskQueueKey(t.id)]: JSON.stringify(items) }); } catch (_) {}
      }
      tasks = tasks.concat([t]);
      await loadTaskIntoPanel(t.id);
      await persist();
      setStatus(o.copyFrom
        ? ('已复制为「' + t.name + '」· ' + queue.length + ' 条 · 运行状态已重置')
        : ('已新建「' + t.name + '」'));
      return true;
    } finally { switching = false; }
  }

  function renameActiveTask(name, opts) {
    const o = opts || {};
    const t = activeTask();
    if (!t) return false;
    if (!o.quiet && runLocked()) { setStatus('任务运行中不能重命名', true); renderTaskSelect(); return false; }
    const n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, TASK_NAME_MAX);
    if (!n || n === t.name) return false;
    t.name = n;
    t.updatedAt = Date.now();
    persistTaskIndex();
    renderTaskSelect();
    if (!o.quiet) setStatus('已重命名为「' + n + '」');
    return true;
  }

  async function deleteActiveTask() {
    if (switching) return false;
    if (runLocked()) { setStatus('任务运行中不能删除任务', true); renderTaskSelect(); return false; }
    const t = activeTask();
    if (!t) return false;
    if (tasks.length <= 1) { setStatus('至少保留一个任务', true); return false; }
    if (pendingDeleteId !== t.id || (Date.now() - pendingDeleteAt) > 4000) {
      pendingDeleteId = t.id;
      pendingDeleteAt = Date.now();
      renderTaskSelect();
      setStatus('再点一次「确认删除」删除「' + t.name + '」（4 秒内有效）', true);
      setTimeout(() => {
        if (pendingDeleteId === t.id) { pendingDeleteId = ''; renderTaskSelect(); }
      }, 4200);
      return false;
    }
    pendingDeleteId = '';
    pendingDeleteAt = 0;
    switching = true;
    try {
      const gone = t.id;
      tasks = tasks.filter((x) => x.id !== gone);
      activeTaskId = tasks[0] ? tasks[0].id : '';
      try { await storageRemove([taskQueueKey(gone)]); } catch (_) {}
      await loadTaskIntoPanel(activeTaskId);
      await persist();
      setStatus('已删除任务「' + t.name + '」· 现 ' + tasks.length + ' 个');
      return true;
    } finally { switching = false; }
  }

  // ---------- tip 浮层 ----------

  function closeAttPanel() {
    if (attDocHandler) {
      try { document.removeEventListener('mousedown', attDocHandler, true); } catch (_) {}
      attDocHandler = null;
    }
    const el = document.getElementById(PANEL_ID + '-att');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (tipEl && tipEl.id === PANEL_ID + '-att') tipEl = null;
    attPanelIdx = -1;
    attDragFrom = -1;
  }

  function closeTip() {
    if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
    tipEl = null;
    const imp = document.getElementById(PANEL_ID + '-import');
    if (imp && imp.parentNode) imp.parentNode.removeChild(imp);
    closeAttPanel();
    document.querySelectorAll('#' + PANEL_ID + ' .tip-btn.on').forEach((b) => b.classList.remove('on'));
  }

  // 结构化说明：分节 + 表格。opts.blocks = [{ title, cols?, mono?, rows: [[k, v], …] }]
  // 单元格一律走 textContent（我们自己的文案也不拼 HTML 串），\n 交给 CSS 的 pre-line 断行。
  function tipTable(sec) {
    const tbl = document.createElement('table');
    tbl.className = 'tip-tbl' + (sec.mono ? ' mono' : '');
    if (sec.cols && sec.cols.length) {
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      sec.cols.forEach((c) => {
        const th = document.createElement('th');
        th.textContent = String(c);
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      tbl.appendChild(thead);
    }
    const tbody = document.createElement('tbody');
    (sec.rows || []).forEach((row) => {
      const cells = Array.isArray(row) ? row : [row];
      const tr = document.createElement('tr');
      cells.forEach((cell, ci) => {
        const td = document.createElement('td');
        if (ci === 0 && cells.length > 1) td.className = 'k';
        td.textContent = cell == null ? '' : String(cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  function renderTipBlocks(body, blocks) {
    body.classList.add('tbl');
    (blocks || []).forEach((sec) => {
      const h = document.createElement('div');
      h.className = 'tip-sec';
      h.textContent = sec.title || '';
      body.appendChild(h);
      body.appendChild(tipTable(sec));
    });
  }

  function openTip(anchor, opts) {
    closeTip();
    const editable = !!opts.editable;
    const el = document.createElement('div');
    el.id = PANEL_ID + '-tip';
    el.innerHTML = '<div class="tip-hd"><span></span><button type="button" aria-label="关闭">×</button></div>';
    el.querySelector('.tip-hd span').textContent = opts.title || '详情';
    el.querySelector('.tip-hd button').addEventListener('click', closeTip);
    if (editable) {
      const ta = document.createElement('textarea');
      ta.value = opts.text || '';
      ta.setAttribute('aria-label', opts.title || '编辑');
      ta.addEventListener('input', () => { if (opts.onChange) opts.onChange(ta.value); });
      ta.addEventListener('blur', () => { if (opts.onBlur) opts.onBlur(ta.value); });
      el.appendChild(ta);
      setTimeout(() => ta.focus(), 0);
    } else {
      const body = document.createElement('div');
      body.className = 'tip-body';
      if (opts.blocks && opts.blocks.length) renderTipBlocks(body, opts.blocks);
      else body.textContent = opts.text || '';
      el.appendChild(body);
    }
    if (opts.width) {
      const w = Math.min(Math.max(240, opts.width), Math.max(240, window.innerWidth - 16));
      el.style.width = w + 'px';
    }
    document.body.appendChild(el);
    tipEl = el;
    if (anchor) {
      anchor.classList.add('on');
      const r = anchor.getBoundingClientRect();
      // 夹取按实测宽度算：说明 tip 比默认 320 宽，用固定 340 会被推出右边界
      const w = el.offsetWidth || 320;
      let top = r.bottom + 6;
      let left = Math.min(r.left, window.innerWidth - w - 8);
      if (top + 180 > window.innerHeight) top = Math.max(8, r.top - 180);
      if (left < 8) left = 8;
      el.style.top = top + 'px';
      el.style.left = left + 'px';
    }
    const onDoc = (e) => {
      if (tipEl && !tipEl.contains(e.target) && e.target !== anchor) {
        document.removeEventListener('mousedown', onDoc, true);
        closeTip();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onDoc, true), 0);
  }

  // ---------- 队列编辑 ----------

  function readQueueEditors() {
    // JSON 视图: 不从表格行读; 表格视图不再有 row input (用 tip 编辑同步)
    syncPrefixPreview();
  }

  function fileBasename(name) {
    const s = String(name == null ? '' : name);
    if (!s) return 'file';
    const parts = s.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || s;
  }
  function attPreviewSrc(img) {
    if (!img) return '';
    return img.data || img.objectUrl || '';
  }
  function isImageAtt(img) {
    if (!img) return false;
    const mime = String(img.mime || img.type || '');
    if (mime.indexOf('image/') === 0) return true;
    const src = String(img.data || '');
    if (src.indexOf('data:image/') === 0) return true;
    const name = String(img.fileName || img.name || '').toLowerCase();
    return /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(name);
  }
  function attIconKind(img) {
    if (!img) return 'file';
    const name = String(img.fileName || img.name || '').toLowerCase();
    const mime = String(img.mime || img.type || '').toLowerCase();
    if (isImageAtt(img)) return 'img';
    if (mime.indexOf('audio/') === 0 || mime.indexOf('video/') === 0
      || /\.(mp3|wav|m4a|wma|aac|ogg|amr|flac|aiff|ac3|mp4|webm|mov|avi|mkv)$/.test(name)) {
      return 'av';
    }
    if (mime === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
    if (/\.(docx?|xlsx?|pptx?|txt|csv|md|mobi|epub|rtf)$/.test(name)) return 'doc';
    return 'file';
  }
  function attIconGlyph(kind) {
    if (kind === 'img') return '🖼';
    if (kind === 'av') return '🎵';
    if (kind === 'pdf') return '📕';
    if (kind === 'doc') return '📄';
    return '📎';
  }
  function getAtts(it) {
    if (!it) return [];
    if (Array.isArray(it.imgs) && it.imgs.length) return it.imgs.filter(Boolean);
    if (Array.isArray(it.attachments) && it.attachments.length) return it.attachments.filter(Boolean);
    if (it.img) return [it.img];
    if (it.attachment) return [it.attachment];
    if (Array.isArray(it.imgs)) return it.imgs.filter(Boolean);
    return [];
  }
  function setAtts(it, list) {
    if (!it) return;
    const next = (list || []).filter(Boolean).slice(0, DOUBAO_ATTACH_MAX);
    it.imgs = next;
    it.attachments = next; // 与 JSON / storage 字段对齐，避免只写 imgs 时漏读
    it.img = next[0] || null; // 兼容旧单附件字段路径
    it.attachment = next[0] || null;
    it.type = inferredType(it);
  }
  function syncAttAlias(it) {
    if (!it) return;
    if (!Array.isArray(it.imgs) || !it.imgs.length) {
      if (Array.isArray(it.attachments) && it.attachments.length) it.imgs = it.attachments.slice();
      else it.imgs = it.img ? [it.img] : (it.attachment ? [it.attachment] : []);
    }
    it.attachments = it.imgs;
    it.img = it.imgs[0] || null;
    it.attachment = it.imgs[0] || null;
  }
  function hasAttachment(it) {
    return getAtts(it).some((img) => !!(img && (img.file || img.data || img.objectUrl || img.fileName || img.name)));
  }
  function inferredType(it) {
    const atts = getAtts(it);
    if (!atts.length) return 'text';
    return atts.every(isImageAtt) ? 'image' : 'file';
  }
  function revokeAttUrl(img) {
    if (img && img.objectUrl) {
      try { URL.revokeObjectURL(img.objectUrl); } catch (_) {}
    }
  }
  function revokeAllAtts(it) {
    getAtts(it).forEach(revokeAttUrl);
  }
  function dataUrlBytesApprox(data) {
    if (!data || typeof data !== 'string') return 0;
    // dataURL 约 4/3 膨胀；用字符串长度估原始字节，偏保守即可
    const comma = data.indexOf(',');
    const payload = comma >= 0 ? data.length - comma - 1 : data.length;
    return Math.floor(payload * 0.75);
  }
  function serializeAtt(img, opts) {
    if (!img) return null;
    const metaOnly = !!(opts && opts.metaOnly);
    // 持久化/导出: 不写 ephemeral objectUrl / File; path 浏览器通常拿不到
    const size = img.size || (img.file && img.file.size) || 0;
    const o = {
      fileName: fileBasename(img.fileName || img.name || 'file'),
      mime: img.mime || img.type || '',
      lastModified: img.lastModified || 0,
      filePath: img.filePath || null,
      size: size || 0,
    };
    const data = metaOnly ? null : (img.data || img.dataUrl || null);
    const dataBytes = data ? dataUrlBytesApprox(data) : 0;
    const tooBig = (size > ATTACH_DATAURL_MAX) || (dataBytes > ATTACH_DATAURL_MAX);
    if (data && !tooBig) {
      o.data = data;
      o.dataUrl = data;
      o.needsReselect = false;
    } else {
      // 无 dataUrl / 超限 / 强制仅元数据：角标与文件名仍落盘，发送前需重选
      o.needsReselect = true;
    }
    return o;
  }
  function dataUrlToFile(dataUrl, fileName, mime) {
    try {
      const src = String(dataUrl || '');
      if (src.indexOf('data:') !== 0) return null;
      const comma = src.indexOf(',');
      if (comma < 0) return null;
      const header = src.slice(5, comma);
      const payload = src.slice(comma + 1);
      const isB64 = /;base64/i.test(header);
      const mt = mime || (header.split(';')[0] || 'application/octet-stream');
      let bytes;
      if (isB64) {
        const bin = atob(payload);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
      return new File([bytes], fileBasename(fileName || 'file'), { type: mt });
    } catch (_) { return null; }
  }
  function hydrateAtt(att) {
    if (!att || typeof att !== 'object') return att;
    const data = att.data || att.dataUrl || null;
    if (data) {
      att.data = data;
      att.dataUrl = data;
      if (!att.file) {
        const f = dataUrlToFile(data, att.fileName || att.name, att.mime || att.type);
        if (f) att.file = f;
      }
    }
    if (!att.size && att.file) att.size = att.file.size;
    return att;
  }
  function hydrateQueueAtts() {
    queue.forEach((it) => {
      syncAttAlias(it);
      getAtts(it).forEach(hydrateAtt);
      syncAttAlias(it);
    });
  }
  function attachmentExport(img) {
    if (!img) return null;
    const att = {
      fileName: fileBasename(img.fileName || img.name || 'file'),
      mime: img.mime || img.type || '',
      lastModified: img.lastModified || 0,
      // 浏览器 input[type=file] 无真实磁盘 path; 有扩展能力时才写 filePath
      filePath: img.filePath || null,
      // 可序列化引用: 优先 dataUrl; 大文件会话内用 objectUrl(不入 JSON)
      note: 'browser: use fileName + dataUrl (or runtime objectUrl/File); filePath only when extension provides path',
    };
    const data = img.data || img.dataUrl || null;
    if (data) att.dataUrl = data;
    if (img.needsReselect && !data) att.needsReselect = true;
    if (img.size) att.size = img.size;
    return att;
  }

  function readPrefixText() {
    const pfx = document.getElementById('dwt-batch-prefix');
    return pfx ? String(pfx.value || '') : '';
  }

  function applyPrefixToUi(prefixOnVal, prefixText) {
    prefixOn = !!prefixOnVal;
    const pfx = document.getElementById('dwt-batch-prefix');
    if (pfx) pfx.value = String(prefixText == null ? '' : prefixText);
    syncPrefixUi();
  }

  function queueItemsToJsonArray() {
    return queue.map((it) => {
      const o = {
        // type 由是否附件推断; JSON 仍写出以便兼容旧导入
        type: inferredType(it),
        text: it.text || '',
        replyCheck: it.replyCheck || '',
        // 始终写出 status, 便于「从队列刷新」看到运行态
        status: it.status || 'PENDING',
      };
      const atts = getAtts(it).map(attachmentExport).filter(Boolean);
      if (atts.length) {
        o.attachments = atts;
        o.attachment = atts[0]; // 兼容旧导入/旧 runner
        if (atts[0].dataUrl) o.imageDataUrl = atts[0].dataUrl;
      }
      const reply = it.reply || it.result || '';
      if (reply) { o.reply = reply; o.result = reply; }
      return o;
    });
  }

  function queueToJsonText() {
    // 刷新/导出前折叠 runner 最新状态, 避免 JSON 视图漏 status/reply
    try { syncQueueFromRunner(window.__dwtBatchStatus); } catch (_) {}
    const sid = sessionId || '';
    return JSON.stringify({
      prefixOn: isPrefixEnabled(),
      prefix: readPrefixText(),
      sessionId: sid,
      sessionUrl: sessionUrl || (sid ? ('https://www.doubao.com/chat/' + sid) : ''),
      items: queueItemsToJsonArray(),
    }, null, 2);
  }

  function markJsonDirty(dirty) {
    jsonDirty = !!dirty;
    updateJsonSyncUi();
  }

  function updateJsonSyncUi() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const badge = p.querySelector('#dwt-batch-json-sync');
    const applyBtn = p.querySelector('#dwt-batch-json-apply');
    const ta = p.querySelector('#dwt-batch-jsonview');
    const locked = isJsonApplyBlocked();
    // 若 runner 已在跑但 dataset 未跟上, 立刻补锁, 避免按钮短暂可点
    if (locked && p.dataset.locked !== '1') p.dataset.locked = '1';
    if (locked) {
      jsonSyncLabel = '运行中·只读';
    } else if (jsonDirty) {
      jsonSyncLabel = '有未应用更改';
    } else {
      jsonSyncLabel = '已同步';
    }
    if (badge) {
      badge.textContent = jsonSyncLabel;
      badge.className = 'json-sync'
        + (locked ? ' locked' : (jsonDirty ? ' dirty' : ' ok'));
    }
    if (applyBtn) {
      applyBtn.disabled = locked;
      applyBtn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      applyBtn.title = locked ? '任务运行中不可应用, 请先停止或等完成' : '将 JSON 应用到队列';
      applyBtn.classList.toggle('dirty', !!jsonDirty && !locked);
      applyBtn.textContent = locked ? '运行中不可应用' : (jsonDirty ? '应用到队列 *' : '应用到队列');
    }
    if (ta) {
      ta.readOnly = locked;
      ta.title = locked ? '运行中只读' : '';
    }
  }

  function applyJsonText(raw, replace) {
    let arr;
    let prefixMeta = null; // 非 null = 对象根, 可同步前置词; 数组根保持当前 UI
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // 旧格式: 仅 items, 前置词保持当前 UI 状态
        arr = parsed;
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
        arr = parsed.items;
        prefixMeta = parsed;
      } else {
        throw new Error('根节点需为 {"prefixOn","prefix","sessionId","sessionUrl","items":[...]} 或旧版数组');
      }
    } catch (e) {
      setStatus('JSON 解析失败: ' + (e && e.message ? e.message : '格式错误'), true);
      return false;
    }
    const next = arr.map((x) => normalizeItem(x));
    queue = replace ? next : queue.concat(next);
    if (prefixMeta) {
      // 对象根: 有字段则写入; 缺省字段分别保留当前
      const nextOn = Object.prototype.hasOwnProperty.call(prefixMeta, 'prefixOn')
        ? !!prefixMeta.prefixOn
        : isPrefixEnabled();
      const nextPrefix = Object.prototype.hasOwnProperty.call(prefixMeta, 'prefix')
        ? String(prefixMeta.prefix == null ? '' : prefixMeta.prefix)
        : readPrefixText();
      applyPrefixToUi(nextOn, nextPrefix);
      if (Object.prototype.hasOwnProperty.call(prefixMeta, 'sessionId')
        || Object.prototype.hasOwnProperty.call(prefixMeta, 'sessionUrl')) {
        const sid = Object.prototype.hasOwnProperty.call(prefixMeta, 'sessionId')
          ? String(prefixMeta.sessionId == null ? '' : prefixMeta.sessionId).trim()
          : sessionId;
        let surl = Object.prototype.hasOwnProperty.call(prefixMeta, 'sessionUrl')
          ? String(prefixMeta.sessionUrl == null ? '' : prefixMeta.sessionUrl).trim()
          : sessionUrl;
        if (!surl && sid) surl = 'https://www.doubao.com/chat/' + sid;
        sessionId = sid;
        sessionUrl = surl;
        publishState();
      }
    }
    markJsonDirty(false);
    return true;
  }

  function setView(mode) {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    if (viewMode === 'json' && mode === 'table') {
      const ta = p.querySelector('#dwt-batch-jsonview');
      if (ta && ta.value.trim()) {
        if (!applyJsonText(ta.value, true)) return; // 解析失败则留在 JSON 视图
        persist(); // 含 prefixOn/prefix → storage
      }
    }
    if (viewMode === 'table' && mode === 'json') {
      readQueueEditors();
    }
    viewMode = mode;
    p.querySelectorAll('.view-tabs button').forEach((b) => {
      b.classList.toggle('on', b.dataset.view === mode);
    });
    const tw = p.querySelector('.table-wrap');
    const jw = p.querySelector('.json-wrap');
    if (tw) { tw.classList.toggle('on', mode === 'table'); tw.classList.toggle('off', mode !== 'table'); }
    if (jw) jw.classList.toggle('on', mode === 'json');
    if (mode === 'json') {
      const ta = p.querySelector('#dwt-batch-jsonview');
      if (ta) ta.value = queueToJsonText();
      markJsonDirty(false);
    } else {
      renderQueue();
    }
    updateJsonSyncUi();
    closeTip();
  }

  function rowDom(i) {
    const it = queue[i];
    const li = document.createElement('li');
    li.className = 'qi' + (breakpoint && breakpoint.index === i ? ' bp' : '');
    li.dataset.idx = String(i);
    li.setAttribute('role', 'listitem');
    li.draggable = canDrag();

    const idx = document.createElement('span');
    idx.className = 'idx';
    const drag = document.createElement('button');
    drag.type = 'button';
    drag.className = 'drag';
    drag.textContent = '⠿';
    drag.title = canDrag() ? '拖拽调整顺序 (越靠前越先执行)' : '运行中不可拖拽';
    drag.disabled = !canDrag();
    drag.setAttribute('aria-label', '拖拽第 ' + (i + 1) + ' 条');
    idx.appendChild(drag);
    const numSpan = document.createElement('span');
    numSpan.textContent = String(i + 1);
    idx.appendChild(numSpan);
    if (breakpoint && breakpoint.index === i) {
      const m = document.createElement('span');
      m.className = 'bp-mark';
      m.textContent = '断点';
      m.title = '上次停止于此, 可从这里继续';
      idx.appendChild(m);
    }
    li.appendChild(idx);

    const cell = document.createElement('div');
    cell.className = 'qcell';
    const atts = getAtts(it);
    if (atts.length) {
      const first = atts[0];
      const src = attPreviewSrc(first);
      if (src && isImageAtt(first)) {
        const th = document.createElement('img');
        th.className = 'th';
        th.src = src;
        th.alt = '附件预览';
        cell.appendChild(th);
      } else {
        const chip = document.createElement('span');
        chip.className = 'att-chip';
        const kind = attIconKind(first);
        const fn = fileBasename(first.fileName || first.name || '附件');
        chip.textContent = (atts.length > 1 ? atts.length + '·' : '') + attIconGlyph(kind);
        chip.title = atts.map((a) => fileBasename(a.fileName || a.name || 'file')).join('\n');
        cell.appendChild(chip);
      }
      if (atts.length > 1 && !(src && isImageAtt(first))) {
        /* badge on chip title already */
      } else if (atts.length > 1) {
        const chipN = document.createElement('span');
        chipN.className = 'att-chip';
        chipN.textContent = '+' + (atts.length - 1);
        chipN.title = atts.map((a) => fileBasename(a.fileName || a.name || 'file')).join('\n');
        cell.appendChild(chipN);
      }
    }
    const prev = document.createElement('span');
    prev.className = 'qprev' + (!(it.text || '').trim() ? ' empty' : '');
    prev.textContent = truncate(it.text, 36) || (hasAttachment(it) ? '附件配文 (可空)' : '问题 / 指令');
    prev.title = it.text || '';
    cell.appendChild(prev);
    const tipBtn = document.createElement('button');
    tipBtn.type = 'button';
    tipBtn.className = 'tip-btn';
    tipBtn.textContent = 'i';
    tipBtn.title = '查看/编辑全文';
    tipBtn.setAttribute('aria-label', '第 ' + (i + 1) + ' 条内容详情');
    tipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTip(tipBtn, {
        title: '第 ' + (i + 1) + ' 条内容',
        text: queue[i].text || '',
        editable: true,
        onChange: (v) => {
          queue[i].text = v;
          prev.textContent = truncate(v, 36) || (hasAttachment(queue[i]) ? '附件配文 (可空)' : '问题 / 指令');
          prev.classList.toggle('empty', !(v || '').trim());
          prev.title = v || '';
        },
        onBlur: () => persist(),
      });
    });
    cell.appendChild(tipBtn);
    li.appendChild(cell);

    const pill = document.createElement('span');
    pill.className = 'qpill';
    pill.dataset.pill = '1';
    const initStatus = it.status || 'PENDING';
    pill.className = 'qpill' + (initStatus !== 'PENDING' ? ' ' + String(initStatus).toLowerCase() : '');
    pill.textContent = ITEM_TEXT[initStatus] || initStatus;
    pill.setAttribute('role', 'status');
    li.appendChild(pill);

    const replyCell = document.createElement('span');
    const replyText = it.reply || it.result || '';
    replyCell.className = 'rprev' + (replyText ? ' has' : '');
    replyCell.dataset.reply = '1';
    // 窄列: 有回复只显示「查看」或极短摘要, 点击 tip 看全文
    if (!replyText) {
      replyCell.textContent = '—';
      replyCell.title = '尚无回复';
    } else if (replyText.length <= 6) {
      replyCell.textContent = replyText;
      replyCell.title = '点击查看回复';
    } else {
      replyCell.textContent = '查看';
      replyCell.title = '点击查看回复全文';
    }
    replyCell.addEventListener('click', (e) => {
      e.stopPropagation();
      const full = queue[i].reply || queue[i].result || '';
      if (!full) { setStatus('第 ' + (i + 1) + ' 条尚无回复记录'); return; }
      openTip(replyCell, { title: '第 ' + (i + 1) + ' 条回复', text: full, editable: false });
    });
    li.appendChild(replyCell);

    const ops = document.createElement('div');
    ops.className = 'ops';
    const attBtn = document.createElement('button');
    attBtn.type = 'button';
    attBtn.className = 'mini' + (atts.length ? ' has-att' : '');
    attBtn.textContent = '附';
    attBtn.title = atts.length
      ? ('管理附件 · ' + atts.length + '/' + DOUBAO_ATTACH_MAX)
      : ('可选附件 (最多 ' + DOUBAO_ATTACH_MAX + ' 个, 对齐豆包)');
    attBtn.setAttribute('aria-label', '第 ' + (i + 1) + ' 条附件管理');
    if (atts.length) {
      const badge = document.createElement('span');
      badge.className = 'att-badge';
      badge.textContent = String(atts.length);
      attBtn.appendChild(badge);
    }
    attBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAttPanel(i, attBtn);
    });
    ops.appendChild(attBtn);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mini';
    del.textContent = '删';
    del.title = '删除';
    del.setAttribute('aria-label', '删除第 ' + (i + 1) + ' 条');
    del.addEventListener('click', () => {
      revokeAllAtts(queue[i]);
      queue.splice(i, 1);
      if (breakpoint) {
        if (breakpoint.index === i) breakpoint = null;
        else if (breakpoint.index > i) breakpoint = { index: breakpoint.index - 1 };
        persistBreakpoint();
        updateBpBar();
      }
      renderQueue();
      persist();
    });
    ops.appendChild(del);
    li.appendChild(ops);

    // 拖拽排序 (仅空闲)
    li.addEventListener('dragstart', (e) => {
      if (!canDrag()) { e.preventDefault(); return; }
      dragFrom = i;
      li.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
    });
    li.addEventListener('dragend', () => {
      dragFrom = -1;
      li.classList.remove('dragging');
      document.querySelectorAll('#' + PANEL_ID + ' .qi.drag-over').forEach((n) => n.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', (e) => {
      if (!canDrag() || dragFrom < 0) return;
      e.preventDefault();
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (!canDrag() || dragFrom < 0 || dragFrom === i) return;
      const [moved] = queue.splice(dragFrom, 1);
      queue.splice(i, 0, moved);
      if (breakpoint) {
        const bp = breakpoint.index;
        if (bp === dragFrom) breakpoint = { index: i };
        else if (dragFrom < bp && i >= bp) breakpoint = { index: bp - 1 };
        else if (dragFrom > bp && i <= bp) breakpoint = { index: bp + 1 };
        persistBreakpoint();
        updateBpBar();
      }
      dragFrom = -1;
      renderQueue();
      persist();
    });

    return li;
  }

  function renderQueue() {
    if (renderingQueue) return;
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const list = p.querySelector('.qlist');
    if (!list) return;
    renderingQueue = true;
    // 弹层打开时整表重渲会拆锚点；重渲后按内存队列立刻重建弹层（不丢附件数据）
    const keepAtt = attPanelIdx;
    try {
      list.innerHTML = '';
      queue.forEach((_, i) => list.appendChild(rowDom(i)));
      syncBtnState();
      syncPrefixPreview();
      publishState();
    } finally {
      renderingQueue = false;
    }
    if (keepAtt >= 0 && queue[keepAtt]) {
      openAttPanel(keepAtt);
    }
  }

  function isPrefixEnabled() {
    const cb = document.getElementById('dwt-batch-pfx-on');
    if (cb) return !!cb.checked;
    return !!prefixOn;
  }

  function syncPrefixUi() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const cb = p.querySelector('#dwt-batch-pfx-on');
    const row = p.querySelector('#dwt-batch-pfx-row');
    if (cb) {
      cb.checked = !!prefixOn;
    }
    if (row) row.classList.toggle('on', !!prefixOn);
    syncPrefixPreview();
  }

  function syncPrefixPreview() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const el = p.querySelector('#dwt-batch-pfx-prev');
    const hidden = p.querySelector('#dwt-batch-prefix');
    if (!el || !hidden) return;
    const v = hidden.value || '';
    el.textContent = truncate(v, 48) || '点击编辑前置词…';
    el.classList.toggle('empty', !v.trim());
    el.title = v || '发送时拼在每条正文前';
  }

  function fileToAttMeta(file) {
    const base = fileBasename(file.name || 'file');
    const filePath = (typeof file.path === 'string' && file.path) ? file.path : null;
    const objectUrl = URL.createObjectURL(file);
    return {
      fileName: base,
      name: base,
      mime: file.type || '',
      type: file.type || '',
      lastModified: file.lastModified || 0,
      filePath,
      objectUrl,
      size: file.size || 0,
      data: null,
      dataUrl: null,
      needsReselect: (file.size || 0) > ATTACH_DATAURL_MAX,
      file, // 会话内提交用; 不入 storage/JSON
    };
  }

  function maybeReadDataUrl(meta, file, idx) {
    if (!file || file.size > ATTACH_DATAURL_MAX) {
      if (file && file.size > ATTACH_DATAURL_MAX) {
        meta.needsReselect = true;
        setStatus('大附件已挂载 (≤会话有效) · 刷新后角标保留 · 发送需重选');
        persist(); // 立刻落元数据，闪烁重挂也不丢列表项/角标
      }
      return;
    }
    const rd = new FileReader();
    rd.onload = () => {
      const it = queue[idx];
      if (!it) return;
      const still = getAtts(it).indexOf(meta) >= 0;
      if (!still) return;
      const data = String(rd.result || '');
      if (dataUrlBytesApprox(data) > ATTACH_DATAURL_MAX) {
        meta.needsReselect = true;
        meta.data = null;
        meta.dataUrl = null;
        setStatus('附件编码后超限 · 已存文件名 · 刷新后需重选');
        publishState();
        persist();
        if (attPanelIdx === idx) openAttPanel(idx);
        return;
      }
      meta.data = data;
      meta.dataUrl = data;
      meta.needsReselect = false;
      publishState();
      persist();
      // 弹层开着时刷标题计数/预览
      if (attPanelIdx === idx) openAttPanel(idx);
    };
    rd.onerror = () => {
      meta.needsReselect = true;
      persist(); // 读失败仍落文件名，刷新后角标不丢
    };
    rd.readAsDataURL(file);
  }

  function attachFiles(fileList) {
    if (pickIdx < 0 || !queue[pickIdx]) return;
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const idx = pickIdx;
    const it = queue[idx];
    syncAttAlias(it);
    let list = getAtts(it).slice();
    const replaceAt = pickReplaceAt;
    pickReplaceAt = -1;

    if (replaceAt >= 0 && replaceAt < list.length) {
      const file = files[0];
      if (file.size > ATTACH_FILE_MAX) {
        setStatus('附件过大 (>' + Math.round(ATTACH_FILE_MAX / 1024 / 1024) + 'MB)', true);
        return;
      }
      revokeAttUrl(list[replaceAt]);
      const meta = fileToAttMeta(file);
      list[replaceAt] = meta;
      setAtts(it, list);
      renderQueue();
      persist();
      maybeReadDataUrl(meta, file, idx);
      openAttPanel(idx);
      setStatus('已更换附件 · ' + meta.fileName);
      return;
    }

    let added = 0;
    let skippedSize = 0;
    let skippedCap = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (list.length >= DOUBAO_ATTACH_MAX) { skippedCap += files.length - i; break; }
      if (file.size > ATTACH_FILE_MAX) { skippedSize++; continue; }
      const meta = fileToAttMeta(file);
      list.push(meta);
      added++;
      maybeReadDataUrl(meta, file, idx);
    }
    setAtts(it, list);
    renderQueue();
    persist();
    openAttPanel(idx);
    const parts = [];
    if (added) parts.push('已添加 ' + added + ' 个');
    if (skippedCap) parts.push('已达上限 ' + DOUBAO_ATTACH_MAX + '，跳过 ' + skippedCap);
    if (skippedSize) parts.push(skippedSize + ' 个过大已跳过');
    if (parts.length) setStatus(parts.join(' · '), !!(skippedCap || skippedSize));
  }

  function attachFile(file) {
    attachFiles(file ? [file] : []);
  }

  function openFilePicker(queueIdx, replaceAt) {
    pickIdx = queueIdx;
    pickReplaceAt = typeof replaceAt === 'number' ? replaceAt : -1;
    const f = document.getElementById('dwt-batch-file');
    if (!f) return;
    f.value = '';
    // 替换单文件时不要 multiple, 避免一次误选多个
    if (pickReplaceAt >= 0) f.removeAttribute('multiple');
    else f.setAttribute('multiple', '');
    f.click();
  }

  function openAttPanel(queueIdx, anchor) {
    if (queueIdx < 0 || !queue[queueIdx]) return;
    closeTip();
    attPanelIdx = queueIdx;
    const it = queue[queueIdx];
    syncAttAlias(it);
    const el = document.createElement('div');
    el.id = PANEL_ID + '-att';
    el.innerHTML = '<div class="tip-hd"><span></span><button type="button" aria-label="关闭">×</button></div>';
    el.querySelector('.tip-hd span').textContent = '按照顺序发送豆包 '
      + getAtts(it).length + '/' + DOUBAO_ATTACH_MAX;
    el.querySelector('.tip-hd button').addEventListener('click', closeAttPanel);
    const list = document.createElement('ul');
    list.className = 'att-list';
    list.setAttribute('role', 'list');
    const atts = getAtts(it);
    if (!atts.length) {
      const empty = document.createElement('li');
      empty.className = 'att-hint';
      empty.textContent = '暂无附件，点下方「添加」';
      list.appendChild(empty);
    }
    atts.forEach((att, ai) => {
      const row = document.createElement('li');
      row.className = 'att-row';
      row.draggable = true;
      row.dataset.ai = String(ai);
      const drag = document.createElement('button');
      drag.type = 'button';
      drag.className = 'att-drag';
      drag.textContent = '⠿';
      drag.title = '拖拽排序';
      drag.setAttribute('aria-label', '拖拽附件 ' + (ai + 1));
      const ico = document.createElement('span');
      ico.className = 'att-ico';
      const kind = attIconKind(att);
      const src = attPreviewSrc(att);
      if (kind === 'img' && src) {
        const im = document.createElement('img');
        im.src = src;
        im.alt = '';
        ico.appendChild(im);
      } else {
        ico.textContent = attIconGlyph(kind);
      }
      const name = document.createElement('span');
      name.className = 'att-name';
      const base = fileBasename(att.fileName || att.name || 'file');
      const needPick = !!(att.needsReselect && !(att.data || att.dataUrl || att.file || att.objectUrl));
      name.textContent = needPick ? (base + ' · 需重选') : base;
      name.title = needPick
        ? (base + '（未持久化二进制或超限，请点「换」重选后再发送）')
        : base;
      const ops = document.createElement('div');
      ops.className = 'att-ops';
      const chg = document.createElement('button');
      chg.type = 'button';
      chg.textContent = '换';
      chg.title = '更换此附件';
      chg.addEventListener('click', (e) => {
        e.stopPropagation();
        openFilePicker(queueIdx, ai);
      });
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = '删';
      rm.title = '移除此附件';
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = getAtts(queue[queueIdx]).slice();
        if (!cur[ai]) return;
        revokeAttUrl(cur[ai]);
        cur.splice(ai, 1);
        setAtts(queue[queueIdx], cur);
        persist();
        renderQueue();
        openAttPanel(queueIdx, anchor);
      });
      ops.appendChild(chg);
      ops.appendChild(rm);
      row.appendChild(drag);
      row.appendChild(ico);
      row.appendChild(name);
      row.appendChild(ops);
      row.addEventListener('dragstart', (e) => {
        attDragFrom = ai;
        row.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', String(ai)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
      });
      row.addEventListener('dragend', () => {
        attDragFrom = -1;
        row.classList.remove('dragging');
        el.querySelectorAll('.att-row.drag-over').forEach((n) => n.classList.remove('drag-over'));
      });
      row.addEventListener('dragover', (e) => {
        if (attDragFrom < 0) return;
        e.preventDefault();
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (attDragFrom < 0 || attDragFrom === ai) return;
        const cur = getAtts(queue[queueIdx]).slice();
        const [moved] = cur.splice(attDragFrom, 1);
        cur.splice(ai, 0, moved);
        attDragFrom = -1;
        setAtts(queue[queueIdx], cur);
        persist();
        renderQueue();
        openAttPanel(queueIdx, anchor);
      });
      list.appendChild(row);
    });
    el.appendChild(list);
    const foot = document.createElement('div');
    foot.className = 'att-foot';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'primary';
    addBtn.textContent = '＋ 添加';
    addBtn.disabled = getAtts(it).length >= DOUBAO_ATTACH_MAX;
    addBtn.title = addBtn.disabled ? ('已达上限 ' + DOUBAO_ATTACH_MAX) : '添加附件（可多选）';
    addBtn.addEventListener('click', () => openFilePicker(queueIdx, -1));
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = '清空';
    clearBtn.disabled = !getAtts(it).length;
    clearBtn.addEventListener('click', () => {
      revokeAllAtts(queue[queueIdx]);
      setAtts(queue[queueIdx], []);
      persist();
      renderQueue();
      openAttPanel(queueIdx, anchor);
    });
    foot.appendChild(addBtn);
    foot.appendChild(clearBtn);
    el.appendChild(foot);
    document.body.appendChild(el);
    tipEl = el; // 复用 closeTip 清理路径
    const a = anchor || document.querySelector('#' + PANEL_ID + ' .qi[data-idx="' + queueIdx + '"] .mini.has-att')
      || document.querySelector('#' + PANEL_ID + ' .qi[data-idx="' + queueIdx + '"] button.mini');
    if (a && a.getBoundingClientRect) {
      const r = a.getBoundingClientRect();
      let top = r.bottom + 6;
      let left = r.left - 200;
      if (top + 280 > window.innerHeight) top = Math.max(8, r.top - 280);
      if (left < 8) left = 8;
      if (left + 300 > window.innerWidth) left = Math.max(8, window.innerWidth - 308);
      el.style.top = top + 'px';
      el.style.left = left + 'px';
    }
    attDocHandler = (e) => {
      const cur = document.getElementById(PANEL_ID + '-att');
      if (!cur) return;
      if (cur.contains(e.target)) return;
      if (a && (e.target === a || (a.contains && a.contains(e.target)))) return;
      // 选文件对话框触发的 focus 变化不关
      if (e.target && e.target.id === 'dwt-batch-file') return;
      closeAttPanel();
    };
    setTimeout(() => {
      if (attDocHandler) document.addEventListener('mousedown', attDocHandler, true);
    }, 0);
  }

  function buildStoredQueue(metaOnly) {
    return queue.map((it) => {
      syncAttAlias(it);
      const imgs = getAtts(it).map((a) => serializeAtt(a, metaOnly ? { metaOnly: true } : null)).filter(Boolean);
      return {
        type: inferredType(it),
        text: it.text || '',
        replyCheck: it.replyCheck || '',
        status: it.status || 'PENDING',
        reply: it.reply || '',
        result: it.result || it.reply || '',
        reason: it.reason || '',
        imgs,
        img: imgs[0] || null, // 兼容旧存储
        attachments: imgs, // 与 JSON 导出字段对齐
        attachment: imgs[0] || null,
      };
    });
  }

  async function persist() {
    refreshActiveTaskSummary(); // 先自愈摘要, 落窗快照/reinject 接续才不落后
    publishState(); // 内存态先落窗，闪烁 reinject 可立刻接上
    try {
      const texts = queue.map((it) => (it.text || '').trim()).filter(Boolean);
      const pfx = document.getElementById('dwt-batch-prefix');
      prefixOn = isPrefixEnabled();
      const prefixText = pfx ? pfx.value : '';
      if (!activeTaskId && tasks[0]) activeTaskId = tasks[0].id;
      const full = buildStoredQueue(false);
      // 活动任务的元信息 + 进度摘要写进索引(索引要小: 队列各自存独立键)
      const sum = summarizeStored(full);
      const bpJson = (breakpoint && typeof breakpoint.index === 'number') ? { index: breakpoint.index } : null;
      tasks = tasks.map((t) => (t.id === activeTaskId ? Object.assign({}, t, {
        breakpoint: bpJson,
        prefix: prefixText,
        prefixOn: !!prefixOn,
        sessionId: sessionId || '',
        sessionUrl: sessionUrl || '',
        done: sum.done,
        failed: sum.failed,
        total: sum.total,
        updatedAt: Date.now(),
      }) : t));
      const base = {
        [KEY_LINES]: texts.join('\n'),
        [KEY_PREFIX]: prefixText,
        [KEY_PREFIX_ON]: !!prefixOn,
        [KEY_SESSION_ID]: sessionId || '',
        [KEY_SESSION_URL]: sessionUrl || '',
        [KEY_TASKS]: taskIndexJson(),
      };
      const withQueue = (qjson) => Object.assign({}, base, {
        [KEY_QUEUE]: qjson,                                    // 活动任务镜像(兼容/技能约束)
        [taskQueueKey(activeTaskId)]: qjson,                    // 活动任务自己的键
      });
      try {
        await storageSet(withQueue(JSON.stringify(full)));
      } catch (_) {
        // 配额/序列化失败：去掉 dataUrl，仍持久化文件名条数 → 刷新后角标在
        const slim = buildStoredQueue(true);
        const slimSum = summarizeStored(slim);
        tasks = tasks.map((t) => (t.id === activeTaskId
          ? Object.assign({}, t, { done: slimSum.done, failed: slimSum.failed, total: slimSum.total })
          : t));
        try {
          await storageSet(Object.assign({}, withQueue(JSON.stringify(slim)), { [KEY_TASKS]: taskIndexJson() }));
          setStatus('存储配额不足 · 已保留附件文件名 · 刷新后需重选文件');
        } catch (_) { /* 内存态仍在 __dwtBatchPanelState */ }
      }
    } catch (_) { /* 附件过大等存储失败不阻塞；内存态仍在 __dwtBatchPanelState */ }
    // 进度/条数写进 tasks 后立刻刷新下拉标签, 否则「空任务 → 未开始 N 条」要等下一次 persist 才更新
    renderTaskSelect();
  }

  async function persistBreakpoint() {
    try {
      const bpJson = (breakpoint && typeof breakpoint.index === 'number') ? { index: breakpoint.index } : null;
      const t = activeTask();
      if (t && JSON.stringify(t.breakpoint) !== JSON.stringify(bpJson)) {
        t.breakpoint = bpJson;
        t.updatedAt = Date.now();
      }
      if (bpJson) {
        await storageSet({ [KEY_BP]: JSON.stringify(bpJson) });
      } else {
        await storageRemove(KEY_BP);
      }
      await persistTaskIndex();
    } catch (_) {}
  }

  function normalizeReplyCheck(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'plain' || s === '纯文本' || s === 'text_only') return 'plain';
    if (s === 'image' || s === '含图片' || s === '含图' || s === 'has_image') return 'image';
    return '';
  }
  function normalizeAtt(raw, fallbackName) {
    if (!raw || typeof raw !== 'object') return null;
    const fileName = fileBasename(raw.fileName || raw.name || fallbackName || 'file');
    const mime = raw.mime || raw.type || '';
    const data = raw.data || raw.dataUrl || null;
    const objectUrl = raw.objectUrl || null;
    // 仅文件名也要保留（超限/配额失败刷新后角标仍在）
    if (!data && !objectUrl && !raw.file && !fileName) return null;
    const size = raw.size || 0;
    const needsReselect = (!!raw.needsReselect || (!data && !objectUrl && !raw.file)) && !data;
    const att = {
      fileName,
      name: fileName,
      mime,
      type: mime,
      lastModified: raw.lastModified || 0,
      filePath: raw.filePath || null,
      size: size || 0,
      data: data || null,
      dataUrl: data || null,
      objectUrl: objectUrl || null,
      needsReselect,
      file: raw.file || null,
    };
    return hydrateAtt(att);
  }
  function normalizeItem(x) {
    if (typeof x === 'string') {
      return { type: 'text', text: x, imgs: [], img: null, replyCheck: '', status: 'PENDING', reply: '', result: '' };
    }
    const reply = String(x.reply != null ? x.reply : (x.result != null ? x.result : '') || '');
    // 优先 attachments[]; 兼容单 attachment / imgs / img / imageDataUrl
    let imgs = [];
    if (Array.isArray(x.attachments) && x.attachments.length) {
      imgs = x.attachments.map((a) => normalizeAtt(a)).filter(Boolean);
    } else if (Array.isArray(x.imgs) && x.imgs.length) {
      imgs = x.imgs.map((a) => normalizeAtt(a)).filter(Boolean);
    } else {
      const one = normalizeAtt(x.attachment)
        || normalizeAtt(x.img)
        || (x.imageDataUrl ? normalizeAtt({ data: x.imageDataUrl, fileName: x.name || 'image.png', mime: 'image/png' }) : null);
      if (one) imgs = [one];
    }
    imgs = imgs.slice(0, DOUBAO_ATTACH_MAX).map((a) => {
      if (a) a.fileName = fileBasename(a.fileName || a.name || 'file');
      if (a) a.name = a.fileName;
      return a;
    });
    const item = {
      type: 'text',
      text: x.text || '',
      imgs,
      img: imgs[0] || null,
      replyCheck: normalizeReplyCheck(x.replyCheck != null ? x.replyCheck : x.reply_check),
      status: x.status || 'PENDING',
      reply,
      result: reply,
      reason: String(x.reason || ''),
    };
    item.type = inferredType(item);
    return item;
  }

  // 旧存储 → 队列数组（dwt_batch_queue_v2 → dwt_batch_json → dwt_batch_lines）
  function parseLegacyQueue(r) {
    const out = { items: [], sessionId: '', sessionUrl: '' };
    if (typeof r[KEY_QUEUE] === 'string' && r[KEY_QUEUE].trim()) {
      try {
        const arr = JSON.parse(r[KEY_QUEUE]);
        if (Array.isArray(arr)) { out.items = arr.map(normalizeItem); return out; }
      } catch (_) {}
    }
    const legacy = [];
    if (typeof r[KEY_JSON] === 'string' && r[KEY_JSON].trim()) {
      try {
        const parsed = JSON.parse(r[KEY_JSON]);
        const arr = Array.isArray(parsed) ? parsed
          : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
        if (arr) arr.forEach((x) => legacy.push(normalizeItem(x)));
        if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
          if (parsed.sessionId) out.sessionId = String(parsed.sessionId).trim();
          if (parsed.sessionUrl) out.sessionUrl = String(parsed.sessionUrl).trim();
        }
      } catch (_) {}
    }
    if (!legacy.length && typeof r[KEY_LINES] === 'string') {
      r[KEY_LINES].split(/\r?\n/).map((s) => s.trim()).filter(Boolean).forEach((t) => legacy.push(normalizeItem(t)));
    }
    out.items = legacy;
    return out;
  }

  // 载入任务索引 + 活动任务队列。首次升级(无索引)时用 legacy 队列建「任务 1」，不丢内容。
  async function loadTasks() {
    if (tasksLoaded) return;
    tasksLoaded = true;
    if (tasks.length && queue.length) { publishState(); return; } // 热重载: 内存态已接上
    try {
      const r = await storageGet([
        KEY_TASKS, KEY_QUEUE, KEY_LINES, KEY_JSON, KEY_PREFIX, KEY_PREFIX_ON, KEY_BP,
        KEY_SESSION_ID, KEY_SESSION_URL,
      ]);
      const pfx = document.getElementById('dwt-batch-prefix');
      const legacyPrefix = typeof r[KEY_PREFIX] === 'string' ? r[KEY_PREFIX] : '';
      let legacyPrefixOn;
      if (typeof r[KEY_PREFIX_ON] === 'boolean') legacyPrefixOn = r[KEY_PREFIX_ON];
      else if (typeof r[KEY_PREFIX_ON] === 'number') legacyPrefixOn = !!r[KEY_PREFIX_ON];
      else legacyPrefixOn = !!(legacyPrefix || '').trim();
      let legacySessionId = typeof r[KEY_SESSION_ID] === 'string' ? r[KEY_SESSION_ID].trim() : '';
      let legacySessionUrl = typeof r[KEY_SESSION_URL] === 'string' ? r[KEY_SESSION_URL].trim() : '';
      if (!legacySessionUrl && legacySessionId) legacySessionUrl = 'https://www.doubao.com/chat/' + legacySessionId;
      let legacyBp = null;
      if (typeof r[KEY_BP] === 'string' && r[KEY_BP].trim()) {
        try {
          const bp = JSON.parse(r[KEY_BP]);
          if (bp && typeof bp.index === 'number' && bp.index >= 0) legacyBp = { index: bp.index };
        } catch (_) {}
      }
      if (pfx && legacyPrefix) pfx.value = legacyPrefix;

      let idx = null;
      if (typeof r[KEY_TASKS] === 'string' && r[KEY_TASKS].trim()) {
        try {
          const p = JSON.parse(r[KEY_TASKS]);
          if (p && Array.isArray(p.tasks) && p.tasks.length) idx = p;
        } catch (_) {}
      }

      if (idx) {
        tasks = idx.tasks.map(normalizeTask);
        activeTaskId = (typeof idx.activeId === 'string' && taskById(idx.activeId)) ? idx.activeId : tasks[0].id;
        const t = activeTask();
        const own = await readTaskQueue(t.id);
        if (own.found) {
          queue = own.items;
          hydrateQueueAtts();
          breakpoint = t.breakpoint;
          applyPrefixToUi(t.prefixOn, t.prefix);
          sessionId = t.sessionId || '';
          sessionUrl = t.sessionUrl || '';
        } else {
          // 任务键缺失(被清理/异常) → legacy 队列兜底并重建该任务的键
          const legacy = parseLegacyQueue(r);
          queue = legacy.items;
          hydrateQueueAtts();
          breakpoint = legacyBp || t.breakpoint;
          applyPrefixToUi(legacyPrefixOn, legacyPrefix);
          sessionId = legacySessionId || t.sessionId || '';
          sessionUrl = legacySessionUrl || t.sessionUrl || '';
          publishState();
          syncPrefixUi();
          renderTaskSelect();
          await persist();
          return;
        }
      } else {
        // 首次升级: 现有队列整体成为「任务 1」
        const legacy = parseLegacyQueue(r);
        const t1 = normalizeTask({
          id: newTaskId(),
          name: '任务 1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          breakpoint: legacyBp,
          prefix: legacyPrefix,
          prefixOn: legacyPrefixOn,
          sessionId: legacySessionId || legacy.sessionId,
          sessionUrl: legacySessionUrl || legacy.sessionUrl,
        });
        queue = legacy.items;
        hydrateQueueAtts();
        tasks = [t1];
        activeTaskId = t1.id;
        breakpoint = legacyBp;
        applyPrefixToUi(legacyPrefixOn, legacyPrefix);
        sessionId = t1.sessionId;
        sessionUrl = t1.sessionUrl;
        publishState();
        syncPrefixUi();
        renderTaskSelect();
        await persist(); // 建索引 + 任务键(legacy 键保持同值)
        return;
      }
      publishState();
      syncPrefixUi();
      renderTaskSelect();
    } catch (_) {
      queue = [];
      publishState();
      renderTaskSelect();
    }
  }

  // ---------- 状态渲染 ----------

  // 底部可见状态行已删; 文案仅写入 aria / .btns title（悬停）
  function setStatus(text, warn) {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const msg = text || '';
    const btns = p.querySelector('.btns');
    if (btns) btns.title = msg;
    if (msg) p.setAttribute('aria-label', '批量问答 · ' + msg);
    else p.setAttribute('aria-label', '批量问答面板');
    void warn;
  }

  function updateBpBar() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const bar = p.querySelector('.bp-bar');
    if (!bar) return;
    const valid = hasValidBreakpoint();
    bar.classList.toggle('show', !!valid);
    const lab = bar.querySelector('.bp-label');
    if (lab && valid) lab.textContent = '断点: 第 ' + (breakpoint.index + 1) + ' / ' + queue.length + ' 条';
  }

  // 按钮态矩阵 (由 .btns disabled 表达):
  // 空闲: 添加/从头开始/导入 ✓; 导出 = 有队列; 停止 ✗; 继续 = 仅有断点
  // 运行中: 仅停止 ✓; 导出有队列仍可(只读快照); 其余 ✗
  // 暂停可续: 停止+继续 ✓; 导出有队列 ✓; 添加/开始/导入 ✗
  // 停止后有断点: 同空闲 + 继续 ✓
  function syncBtnState() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const s = window.__dwtBatchStatus;
    const state = s && s.state;
    const add = p.querySelector('#dwt-batch-add');
    const go = p.querySelector('#dwt-batch-go');
    const stopBtn = p.querySelector('#dwt-batch-stop');
    const contBtn = p.querySelector('#dwt-batch-resume');
    const importBtn = p.querySelector('#dwt-batch-importjson');
    const exportBtn = p.querySelector('#dwt-batch-exportjson');
    const goBp = p.querySelector('#dwt-batch-go-bp');
    const bpClear = p.querySelector('#dwt-batch-bp-clear');
    const bp = hasValidBreakpoint();
    const hasQueue = queue.length > 0;
    const paused = isPausedResumable(state);
    let mode = 'idle';
    if (awaitRunStatus || isActivelyRunning(state)) mode = 'running';
    else if (paused) mode = 'paused';

    if (mode === 'running') {
      setBtnDisabled(add, true);
      setBtnDisabled(go, true);
      setBtnDisabled(stopBtn, false);
      setBtnDisabled(contBtn, true);
      setBtnDisabled(importBtn, true);
      setBtnDisabled(exportBtn, !hasQueue);
      setBtnDisabled(goBp, true);
      setBtnDisabled(bpClear, true);
      setConfigLocked(true);
      if (contBtn) contBtn.title = '运行中不可继续';
    } else if (mode === 'paused') {
      setBtnDisabled(add, true);
      setBtnDisabled(go, true);
      setBtnDisabled(stopBtn, false);
      setBtnDisabled(contBtn, false);
      setBtnDisabled(importBtn, true);
      setBtnDisabled(exportBtn, !hasQueue);
      setBtnDisabled(goBp, true);
      setBtnDisabled(bpClear, true);
      setConfigLocked(true);
      if (contBtn) contBtn.title = '放行并继续下一条';
    } else {
      setBtnDisabled(add, false);
      setBtnDisabled(go, false);
      setBtnDisabled(stopBtn, true);
      setBtnDisabled(contBtn, !bp);
      setBtnDisabled(importBtn, false);
      setBtnDisabled(exportBtn, !hasQueue);
      setBtnDisabled(goBp, !bp);
      setBtnDisabled(bpClear, !bp);
      if (!awaitRunStatus) setConfigLocked(false);
      if (contBtn) {
        contBtn.title = bp
          ? ('从断点第 ' + (breakpoint.index + 1) + ' 条继续')
          : '无断点';
      }
    }
    if (exportBtn) {
      exportBtn.title = hasQueue
        ? '导出 {prefixOn,prefix,sessionId,sessionUrl,items}（运行中亦可导出只读快照）'
        : '队列为空，无可导出条目';
    }
    renderTaskSelect();
    updateBpBar();
  }

  function refreshStatus() {
    const s = window.__dwtBatchStatus;
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    const bar = p.querySelector('.prog > i');
    const rows = p.querySelectorAll('.qi');
    if (!s) {
      panelRunActive = false;
      rows.forEach((row) => {
        const i = Number(row.dataset.idx);
        setPill(row, (queue[i] && queue[i].status) || 'PENDING', queue[i] && queue[i].reason);
        setReplyPreview(row, queue[i] && (queue[i].reply || queue[i].result));
      });
      if (bar) bar.style.width = '0%';
      syncBtnState();
      syncDragEnabled();
      return;
    }
    if (awaitRunStatus && isBusy(s.state)) awaitRunStatus = false;
    if (awaitRunStatus && (s.state === 'DONE' || s.state === 'STOPPED' || s.state === 'IDLE')) {
      awaitRunStatus = false; // 启动被拒/立刻结束 → 恢复可编辑
    }
    // 只认「本面板这次运行」的实时状态；先同步再摘旗，让终态也能落进队列
    const queueChanged = panelRunActive ? syncQueueFromRunner(s) : false;
    const states = (panelRunActive && s.items && s.items.length === s.total) ? s.items : null;
    if (panelRunActive && (s.state === 'DONE' || s.state === 'STOPPED' || s.state === 'IDLE')) {
      panelRunActive = false;
    }
    rows.forEach((row) => {
      const i = Number(row.dataset.idx);
      if (states && states[i]) {
        setPill(row, states[i].status || 'PENDING', states[i].reason);
        setReplyPreview(row, states[i].reply || states[i].result || (queue[i] && queue[i].reply));
      } else if (queue[i]) {
        setPill(row, queue[i].status || 'PENDING', queue[i].reason);
        setReplyPreview(row, queue[i].reply || queue[i].result);
      }
      row.classList.toggle('active', i === s.index && isBusy(s.state));
    });
    // JSON 视图: 运行中自动刷回复/状态 (仅已同步且非 dirty)
    if (viewMode === 'json' && !jsonDirty && queueChanged) {
      const ta = p.querySelector('#dwt-batch-jsonview');
      if (ta && document.activeElement !== ta) ta.value = queueToJsonText();
    }
    // 每条 status/reply 变化即落盘 (含 chrome.storage + localStorage 双写)
    if (queueChanged) persist();
    if (bar) bar.style.width = (s.total ? Math.round((Math.min(s.index, s.total) / s.total) * 100) : 0) + '%';
    const label = RUN_STATE_TEXT[s.state] || s.state;
    const warn = s.state === 'PAUSED_BY_CAPTCHA' || s.state === 'PAUSED_BY_TIMEOUT'
      || s.state === 'PAUSED_BY_CONSTRAINT' || s.state === 'PAUSED_BY_ATTACH' || s.state === 'STOPPED';
    const cur = Math.min(s.index + (s.state === 'DONE' || s.state === 'STOPPED' ? 0 : 1), s.total);
    setStatus(label + ' ' + cur + '/' + s.total, warn);
    syncBtnState();
    syncDragEnabled();
    const activeRow = p.querySelector('.qi.active');
    if (activeRow && isBusy(s.state)) activeRow.scrollIntoView({ block: 'nearest' });
    if (s.state === 'DONE' || s.state === 'STOPPED') {
      awaitRunStatus = false;
      stopSessionWatch();
      if (s.state === 'DONE') {
        breakpoint = null;
        persistBreakpoint();
        renderQueueBpOnly();
      }
      syncBtnState();
      if (!doneFreezeTimer) doneFreezeTimer = setTimeout(stopPolling, 1200);
    } else if (doneFreezeTimer) {
      clearTimeout(doneFreezeTimer); doneFreezeTimer = null;
    }
  }

  function renderQueueBpOnly() {
    const p = document.getElementById(PANEL_ID);
    if (!p || viewMode !== 'table') { updateBpBar(); return; }
    p.querySelectorAll('.qi').forEach((row) => {
      const i = Number(row.dataset.idx);
      const isBp = breakpoint && breakpoint.index === i;
      row.classList.toggle('bp', !!isBp);
      let mark = row.querySelector('.bp-mark');
      if (isBp && !mark) {
        mark = document.createElement('span');
        mark.className = 'bp-mark';
        mark.textContent = '断点';
        row.querySelector('.idx') && row.querySelector('.idx').appendChild(mark);
      } else if (!isBp && mark) {
        mark.remove();
      }
    });
    updateBpBar();
  }

  function syncDragEnabled() {
    const allow = canDrag();
    document.querySelectorAll('#' + PANEL_ID + ' .qi').forEach((row) => {
      row.draggable = allow;
      const d = row.querySelector('.drag');
      if (d) {
        d.disabled = !allow;
        d.title = allow ? '拖拽调整顺序 (越靠前越先执行)' : '运行中不可拖拽';
      }
    });
  }

  function setPill(row, status, reason) {
    const pill = row.querySelector('[data-pill]');
    if (!pill) return;
    pill.className = 'qpill' + (status && status !== 'PENDING' ? ' ' + status.toLowerCase() : '');
    pill.textContent = ITEM_TEXT[status] || status;
    // 失败原因（如「附件未能插入输入框」）挂在徽标 title 上，鼠标悬停即可看到
    if (reason) { pill.title = reason; } else { pill.removeAttribute('title'); }
  }

  function setReplyPreview(row, text) {
    const el = row.querySelector('[data-reply]');
    if (!el) return;
    const t = String(text || '');
    if (!t) {
      el.textContent = '—';
      el.title = '尚无回复';
    } else if (t.length <= 6) {
      el.textContent = t;
      el.title = '点击查看回复';
    } else {
      el.textContent = '查看';
      el.title = '点击查看回复全文';
    }
    el.classList.toggle('has', !!t);
  }

  function syncQueueFromRunner(s) {
    if (!s || !s.items || !s.items.length) return false;
    // 长度不一致 = 队列与这次运行不是同一批条目 → 按 index 对齐会贴错，直接放弃
    if (s.total !== queue.length) return false;
    let changed = false;
    s.items.forEach((st, i) => {
      if (!queue[i] || !st) return;
      if (st.status && queue[i].status !== st.status) {
        queue[i].status = st.status;
        changed = true;
      }
      const reply = st.reply != null ? st.reply : st.result;
      if (reply != null && reply !== '' && (queue[i].reply || '') !== reply) {
        queue[i].reply = String(reply);
        queue[i].result = String(reply);
        changed = true;
      }
      const reason = String(st.reason || '');
      if (reason && (queue[i].reason || '') !== reason) {
        queue[i].reason = reason;
        changed = true;
      }
    });
    return changed;
  }

  function setConfigLocked(locked) {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    p.dataset.locked = locked ? '1' : '0';
    updateJsonSyncUi();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(refreshStatus, 500);
    refreshStatus();
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (doneFreezeTimer) { clearTimeout(doneFreezeTimer); doneFreezeTimer = null; }
  }

  // ---------- 开关/动作 ----------

  function isPanelVisible(p) {
    const d = p && p.style && p.style.display;
    return d === 'flex' || d === 'block';
  }
  function open() {
    const p = document.getElementById(PANEL_ID);
    if (!p) return;
    p.style.display = 'flex';
    startPolling();
  }
  function close() {
    const p = document.getElementById(PANEL_ID);
    if (p) p.style.display = 'none';
    closeTip();
    // 运行中关面板仍要保持轮询: 状态要写回任务队列并落盘(否则任务进度会停在半路)
    if (!runLocked()) stopPolling();
  }
  function toggle() {
    const p = document.getElementById(PANEL_ID);
    if (isPanelVisible(p)) close(); else open();
  }

  function collectItems() {
    if (viewMode === 'json') {
      const ta = document.getElementById('dwt-batch-jsonview');
      if (ta && ta.value.trim()) applyJsonText(ta.value, true);
    } else {
      readQueueEditors();
    }
    return queue
      .map((it) => {
        syncAttAlias(it);
        const atts = getAtts(it).filter((img) => img && (img.file || img.data || img.dataUrl || img.objectUrl));
        const attachments = atts.slice(0, DOUBAO_ATTACH_MAX).map((img) => ({
          fileName: fileBasename(img.fileName || img.name || 'file'),
          mime: img.mime || img.type || '',
          lastModified: img.lastModified || 0,
          filePath: img.filePath || null,
          objectUrl: img.objectUrl || null,
          dataUrl: img.data || img.dataUrl || null,
          file: img.file || null,
        }));
        const first = attachments[0] || null;
        // 类型由是否附件推断; 单附件字段保留兼容
        return {
          type: inferredType(it),
          text: (it.text || '').trim(),
          imageDataUrl: (first && first.dataUrl) || '',
          attachments,
          attachment: first,
          _files: attachments.map((a) => a.file).filter(Boolean),
          _file: (first && first.file) || null,
          replyCheck: it.replyCheck || '',
        };
      })
      .filter((it) => {
        if (it.text) return true;
        if (it._files && it._files.length) return true;
        if (it._file) return true;
        if (it.imageDataUrl) return true;
        return (it.attachments || []).some((a) => a && (a.objectUrl || a.dataUrl));
      });
  }

  // ---------- 豆包会话关联 (同一 Glass tab 内开新对话 / 回跳续传) ----------

  function getSessionIdFromHref(href) {
    const m = String(href || location.href || '').match(/\/chat\/(\d+)/);
    return m ? m[1] : '';
  }

  function sessionUrlForId(id) {
    if (!id) return 'https://www.doubao.com/chat';
    return 'https://www.doubao.com/chat/' + id;
  }

  function setSession(id, url) {
    sessionId = id ? String(id) : '';
    sessionUrl = url ? String(url) : (sessionId ? sessionUrlForId(sessionId) : '');
    publishState();
    if (viewMode === 'json' && !jsonDirty) {
      const ta = document.getElementById('dwt-batch-jsonview');
      if (ta && document.activeElement !== ta) ta.value = queueToJsonText();
    }
  }

  function sleepMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function findNewChatControl() {
    const root = document.getElementById('flow_chat_sidebar') || document.body;
    // 优先侧栏 nav item（role=button），避免点到内部 truncate/contents 子节点导致无效
    const nodes = root.querySelectorAll('[role="button"], [class*="sidebar_nav_item"]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const t = String(el.innerText || '').trim();
      if (t.indexOf('新对话') !== 0) continue;
      // 跳过侧栏历史里标题恰为「新对话」的会话链接
      if (el.closest && el.closest('a[href*="/chat/"]')) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 40 || box.height < 20 || box.height > 80) continue;
      if (box.top > 360) continue;
      if (el.getAttribute && el.getAttribute('role') === 'button') return el;
      const parentBtn = el.closest && el.closest('[role="button"]');
      if (parentBtn) return parentBtn;
    }
    return null;
  }

  function pointerClick(el) {
    if (!el) return false;
    const box = el.getBoundingClientRect();
    const cx = box.left + Math.max(4, box.width / 2);
    const cy = box.top + Math.max(4, box.height / 2);
    const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      const down = type.indexOf('down') >= 0;
      try {
        el.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true,
          clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse',
          button: 0, buttons: down ? 1 : 0,
        }));
      } catch (_) {
        try {
          el.dispatchEvent(new MouseEvent(type, {
            bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0,
          }));
        } catch (__) {}
      }
    }
    try { el.click(); } catch (_) {}
    return true;
  }

  function hasUsablePm() {
    const pm = document.querySelector('.ProseMirror[contenteditable="true"]');
    return !!(pm && pm.getBoundingClientRect().width >= 40);
  }

  async function waitForSessionReady(opts) {
    opts = opts || {};
    const wantId = opts.wantId ? String(opts.wantId) : '';
    const avoidId = opts.avoidId ? String(opts.avoidId) : '';
    const preferNew = !!opts.preferNew;
    const timeoutMs = opts.timeoutMs || 12000;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const href = location.href || '';
      const path = location.pathname || '';
      const id = getSessionIdFromHref(href);
      const pmOk = hasUsablePm();
      if (wantId) {
        if (id === wantId && pmOk) return { ok: true, id, url: href };
      } else if (preferNew) {
        const onChat = path === '/chat' || path.indexOf('/chat/') === 0;
        if (onChat && pmOk) {
          if (path === '/chat' || !id) return { ok: true, id: '', url: href };
          if (avoidId && id === avoidId) { /* 仍在旧会话，继续等 */ }
          else return { ok: true, id, url: href };
        }
      } else if (pmOk) {
        return { ok: true, id, url: href };
      }
      await sleepMs(200);
    }
    return { ok: false, id: getSessionIdFromHref(location.href), url: location.href };
  }

  async function openNewDoubaoSession() {
    const avoidId = getSessionIdFromHref(location.href);
    const btn = findNewChatControl();
    if (btn) pointerClick(btn);
    else {
      try { location.assign('https://www.doubao.com/chat'); } catch (_) {}
    }
    const ready = await waitForSessionReady({ preferNew: true, avoidId, timeoutMs: 12000 });
    if (ready.ok) setSession(ready.id || '', ready.url || 'https://www.doubao.com/chat');
    else setSession('', 'https://www.doubao.com/chat');
    return ready;
  }

  async function navigateToDoubaoSession(id) {
    const want = String(id || '');
    if (!want) return { ok: false, id: '', url: location.href };
    if (getSessionIdFromHref(location.href) === want && hasUsablePm()) {
      return { ok: true, id: want, url: location.href };
    }
    const link = document.querySelector('a[href*="/chat/' + want + '"]');
    if (link) pointerClick(link);
    else {
      try { location.assign(sessionUrlForId(want)); } catch (_) {}
    }
    return waitForSessionReady({ wantId: want, timeoutMs: 15000 });
  }

  function stopSessionWatch() {
    if (sessionWatchTimer) {
      clearInterval(sessionWatchTimer);
      sessionWatchTimer = null;
    }
    sessionWatchAvoidId = '';
  }

  function startSessionWatch(opts) {
    opts = opts || {};
    stopSessionWatch();
    sessionWatchAvoidId = opts.avoidId ? String(opts.avoidId) : '';
    // 新对话初期常停在 /chat，首条发出后才出现 /chat/{id} — 轮询补写 JSON/storage
    sessionWatchTimer = setInterval(() => {
      const id = getSessionIdFromHref(location.href);
      if (!id) return;
      if (sessionWatchAvoidId && id === sessionWatchAvoidId) return;
      if (id === sessionId && sessionUrl && String(sessionUrl).indexOf(id) >= 0) return;
      sessionWatchAvoidId = '';
      setSession(id, location.href);
      persist();
    }, 600);
  }

  async function ensureSession(forceNew) {
    if (forceNew) {
      const avoidId = getSessionIdFromHref(location.href);
      setStatus('正在打开新对话…');
      await openNewDoubaoSession();
      startSessionWatch({ avoidId });
      return true;
    }
    if (sessionId) {
      setStatus('正在回到会话 …' + String(sessionId).slice(-6));
      const nav = await navigateToDoubaoSession(sessionId);
      if (nav.ok && nav.id === sessionId) {
        setSession(nav.id, nav.url);
        await persist();
        startSessionWatch();
        return true;
      }
      const avoidId = getSessionIdFromHref(location.href);
      setStatus('原会话不可用，正在新建…', true);
      await openNewDoubaoSession();
      await persist();
      startSessionWatch({ avoidId });
      return true;
    }
    const cur = getSessionIdFromHref(location.href);
    if (cur) {
      setSession(cur, location.href);
      await persist();
    }
    startSessionWatch();
    return true;
  }

  async function start(fromBreakpoint) {
    // 同一时期只允许一个批量任务进行中: 本面板没在跑, 但页面上已有运行
    // (popup 启动 / 另一个面板实例 / 暂停可续) → 拒绝启动第二个
    const cur = window.__dwtBatchStatus;
    if (cur && isBusy(cur.state) && !panelRunActive) {
      setStatus('已有批量任务在运行(' + (RUN_STATE_TEXT[cur.state] || cur.state) + '), 先停止再启动', true);
      syncBtnState();
      return;
    }
    const needReselect = queue.some((it) => getAtts(it).some((a) =>
      a && a.needsReselect && !(a.file || a.data || a.dataUrl || a.objectUrl)));
    if (needReselect) {
      setStatus('有附件需重选（点「附」→「换」）后再发送', true);
      return;
    }
    const items = collectItems();
    if (!items.length) { setStatus('请先添加问答条目 (文本或附件)', true); return; }
    // 附件条目在豆包上必然失败（脚本触发的附件插入被拒，实测 4 条路径全无效）→ 先提醒，
    // 免得整队跑完才发现「带图提问」被当纯文本发出去
    const attCount = queue.filter((it) => getAtts(it).length).length;
    if (attCount) {
      setStatus('注意: ' + attCount + ' 条含附件 — 豆包拒绝脚本插入附件, 这些条目会直接失败并标注原因', true);
      await sleepMs(1200);
    }
    let startIndex = 0;
    if (fromBreakpoint && breakpoint && breakpoint.index >= 0 && breakpoint.index < items.length) {
      startIndex = breakpoint.index;
    } else {
      breakpoint = null;
      persistBreakpoint();
    }
    // 从头开始 → 强制新会话; 断点续传 → 优先回跳 sessionId
    try {
      await ensureSession(!fromBreakpoint);
    } catch (e) {
      setStatus('会话准备失败: ' + (e && e.message ? e.message : e), true);
      return;
    }
    let minInterval = 3;
    let replyTimeout = 180;
    try {
      const r = await storageGet([KEY_MIN, KEY_TMO]);
      if (r[KEY_MIN] != null && isFinite(Number(r[KEY_MIN])) && Number(r[KEY_MIN]) >= 0) {
        minInterval = Number(r[KEY_MIN]);
      }
      if (r[KEY_TMO] != null && isFinite(Number(r[KEY_TMO])) && Number(r[KEY_TMO]) >= 0) {
        replyTimeout = Number(r[KEY_TMO]);
      }
    } catch (_) { /* 用默认 */ }
    const pfxEl = document.getElementById('dwt-batch-prefix');
    const payload = {
      items,
      opts: {
        minInterval,
        replyTimeout,
        prefix: (isPrefixEnabled() && pfxEl) ? pfxEl.value.trim() : '',
        startIndex,
        sessionId: sessionId || '',
        sessionUrl: sessionUrl || '',
      },
    };
    persist();
    updateBpBar();
    // 一启动即锁 JSON「应用到队列」与编辑区, 不等首个 poll
    awaitRunStatus = true;
    panelRunActive = true;
    setConfigLocked(true);
    if (window.__dwtBatchHandlers && typeof window.__dwtBatchHandlers.start === 'function') {
      window.__dwtBatchHandlers.start({ detail: payload });
    } else {
      window.dispatchEvent(new CustomEvent('dwt-start-batch', { detail: payload }));
    }
    const sessHint = sessionId
      ? (' · 会话 …' + String(sessionId).slice(-6))
      : (sessionUrl ? ' · 新对话待分配 id' : '');
    setStatus((startIndex ? '从断点继续 ' + (startIndex + 1) : '已启动 0') + '/' + items.length + sessHint);
    syncBtnState();
    startPolling();
  }

  function recordBreakpointFromStatus() {
    const s = window.__dwtBatchStatus;
    if (!s || typeof s.index !== 'number' || !s.total) return;
    let bp = s.index;
    const cur = s.items && s.items[s.index];
    // 当前条已完成则断点落在下一条
    if (cur && cur.status === 'DONE') bp = s.index + 1;
    if (bp >= s.total) {
      breakpoint = null;
    } else {
      breakpoint = { index: bp };
    }
    persistBreakpoint();
    renderQueueBpOnly();
  }

  function stop() {
    recordBreakpointFromStatus();
    awaitRunStatus = false;
    // 停止后不再采信 runner 实时状态: 队列里已同步过各条 status/reply, 由它们兜底渲染
    panelRunActive = false;
    if (window.__dwtBatchHandlers && typeof window.__dwtBatchHandlers.stop === 'function') {
      window.__dwtBatchHandlers.stop();
    } else {
      window.dispatchEvent(new CustomEvent('dwt-stop-batch'));
    }
    const bpText = breakpoint ? (' · 断点第 ' + (breakpoint.index + 1) + ' 条') : '';
    setStatus('已停止' + bpText, true);
    syncBtnState();
    syncDragEnabled();
  }

  function resume() {
    window.dispatchEvent(new CustomEvent('dwt-batch-resume'));
    setStatus('已放行, 继续下一条');
    syncBtnState();
  }


  // 「继续下一条」: 暂停可续 → 放行 runner; 空闲有断点 → 从断点 start
  function onContinueClick() {
    const s = window.__dwtBatchStatus;
    if (s && isPausedResumable(s.state)) {
      resume();
      return;
    }
    if (hasValidBreakpoint()) {
      start(true);
    }
  }

  function clearBreakpoint() {
    breakpoint = null;
    persistBreakpoint();
    renderQueueBpOnly();
    setStatus('已清除断点');
    syncBtnState();
  }

  function commitImportedJson(raw, replace) {
    if (!applyJsonText(raw, !!replace)) return false;
    if (viewMode === 'json') setView('json'); else renderQueue();
    persist();
    setStatus(replace
      ? ('JSON 已导入 (替换队列 · ' + queue.length + ' 条)')
      : ('JSON 已导入 (追加到队列 · 现 ' + queue.length + ' 条)'));
    return true;
  }

  function openImportJsonDialog(anchor) {
    const p = document.getElementById(PANEL_ID);
    if (p && p.dataset.locked === '1') {
      setStatus('运行中配置已锁定, 停止后再导入', true);
      return;
    }
    closeTip();
    const el = document.createElement('div');
    el.id = PANEL_ID + '-import';
    el.innerHTML = [
      '<div class="tip-hd"><span>导入 JSON</span><button type="button" aria-label="关闭">×</button></div>',
      '<p class="import-hint">粘贴 {"prefixOn","prefix","sessionId","sessionUrl","items":[...]}（推荐）或旧版数组；对象根会同步前置词与会话；空闲时可追加或替换队列。</p>',
      '<textarea id="dwt-batch-import-ta" aria-label="粘贴 JSON" spellcheck="false" placeholder=\'{"prefixOn":false,"prefix":"","sessionId":"","sessionUrl":"","items":[{"text":"问题"}]}\'></textarea>',
      '<input type="file" id="dwt-batch-import-file" accept=".json,application/json,text/plain" style="display:none;" aria-label="选择 JSON 文件">',
      '<div class="import-actions">',
      '<button type="button" id="dwt-batch-import-pick">选文件</button>',
      '<button type="button" id="dwt-batch-import-append" class="primary">追加</button>',
      '<button type="button" id="dwt-batch-import-replace" class="danger">替换</button>',
      '<button type="button" id="dwt-batch-import-cancel">取消</button>',
      '</div>',
    ].join('');
    el.querySelector('.tip-hd button').addEventListener('click', closeTip);
    el.querySelector('#dwt-batch-import-cancel').addEventListener('click', closeTip);
    const ta = el.querySelector('#dwt-batch-import-ta');
    const fileInp = el.querySelector('#dwt-batch-import-file');
    el.querySelector('#dwt-batch-import-pick').addEventListener('click', () => {
      if (fileInp) { fileInp.value = ''; fileInp.click(); }
    });
    fileInp.addEventListener('change', () => {
      const f = fileInp.files && fileInp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { if (ta) ta.value = String(rd.result || ''); };
      rd.onerror = () => setStatus('读取文件失败', true);
      rd.readAsText(f);
    });
    const runImport = (replace) => {
      const panel = document.getElementById(PANEL_ID);
      if (panel && panel.dataset.locked === '1') {
        setStatus('运行中配置已锁定, 停止后再导入', true);
        return;
      }
      const raw = (ta && ta.value || '').trim();
      if (!raw) { setStatus('请先粘贴 JSON 或选择文件', true); return; }
      if (commitImportedJson(raw, replace)) closeTip();
    };
    el.querySelector('#dwt-batch-import-append').addEventListener('click', () => runImport(false));
    el.querySelector('#dwt-batch-import-replace').addEventListener('click', () => runImport(true));
    document.body.appendChild(el);
    tipEl = el;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      let top = r.bottom + 6;
      let left = Math.min(r.left, window.innerWidth - 400);
      if (top + 280 > window.innerHeight) top = Math.max(8, r.top - 280);
      if (left < 8) left = 8;
      el.style.top = top + 'px';
      el.style.left = left + 'px';
    } else {
      el.style.top = '20%';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
    }
    setTimeout(() => ta && ta.focus(), 0);
    // 不绑 document 外点关闭: 选文件对话框会触发外点, 误关导入浮层
  }

  function exportJson() {
    readQueueEditors();
    const text = queueToJsonText();
    try {
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // 多任务: 文件名带上任务名, 导出多个任务时能区分
      const t = activeTask();
      const safe = String((t && t.name) || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24);
      a.download = safe ? ('dwt-batch-' + safe + '.json') : 'dwt-batch-queue.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus('已导出「' + ((t && t.name) || '当前任务') + '」队列 JSON');
    } catch (_) {
      openTip(null, { title: '导出 JSON', text: text, editable: false });
      setStatus('已打开导出预览 (可复制)');
    }
  }

  function applyJsonView() {
    if (isJsonApplyBlocked()) {
      setConfigLocked(true);
      updateJsonSyncUi();
      setStatus('运行中配置已锁定, 停止后再应用', true);
      return;
    }
    const ta = document.getElementById('dwt-batch-jsonview');
    if (!ta) return;
    if (!applyJsonText(ta.value || '{"prefixOn":false,"prefix":"","sessionId":"","sessionUrl":"","items":[]}', true)) return;
    persist();
    markJsonDirty(false);
    setStatus('JSON 已应用 (前置词 + ' + queue.length + ' 条) · 已同步');
    if (viewMode === 'table') renderQueue();
    else ta.value = queueToJsonText();
    updateJsonSyncUi();
  }

  async function copyJsonView(btn) {
    const ta = document.getElementById('dwt-batch-jsonview');
    if (!ta) return;
    const text = ta.value || '';
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (_) {}
    if (!ok) {
      try {
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(ta.value.length, ta.value.length);
      } catch (_) { ok = false; }
    }
    if (!ok) {
      setStatus('复制失败, 请手动选择', true);
      return;
    }
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = '已复制';
      btn.classList.add('ok');
      clearTimeout(btn._dwtCopyTip);
      btn._dwtCopyTip = setTimeout(() => {
        btn.textContent = prev || '复制';
        btn.classList.remove('ok');
      }, 1200);
    }
    setStatus('已复制 JSON');
  }

  // 拖拽：面板头（.hd）为把手。同 rev 复用路径会直接 return（不拆树），所以挂载要覆盖
  // 「复用」与「重建」两条路 —— attach 幂等，重挂即换掉上一实例的监听。
  function bindDrag(p) {
    window.dwt?.drag?.attach?.(p, { key: 'batch', handle: p.querySelector('.hd') });
  }

  function mount() {
    const existing = document.getElementById(PANEL_ID);
    // 同 rev 已挂载：禁止整树拆除（闪烁根因 + 拆掉 #dwt-batch-panel-att）
    if (existing && existing.dataset.ver === PANEL_VER) {
      bindDrag(existing);
      publishState();
      return false;
    }
    const wasOpen = isPanelVisible(existing);
    const reopenAtt = attPanelIdx;
    if (existing) existing.remove();
    closeTip();
    // 热重载时 queue 可能已有内存态; 仅空队列才从 storage 拉
    injectStyles();
    const p = document.createElement('div');
    p.id = PANEL_ID;
    p.dataset.ver = PANEL_VER;
    if (wasOpen) p.style.display = 'flex';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', '批量问答面板');
    p.innerHTML = `
      <div class="hd">
        <div class="hd-left">
          <b>📋 批量问答</b>
          <button type="button" class="tip-btn" id="dwt-batch-help" title="使用说明" aria-label="使用说明">?</button>
          <div class="view-tabs" role="tablist" aria-label="视图切换">
            <button type="button" data-view="table" class="on" role="tab" aria-selected="true">表格</button>
            <button type="button" data-view="json" role="tab" aria-selected="false">JSON</button>
          </div>
        </div>
        <button type="button" class="x" id="dwt-batch-x" aria-label="关闭批量问答面板">×</button>
      </div>
      <div class="prog" aria-label="批量进度"><i></i></div>
      <div class="task-row">
        <select id="dwt-batch-task-sel" aria-label="批量任务列表" title="切换任务"></select>
        <button type="button" id="dwt-batch-task-new" class="outline" title="新建一个空任务">＋ 新任务</button>
        <button type="button" id="dwt-batch-task-rename" class="outline" title="重命名当前任务">重命名</button>
        <button type="button" id="dwt-batch-task-dup" class="outline" title="复制当前任务">复制</button>
        <button type="button" id="dwt-batch-task-del" class="outline" title="删除当前任务">删除</button>
      </div>
      <div class="pfx-block">
        <div class="pfx-head">
          <label class="pfx-toggle" title="开启后编辑区显示在列表上方, 发送时拼在每条正文前">
            <input type="checkbox" id="dwt-batch-pfx-on">
            <span class="pfx-switch" aria-hidden="true"></span>
            <span class="pfx-lbl">前置词</span>
          </label>
        </div>
        <div class="rowp" id="dwt-batch-pfx-row">
          <div class="pfx-prev empty" id="dwt-batch-pfx-prev" role="button" tabindex="0">点击编辑前置词…</div>
          <button type="button" class="tip-btn" id="dwt-batch-pfx-tip" title="编辑前置词" aria-label="编辑前置词">i</button>
          <input type="hidden" id="dwt-batch-prefix" value="">
        </div>
      </div>
      <div class="table-wrap on">
        <div class="thead"><span>#</span><span>内容</span><span>状态</span><span>回复</span><span>操作</span></div>
        <ul class="qlist" role="list" aria-label="问答队列"></ul>
      </div>
      <div class="json-wrap" role="tabpanel" aria-label="JSON 配置编辑">
        <div class="json-head">
          <span class="json-title">JSON 配置（与表格同源）</span>
          <span class="json-sync ok" id="dwt-batch-json-sync">已同步</span>
        </div>
        <div class="json-ta-wrap">
          <button type="button" id="dwt-batch-json-copy" class="json-copy" title="复制当前 JSON" aria-label="复制当前 JSON">复制</button>
          <textarea id="dwt-batch-jsonview" aria-label="队列 JSON 配置" spellcheck="false"
            placeholder=""></textarea>
        </div>
        <div class="json-actions">
          <button type="button" id="dwt-batch-json-apply" class="primary">应用到队列</button>
          <button type="button" id="dwt-batch-json-reload">从队列刷新</button>
        </div>
      </div>
      <div class="bp-bar" aria-live="polite">
        <span class="bp-label">断点</span>
        <button type="button" id="dwt-batch-go-bp" class="primary" title="从断点那一条继续发送">从断点继续</button>
        <button type="button" id="dwt-batch-bp-clear" title="清除断点标记">清除断点</button>
      </div>
      <div class="btns">
        <button type="button" id="dwt-batch-add" class="add" aria-label="添加一条任务">＋ 添加</button>
        <button type="button" id="dwt-batch-go" class="primary" title="从第 1 条重新开始">从头开始</button>
        <button type="button" id="dwt-batch-stop" class="danger" disabled>停止</button>
        <button type="button" id="dwt-batch-resume" disabled title="无断点">继续</button>
        <button type="button" id="dwt-batch-importjson" title="空闲时选文件或粘贴 JSON, 追加或替换队列">导入 JSON</button>
        <button type="button" id="dwt-batch-exportjson" class="outline" title="队列为空，无可导出条目" disabled>导出 JSON</button>
      </div>
      <input type="file" id="dwt-batch-file" accept="${DOUBAO_ATTACH_ACCEPT}" multiple style="display:none;" aria-label="选择附件文件">
    `;
    (document.body || document.documentElement).appendChild(p);
    // 拖拽：面板头（.hd）为把手；按钮/输入不参与，见 core/panel-drag.js
    bindDrag(p);

    p.querySelector('#dwt-batch-x').addEventListener('click', close);
    p.querySelector('#dwt-batch-task-sel').addEventListener('change', (e) => {
      const id = e.target && e.target.value;
      const back = activeTaskId;
      switchTask(id).then((ok) => {
        if (!ok && e.target) e.target.value = back || '';
      });
    });
    p.querySelector('#dwt-batch-task-new').addEventListener('click', () => { createTask({}); });
    p.querySelector('#dwt-batch-task-dup').addEventListener('click', () => { createTask({ copyFrom: true }); });
    p.querySelector('#dwt-batch-task-del').addEventListener('click', () => { deleteActiveTask(); });
    p.querySelector('#dwt-batch-task-rename').addEventListener('click', (e) => {
      const t = activeTask();
      if (!t) return;
      if (runLocked()) { setStatus('任务运行中不能重命名', true); renderTaskSelect(); return; }
      // 直接编辑即改名（不依赖 blur: tip 被 outside-click 关掉时 blur 不一定触发）
      openTip(e.currentTarget, {
        title: '重命名任务',
        text: t.name || '',
        editable: true,
        onChange: (v) => renameActiveTask(v, { quiet: true }),
        onBlur: (v) => renameActiveTask(v),
      });
    });
    p.querySelector('#dwt-batch-go').addEventListener('click', () => start(false));
    p.querySelector('#dwt-batch-go-bp').addEventListener('click', () => start(true));
    p.querySelector('#dwt-batch-bp-clear').addEventListener('click', clearBreakpoint);
    p.querySelector('#dwt-batch-stop').addEventListener('click', stop);
    p.querySelector('#dwt-batch-resume').addEventListener('click', onContinueClick);
    p.querySelector('#dwt-batch-add').addEventListener('click', () => {
      queue.push(normalizeItem({ type: 'text', text: '' }));
      renderQueue(); persist();
    });
    p.querySelector('#dwt-batch-importjson').addEventListener('click', (e) => {
      openImportJsonDialog(e.currentTarget);
    });
    p.querySelector('#dwt-batch-exportjson').addEventListener('click', exportJson);
    p.querySelector('#dwt-batch-file').addEventListener('change', (e) => {
      attachFiles(e.target.files);
    });
    p.querySelector('#dwt-batch-json-apply').addEventListener('click', (e) => {
      e.preventDefault();
      if (isJsonApplyBlocked()) {
        setConfigLocked(true);
        updateJsonSyncUi();
        setStatus('运行中配置已锁定, 停止后再应用', true);
        return;
      }
      applyJsonView();
    });
    p.querySelector('#dwt-batch-json-copy').addEventListener('click', (e) => {
      copyJsonView(e.currentTarget);
    });
    p.querySelector('#dwt-batch-json-reload').addEventListener('click', () => {
      const ta = p.querySelector('#dwt-batch-jsonview');
      if (ta) ta.value = queueToJsonText();
      markJsonDirty(false);
      setStatus('已从队列刷新 JSON · 含 prefixOn/prefix 与 items(status/reply)');
    });
    const jsonTa = p.querySelector('#dwt-batch-jsonview');
    if (jsonTa) {
      jsonTa.placeholder = JSON_PLACEHOLDER;
      jsonTa.addEventListener('input', () => {
        if (isJsonApplyBlocked()) return;
        markJsonDirty(true);
      });
    }
    p.querySelectorAll('.view-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        setView(btn.dataset.view);
        p.querySelectorAll('.view-tabs button').forEach((b) => {
          b.setAttribute('aria-selected', b.dataset.view === viewMode ? 'true' : 'false');
        });
      });
    });

    const openPrefixTip = (anchor) => {
      if (!isPrefixEnabled()) return;
      const hidden = p.querySelector('#dwt-batch-prefix');
      openTip(anchor, {
        title: '全局前置词',
        text: hidden ? hidden.value : '',
        editable: true,
        onChange: (v) => {
          if (hidden) hidden.value = v;
          syncPrefixPreview();
        },
        onBlur: () => persist(),
      });
    };
    p.querySelector('#dwt-batch-pfx-on').addEventListener('change', (e) => {
      prefixOn = !!e.target.checked;
      syncPrefixUi();
      if (!prefixOn) closeTip();
      persist();
    });
    p.querySelector('#dwt-batch-pfx-tip').addEventListener('click', (e) => {
      e.stopPropagation();
      openPrefixTip(e.currentTarget);
    });
    p.querySelector('#dwt-batch-pfx-prev').addEventListener('click', (e) => {
      openPrefixTip(e.currentTarget);
    });
    p.querySelector('#dwt-batch-help').addEventListener('click', (e) => {
      e.stopPropagation();
      openTip(e.currentTarget, {
        title: '使用说明',
        width: 470,
        editable: false,
        blocks: [
          {
            title: '任务（多任务）',
            cols: ['操作 / 概念', '说明'],
            rows: [
              ['顶部下拉', '任务列表：每个任务有独立队列 / 前置词 / 会话 / 断点 / 进度'],
              ['＋ 新任务', '新建空任务'],
              ['复制', '复制当前任务（含附件 / 前置词 / 会话；上次运行的状态与回复会重置）'],
              ['重命名', '点按钮直接改（面板内就地编辑）'],
              ['删除', '点两次生效（4 秒内第二次才算）；至少保留一个任务'],
              ['运行门控', '同一时期只允许一个任务进行中：运行中任务行整体禁用，先停止才能切换 / 新建 / 删除'],
              ['切换任务', '先把当前任务落盘；JSON 视图有未应用的修改时会先拦下'],
              ['队列存储', 'dwt_batch_queue_v2 = 当前活动任务的镜像；每个任务另有 dwt_batch_task_q_<id>'],
              ['任务索引', 'dwt_batch_tasks_v1 只存名称 / 进度摘要 / 断点 / 前置词 / 会话（不含附件数据）'],
            ],
          },
          {
            title: '队列',
            cols: ['项', '说明'],
            rows: [
              ['＋ 添加', '在底部按钮组最左'],
              ['类型', '没有「类型」列：有附件 → 带附件发送；无附件 → 纯文本'],
              ['附（操作列）', '多附件管理：增 / 删 / 换 / 拖拽排序；最多 ' + DOUBAO_ATTACH_MAX + ' 个（对齐豆包）'],
              ['附件显示', '按后缀显示图标；列表只显示文件名 basename'],
            ],
          },
          {
            title: '前置词',
            cols: ['项', '说明'],
            rows: [
              ['勾选', '编辑区出现在列表上方；关闭则发送时不再加前置词'],
              ['JSON 字段', 'prefixOn / prefix（与 items 同级）'],
            ],
          },
          {
            title: '会话关联',
            cols: ['按钮', '说明'],
            rows: [
              ['从头开始', '同页点击豆包侧栏「新对话」，绑定新会话并重置断点，从第 1 条发'],
              ['继续', '若有 sessionId 先导航到该会话；404 / 无权限 / 对不上则新建并更新 JSON'],
              ['新对话', '初期 URL 常为 /chat，首条发出后才补写 sessionId / sessionUrl'],
            ],
          },
          {
            title: '运行 / 按钮',
            cols: ['状态', '可点 / 行为'],
            rows: [
              ['空闲', '可点：添加 · 从头开始 · 导入\n有队列时「导出 JSON」可点；「停止」禁用；「继续」仅有断点时可点\n队列可拖拽排序'],
              ['运行中', '仅「停止」可点；「导出 JSON」仍可（只读快照）；JSON「应用到队列」禁用'],
              ['暂停可续', '「停止」+「继续下一条」可点；配置仍只读'],
              ['停止后有断点', '可点：从头开始 · 继续 · 导出'],
              ['完成后', '自动停，回到空闲'],
              ['其它', '点「回复」列「查看」看全文 tip；间隔 / 回复超时在扩展「配置页 → 批量问答」'],
            ],
          },
          {
            title: 'JSON 配置 / schema',
            mono: true,
            cols: ['字段', '说明'],
            rows: [
              ['根对象', '{ prefixOn, prefix, sessionId, sessionUrl, items: [...] }\n导出 / JSON 视图 / 应用到队列 / 导入均为此结构'],
              ['prefixOn\nprefix', '与表格前置词同源；「应用到队列」会写回 UI + storage'],
              ['sessionId\nsessionUrl', '批量绑定的豆包会话；与 storage 双写'],
              ['items[].text', '必填'],
              ['items[].replyCheck', '可选'],
              ['items[].attachments[]', '可选：{ fileName, mime, dataUrl?, filePath? }'],
              ['兼容字段', 'attachment（单附件）· imageDataUrl'],
              ['附件上限', '最多 ' + DOUBAO_ATTACH_MAX + ' 个；≤2.5MB 持久化 dataUrl，更大刷新后角标保留但需重选'],
              ['文件路径', '浏览器无真实 path：导出用 fileName+dataUrl；有 path 能力才写 filePath'],
              ['每条结果', '结束后写入 status + reply 并 persist'],
              ['旧版根', '纯数组 = 仅 items（前置词 / 会话保持当前 UI）'],
              ['编辑时机', '空闲可编辑并「应用到队列」；运行中只读、绝不可应用'],
              ['导入 / 刷新', '「导入 JSON」空闲时选文件或粘贴，可追加 / 替换；「从队列刷新」含前置词 + 会话 + 配置 + 结果'],
            ],
          },
        ],
      });
    });

    window.addEventListener('dwt-batch-busy', () => setStatus('队列进行中, 已忽略重复启动', true));

    loadTasks().then(() => {
      hydrateQueueAtts();
      renderQueue();
      syncPrefixUi();
      updateJsonSyncUi();
      renderTaskSelect();
      syncBtnState();
      if (viewMode === 'json') setView('json');
      if (reopenAtt >= 0 && queue[reopenAtt]) openAttPanel(reopenAtt);
      publishState();
    });
    return true;
  }

  function exportApi() {
    return {
      open, close, toggle, refreshStatus,
      addItems: (items) => { (items || []).forEach((it) => queue.push(normalizeItem(it))); renderQueue(); persist(); },
      // ---- 多任务 API（自动化/测试用；同一时期只有一个任务能处于进行中）----
      listTasks: () => tasks.map((t) => ({
        id: t.id,
        name: t.name,
        active: t.id === activeTaskId,
        running: runLocked() && t.id === activeTaskId,
        done: Number(t.done) || 0,
        failed: Number(t.failed) || 0,
        total: Number(t.total) || 0,
        text: taskStateText(t),
      })),
      activeTaskId: () => activeTaskId,
      activeTaskName: () => (activeTask() || {}).name || '',
      newTask: (name) => createTask({ name }),
      duplicateTask: () => createTask({ copyFrom: true }),
      switchTask: (id) => switchTask(id),
      renameTask: (name) => renameActiveTask(name),
      deleteTask: () => deleteActiveTask(),
      runLocked: () => runLocked(),
    };
  }

  function registerBatchRail(attempt) {
    // 稳定间接: rail 首次注册后永久转发到最新 api, 避免热重载后点图标仍走旧闭包
    window.__dwtBatchPanelApi = exportApi();
    dwt.batchPanel = window.__dwtBatchPanelApi;
    try { delete window.__dwtBatchRailRegistered; } catch (_) { window.__dwtBatchRailRegistered = false; }
    if (dwt.rail && dwt.rail.add) {
      // 已有入口只更新 API 指针，避免 remove+add 闪 rail
      const existed = dwt.rail.getEl && dwt.rail.getEl('batch');
      if (existed) {
        try { dwt.rail.setVisible && dwt.rail.setVisible('batch', true); } catch (_) {}
        return true;
      }
      dwt.rail.add({
        id: 'batch',
        icon: '📋',
        title: '批量问答',
        order: 1,
        onClick: () => {
          const api = window.__dwtBatchPanelApi;
          if (api) api.toggle();
        },
      });
      try { dwt.rail.setVisible && dwt.rail.setVisible('batch', true); } catch (_) {}
      return true;
    }
    if ((attempt || 0) < 25) {
      setTimeout(() => registerBatchRail((attempt || 0) + 1), 200);
    }
    return false;
  }

  function boot() {
    const remounted = mount();
    registerBatchRail(0);
    if (wasPanelOpen()) startPolling();
    publishState();
    if (!remounted) {
      try { syncBtnState(); updateBpBar(); } catch (_) {}
      if (attPanelIdx >= 0 && queue[attPanelIdx] && !document.getElementById(PANEL_ID + '-att')) {
        openAttPanel(attPanelIdx);
      }
    }
  }

  function wasPanelOpen() {
    return isPanelVisible(document.getElementById(PANEL_ID));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(() => {
    if (!document.getElementById(PANEL_ID)) boot();
  }, 250);

  console.log('[cs][doubao-web-toolkit] batch-input panel ' + PANEL_VER + ' ready');
})();
