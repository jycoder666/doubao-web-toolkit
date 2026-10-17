// Tiny gate: inject sweep storms this URL every few seconds. Keep the response
// tiny so Chromium's 6-conn/host budget is not saturated; critical UI = 1 fetch.
(function () {
  'use strict';

  // Dedicated verify port — 5179 wedges under live-boot connection storms.
  var VERIFY_URL = 'http://127.0.0.1:5181/dev/bridge/verify';
  // Serve often prepends critical modules before this gate (one-fetch mount).
  // Fallback fetch only when inline did not produce gear+prompt+nav.
  var CRITICAL_URL = 'http://127.0.0.1:5179/dev/live-boot-critical.js?v=45';
  var FULL_URL = 'http://127.0.0.1:5179/dev/live-boot-full.js?v=45';
  var FETCH_MS = 10000;
  // text/plain = CORS "simple request" → no OPTIONS preflight storm
  var POST_HEADERS = { 'Content-Type': 'text/plain;charset=UTF-8' };

  function visProbe(el) {
    if (!el) {
      return { exists: false, offsetParent: false, display: '', w: 0, h: 0, top: 0, left: 0 };
    }
    var cs = window.getComputedStyle ? getComputedStyle(el) : null;
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0, top: 0, left: 0 };
    return {
      exists: true,
      offsetParent: !!el.offsetParent,
      display: cs ? String(cs.display || '') : '',
      w: Math.round(r.width || 0),
      h: Math.round(r.height || 0),
      top: Math.round(r.top || 0),
      left: Math.round(r.left || 0),
    };
  }

  function collect() {
    var toggle = document.getElementById('dwt-panel-toggle');
    var prompt = document.getElementById('dwt-prompt-bar');
    var nav = document.getElementById('dwt-nav');
    var snip = document.getElementById('dwt-snip-toggle');
    var dwt = window.dwt;
    var gear = !!toggle;
    var promptBar = !!prompt;
    var navOk = !!nav;
    var snipOk = !!snip;
    var dwtOk = !!dwt;
    var navMod = dwt && dwt.navigatorModule;
    var navRev = navMod && typeof navMod.rev === 'number' ? navMod.rev : 0;
    var navMode = '';
    try { navMode = navMod && typeof navMod.mode === 'function' ? String(navMod.mode() || '') : ''; } catch (e) { navMode = ''; }
    var gutterCss = !!document.getElementById('dwt-gutter-style');
    var gutterCount = !!document.getElementById('dwt-gutter-count');
    var gutterEl = document.querySelector('aside[class*="gutter"], aside.absolute.inset-y-0.left-12');
    var nativeGutter = !!gutterEl;
    // gutter-css 模式以原生刻度+美化样式为准；panel 模式仍看 #dwt-nav
    var navReady = navMode === 'gutter-css' ? !!(gutterCss && nativeGutter) : navOk;
    var navVis = visProbe(nav);
    var gutterVis = visProbe(gutterEl);
    var gutterMode = navMode === 'gutter-css';
    return {
      href: String(location.href || ''),
      liveBoot: !!window.__dwtLiveBoot,
      glassBoot: !!window.__dwtGlassBoot,
      dwt: dwtOk,
      dwtKeys: dwt && typeof dwt === 'object' ? Object.keys(dwt) : [],
      toggle: gear,
      toggleText: toggle ? String(toggle.textContent || '').trim() : '',
      promptBar: promptBar,
      nav: navReady,
      snipToggle: snipOk,
      navRev: navRev,
      navMode: navMode || (gutterCss ? 'gutter-css' : (navOk ? 'panel' : '')),
      gutterMode: gutterMode,
      gutterCss: gutterCss,
      gutterCount: gutterCount,
      nativeGutter: nativeGutter,
      navVis: navVis,
      gutterVis: gutterVis,
      // rev>=5: loadAll never auto-scrolls chat; only jumpTo may scroll on click
      autoScrollSweep: false,
      ui: { gear: gear, promptBar: promptBar, navigator: navReady, snipToggle: snipOk, dwt: dwtOk },
      uiReady: !!(gear && promptBar && navReady && dwtOk),
      t: Date.now(),
    };
  }

  function post(extra, force) {
    var now = Date.now();
    var reason = extra && extra.reason;
    var important = force
      || reason === 'live-boot-critical-fetch'
      || reason === 'live-boot-critical-ok'
      || reason === 'live-boot-critical-fail'
      || reason === 'live-boot-full-fetch'
      || reason === 'live-boot-full-eval-ok'
      || reason === 'live-boot-full-fail'
      || reason === 'ui-ready-gate'
      || reason === 'nav-stable-probe'
      || reason === 'nav-rev-upgrade-fetch'
      || reason === 'nav-rev-upgrade-ok'
      || reason === 'nav-rev-upgrade-fail'
      || reason === 'navigator-loadAll';
    if (!important && window.__dwtGatePostAt && now - window.__dwtGatePostAt < 2000) {
      return collect();
    }
    window.__dwtGatePostAt = now;
    var payload = collect();
    if (extra && typeof extra === 'object') {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
      }
    }
    var body = JSON.stringify(payload);
    try {
      fetch(VERIFY_URL, {
        method: 'POST',
        headers: POST_HEADERS,
        body: body,
        mode: 'cors',
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(VERIFY_URL, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      }
    } catch (e2) {}
    return payload;
  }

  function fetchText(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        reject(new Error('timeout ' + (ms || FETCH_MS) + 'ms'));
      }, ms || FETCH_MS);
      var opts = { cache: 'no-store', mode: 'cors' };
      if (ctrl) opts.signal = ctrl.signal;
      fetch(url, opts)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) {
          clearTimeout(timer);
          resolve(text);
        })
        .catch(function (err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function clearBootFlags() {
    window.__dwtFullBootStarted = false;
    window.__dwtBootLoading = false;
    window.__dwtFullBootRunning = false;
  }

  // Stale / incomplete: allow retry. Partial UI (prompt only) must not block forever.
  var staleMs = 10000;
  if (window.__dwtFullBootAt && Date.now() - window.__dwtFullBootAt > staleMs) {
    clearBootFlags();
  }

  var report = post({ reason: 'live-boot-gate' });
  // Require snip pin too: classic uiReady alone used to skip full/critical and leave
  // #dwt-snip-toggle missing when selection-tools lived only in deferred full.
  // Also re-pull critical when navigator is stale (e.g. rev<5 still auto-scroll-sweeps).
  var navRevNow = report.navRev || 0;
  if (report.uiReady && report.snipToggle && navRevNow >= 10) {
    window.__dwtBootLoading = false;
    window.__dwtLiveBoot = true;
    post({ reason: 'ui-ready-gate' }, true);
    // Stability probe: re-post collect 4s later so accept can prove not flash-gone.
    if (!window.__dwtNavStableProbe) {
      window.__dwtNavStableProbe = 1;
      setTimeout(function () {
        post({ reason: 'nav-stable-probe' }, true);
      }, 4000);
    }
    return;
  }
  if (report.uiReady && report.snipToggle && navRevNow < 10) {
    // Hot-upgrade navigator without full blank: re-eval critical bundle once.
    if (!window.__dwtNavRevUpgradeAt || Date.now() - window.__dwtNavRevUpgradeAt > 15000) {
      window.__dwtNavRevUpgradeAt = Date.now();
      post({ reason: 'nav-rev-upgrade-fetch' }, true);
      fetchText(CRITICAL_URL, FETCH_MS)
        .then(function (code) {
          (0, eval)(code + '\n//# sourceURL=' + CRITICAL_URL);
          window.__dwtLiveBoot = true;
          window.__dwtBootLoading = false;
          post({ reason: 'nav-rev-upgrade-ok' }, true);
        })
        .catch(function () {
          post({ reason: 'nav-rev-upgrade-fail' }, true);
        });
    }
    return;
  }

  // Incomplete UI while a prior boot claimed in-flight → force critical retry sooner.
  var partial = !!(report.promptBar || report.dwt || report.toggle || report.nav);
  if (partial && window.__dwtFullBootAt && Date.now() - window.__dwtFullBootAt > 6000) {
    clearBootFlags();
  }

  if (window.__dwtBootLoading || window.__dwtFullBootStarted) {
    post({ reason: 'boot-in-flight' });
    return;
  }

  window.__dwtBootLoading = true;
  window.__dwtFullBootStarted = true;
  window.__dwtFullBootAt = Date.now();
  post({ reason: 'live-boot-critical-fetch' }, true);

  fetchText(CRITICAL_URL, FETCH_MS)
    .then(function (code) {
      (0, eval)(code + '\n//# sourceURL=' + CRITICAL_URL);
      var after = post({ reason: 'live-boot-critical-ok' }, true);
      window.__dwtLiveBoot = true;
      if (after.uiReady) {
        window.__dwtBootLoading = false;
        window.__dwtFullBootRunning = false;
        post({ reason: 'ui-ready-gate' }, true);
        return null;
      }
      // Critical mounted partially — still pull full for self-heal / optional.
      post({ reason: 'live-boot-full-fetch' }, true);
      return fetchText(FULL_URL, FETCH_MS);
    })
    .then(function (fullCode) {
      if (fullCode == null) return;
      (0, eval)(fullCode + '\n//# sourceURL=' + FULL_URL);
      post({ reason: 'live-boot-full-eval-ok' }, true);
      var finalReport = collect();
      if (finalReport.uiReady) {
        window.__dwtBootLoading = false;
        window.__dwtFullBootRunning = false;
      }
    })
    .catch(function (err) {
      clearBootFlags();
      post({
        reason: 'live-boot-critical-fail',
        error: String(err && err.message || err),
      }, true);
    });
})();
