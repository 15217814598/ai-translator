/**
 * 译流 · AI 翻译 — Content Script
 * 划词悬浮翻译 + 整页翻译（影子 DOM 隔离，不污染页面样式）。
 */
(() => {
  if (window.__linguaFlowLoaded) return;
  window.__linguaFlowLoaded = true;

  const HOST_ID = 'lingua-flow-host';
  const ORIG_ATTR = 'data-lf-orig';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'MATH', 'INPUT', 'SELECT', 'OPTION', 'IFRAME', 'OBJECT', 'EMBED', 'CANVAS', 'VIDEO', 'AUDIO', 'IMG', 'HEAD', 'TITLE']);
  const BARE_TEXT = /^[\d\s.,;:!?…·、。，；：！？\-–—/\\()（）[\]{}【】'""《》<>|~`*@#$%^&+=_]+$/;

  const state = {
    host: null,
    shadow: null,
    btn: null,
    panel: null,
    lastSelection: null, // { text, rect }
    busyPage: false,
    originals: []        // [{ node, original }]
  };

  /* ------------------------------- 样式注入 ------------------------------- */

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .lf-btn {
      position: fixed; width: 28px; height: 28px; border: none; border-radius: 7px;
      background: #C23B22; color: #fff; font: 700 15px/28px "Songti SC","STSong","SimSun",serif;
      text-align: center; cursor: pointer; z-index: 2147483646;
      box-shadow: 0 2px 8px rgba(27,30,38,.28); transition: transform .12s ease;
      user-select: none; -webkit-user-select: none;
      pointer-events: auto;
    }
    .lf-btn:hover { transform: scale(1.12); }
    .lf-panel {
      position: fixed; width: 348px; max-width: calc(100vw - 24px); z-index: 2147483647;
      background: #FAF8F4; border: 1px solid #E5E0D6; border-radius: 12px;
      box-shadow: 0 12px 32px rgba(27,30,38,.22); overflow: hidden;
      font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1B1E26; animation: lf-in .16s ease;
      pointer-events: auto;
    }
    @keyframes lf-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .lf-panel { animation: none; } .lf-btn:hover { transform: none; } }
    .lf-head {
      display: flex; align-items: center; gap: 8px; padding: 10px 12px;
      border-bottom: 1px solid #E5E0D6;
    }
    .lf-seal {
      width: 22px; height: 22px; border-radius: 5px; background: #C23B22; color: #fff;
      font: 700 13px/22px "Songti SC","STSong","SimSun",serif; text-align: center; flex: none;
    }
    .lf-title { font-size: 12px; color: #7A7E8A; flex: 1; letter-spacing: .04em; }
    .lf-x {
      border: none; background: none; font-size: 16px; line-height: 1; color: #7A7E8A;
      cursor: pointer; padding: 2px 4px; border-radius: 4px;
    }
    .lf-x:hover { background: #EFEAE0; color: #1B1E26; }
    .lf-body { padding: 12px; max-height: 380px; overflow-y: auto; }
    .lf-label {
      font-size: 11px; color: #7A7E8A; letter-spacing: .12em; margin-bottom: 4px;
    }
    .lf-src {
      font-size: 13px; line-height: 1.6; color: #5D616C; white-space: pre-wrap;
      word-break: break-word; margin-bottom: 12px;
      border-left: 2px solid #E5E0D6; padding-left: 8px;
      max-height: 110px; overflow-y: auto;
    }
    .lf-dst {
      font-family: "Songti SC","STSong","SimSun",Georgia,serif;
      font-size: 15px; line-height: 1.75; color: #1B1E26; white-space: pre-wrap;
      word-break: break-word; min-height: 24px;
    }
    .lf-dst.err { font-family: inherit; font-size: 13px; color: #C23B22; }
    .lf-dst .lf-cursor {
      display: inline-block; width: 7px; height: 15px; background: #C23B22; opacity: .65;
      vertical-align: text-bottom; animation: lf-blink 1s steps(1) infinite; margin-left: 2px;
    }
    @keyframes lf-blink { 50% { opacity: 0; } }
    .lf-foot {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      border-top: 1px solid #E5E0D6; background: #F5F2EB;
    }
    .lf-note { flex: 1; font-size: 11px; color: #9A9DA8; }
    .lf-copy {
      border: 1px solid #2F5D50; background: #2F5D50; color: #fff; font-size: 12px;
      padding: 4px 12px; border-radius: 6px; cursor: pointer;
    }
    .lf-copy:hover { background: #254A40; }
    .lf-link { color: #2F5D50; font-size: 12px; cursor: pointer; text-decoration: underline; }
    .lf-prog {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
      background: #1B1E26; color: #FAF8F4; border-radius: 10px; padding: 10px 14px;
      font: 12px/1.4 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      display: flex; align-items: center; gap: 8px;
      box-shadow: 0 8px 24px rgba(27,30,38,.35);
      pointer-events: auto;
    }
    .lf-prog .dot {
      width: 14px; height: 14px; border-radius: 4px; background: #C23B22; color: #fff;
      font: 700 9px/14px "Songti SC","STSong","SimSun",serif; text-align: center; flex: none;
    }
  `;

  function ensureHost() {
    if (state.host && document.documentElement.contains(state.host)) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    // 宿主零尺寸 + 内联样式：内联优先级高于站点样式表，
    // 即使站点有 body > div 之类的全局规则，也无法把宿主变成遮罩或让它拦截点击。
    host.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;' +
      'margin:0;border:0;padding:0;pointer-events:none;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);
    // 挂到 <html> 而非 <body>：避开依赖 body 直接子元素的页面布局与选择器
    document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;
    state.btn = null;
    state.panel = null;
    progEl = null;
  }

  /* ----------------------------- 悬浮翻译按钮 ----------------------------- */

  function showButton(rect) {
    ensureHost();
    if (!state.btn) {
      const b = document.createElement('button');
      b.className = 'lf-btn';
      b.textContent = '译';
      b.title = '译流：翻译选中内容';
      // preventDefault：阻止点击按钮时浏览器清掉当前选区，保证面板定位与取词稳定
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', () => {
        const sel = state.lastSelection;
        hideButton();
        if (sel) openPanel(sel.text, rectFromSelection() || sel.rect);
      });
      state.shadow.appendChild(b);
      state.btn = b;
    }
    const top = Math.max(4, rect.top - 34);
    const left = Math.min(window.innerWidth - 34, Math.max(4, rect.right - 28));
    state.btn.style.top = top + 'px';
    state.btn.style.left = left + 'px';
    state.btn.style.display = 'block';
  }

  function hideButton() {
    if (state.btn) state.btn.style.display = 'none';
  }

  function rectFromSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    return sel.getRangeAt(0).getBoundingClientRect();
  }

  // 复制文本：clipboard API 不可用时（如 http 页面）回退到 execCommand
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* 继续回退 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;opacity:0;';
      document.documentElement.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /* ------------------------------- 翻译面板 ------------------------------- */

  function closePanel() {
    if (state.panel) {
      state.panel.remove();
      state.panel = null;
    }
  }

  function openPanel(sourceText, rect) {
    ensureHost();
    closePanel();
    const panel = document.createElement('div');
    panel.className = 'lf-panel';
    panel.innerHTML = `
      <div class="lf-head">
        <div class="lf-seal">译</div>
        <div class="lf-title">译流 · AI 翻译</div>
        <button class="lf-x" title="关闭">×</button>
      </div>
      <div class="lf-body">
        <div class="lf-label">原文</div>
        <div class="lf-src"></div>
        <div class="lf-label">译文</div>
        <div class="lf-dst"><span class="lf-cursor"></span></div>
      </div>
      <div class="lf-foot">
        <span class="lf-note"></span>
        <button class="lf-copy">复制译文</button>
      </div>`;
    state.shadow.appendChild(panel);
    state.panel = panel;

    // 定位：优先选区下方，放不下则上方
    const w = 348, h = panel.offsetHeight || 260;
    let top = rect ? rect.bottom + 10 : 80;
    if (top + h > window.innerHeight - 8) top = Math.max(8, (rect ? rect.top : 80) - h - 10);
    let left = rect ? rect.left : Math.max(12, (window.innerWidth - w) / 2);
    left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    panel.querySelector('.lf-x').addEventListener('click', () => { closePanel(); hideButton(); });
    panel.querySelector('.lf-copy').addEventListener('click', async (e) => {
      const dst = panel.querySelector('.lf-dst');
      const text = dst.getAttribute('data-text') || '';
      if (!text) return;
      const ok = await copyText(text);
      e.target.textContent = ok ? '已复制' : '复制失败';
      setTimeout(() => { e.target.textContent = '复制译文'; }, 1500);
    });

    const srcEl = panel.querySelector('.lf-src');
    const dstEl = panel.querySelector('.lf-dst');
    const noteEl = panel.querySelector('.lf-note');
    srcEl.textContent = sourceText;

    translateInPanel(sourceText, dstEl, noteEl);
  }

  async function translateInPanel(text, dstEl, noteEl) {
    noteEl.textContent = '翻译中…';
    let res;
    try {
      res = await chrome.runtime.sendMessage({ kind: 'translate', text, recordHistory: true });
    } catch (e) {
      res = { ok: false, error: '扩展消息通道中断，请刷新页面后重试。' };
    }
    if (!state.panel || !state.panel.contains(dstEl)) return; // 面板已关闭
    noteEl.textContent = '';
    if (res && res.ok) {
      dstEl.classList.remove('err');
      dstEl.textContent = res.text;
      dstEl.setAttribute('data-text', res.text);
    } else {
      dstEl.classList.add('err');
      const msg = (res && res.error) || '翻译失败。';
      dstEl.textContent = msg;
      if (/设置|API Key|接口地址/.test(msg)) {
        const link = document.createElement('span');
        link.className = 'lf-link';
        link.textContent = ' 去设置';
        link.addEventListener('click', () => chrome.runtime.openOptionsPage());
        dstEl.appendChild(link);
      }
    }
  }

  /* ------------------------------ 整页翻译 ------------------------------ */

  function hasLatin(t) { return /[A-Za-z]{2,}/.test(t); }
  function hasCJK(t) { return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(t); }
  function hasKanaOrHangul(t) { return /[\u3040-\u30ff\uac00-\ud7af]/.test(t); }

  function nodeWorthTranslating(node, target) {
    const t = node.nodeValue;
    if (!t || t.trim().length < 2) return false;
    if (BARE_TEXT.test(t.trim())) return false;
    // 目标语言启发式：译入中文/日文时翻译拉丁文或假名/谚文文本；译入英文时翻译含中日韩文字的文本
    if (target === 'en') return hasCJK(t);
    return hasLatin(t) || hasKanaOrHangul(t);
  }

  function collectTextNodes(target) {
    const nodes = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`#${HOST_ID}`)) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script,style,noscript,textarea,code,pre,kbd,samp,svg,math,select,option')) return NodeFilter.FILTER_REJECT;
        if (parent.closest('[contenteditable="true"], [contenteditable=""], [data-lf-skip]')) return NodeFilter.FILTER_REJECT;
        if (parent.hasAttribute && parent.hasAttribute(ORIG_ATTR)) return NodeFilter.FILTER_REJECT;
        if (!nodeWorthTranslating(node, target)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) {
      nodes.push(n);
      if (nodes.length >= 4000) break; // 防御超大页面
    }
    return nodes;
  }

  let progEl = null;
  function showProgress(pct) {
    ensureHost();
    if (!progEl) {
      progEl = document.createElement('div');
      progEl.className = 'lf-prog';
      progEl.innerHTML = '<span class="dot">译</span><span class="txt">翻译中…</span>';
      state.shadow.appendChild(progEl);
    }
    progEl.querySelector('.txt').textContent = `整页翻译中 · ${pct}%`;
    progEl.style.display = 'flex';
  }
  function hideProgress() {
    if (progEl) progEl.style.display = 'none';
  }

  function restorePage() {
    let count = 0;
    for (const rec of state.originals) {
      try {
        // 优先还原原节点；若已被页面框架替换/删除，则按父节点 + 子节点位置兜底
        if (rec.node && rec.node.isConnected) {
          rec.node.nodeValue = rec.original;
          count++;
          continue;
        }
        if (rec.parent && rec.parent.isConnected) {
          const child = rec.parent.childNodes[rec.index];
          if (child && child.nodeType === Node.TEXT_NODE) {
            child.nodeValue = rec.original;
            count++;
            continue;
          }
        }
      } catch { /* 节点已脱离文档 */ }
    }
    state.originals = [];
    // 兜底：清理遗留属性
    document.querySelectorAll(`[${ORIG_ATTR}]`).forEach((el) => {
      if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
        el.firstChild.nodeValue = el.getAttribute(ORIG_ATTR);
      }
      el.removeAttribute(ORIG_ATTR);
    });
    delete document.documentElement.dataset.lfTranslated;
    return count;
  }

  async function translatePage(target) {
    if (state.busyPage) return { ok: false, error: '正在翻译中，请稍候。' };
    const settings = await chrome.storage.local.get('settings').catch(() => ({}));
    const tgt = target || (settings && settings.settings && settings.settings.targetLang) || 'zh';

    if (state.originals.length) restorePage(); // 重新翻译前先还原
    const nodes = collectTextNodes(tgt);
    if (!nodes.length) return { ok: false, error: '没有找到可翻译的文本。' };

    state.busyPage = true;
    document.documentElement.dataset.lfTranslated = '1';
    const BATCH = 20;
    let done = 0, failed = 0;
    showProgress(0);
    try {
      for (let i = 0; i < nodes.length; i += BATCH) {
        const slice = nodes.slice(i, i + BATCH);
        const items = slice.map((n) => n.nodeValue);
        let res;
        try {
          res = await chrome.runtime.sendMessage({ kind: 'translateBatch', items, target: tgt });
        } catch {
          res = { ok: false, error: '扩展消息通道中断。' };
        }
        if (res && res.ok && Array.isArray(res.texts) && res.texts.length === items.length) {
          slice.forEach((n, idx) => {
            const translated = res.texts[idx];
            if (translated && translated !== items[idx]) {
              const parent = n.parentElement;
              if (parent && !parent.hasAttribute(ORIG_ATTR)) {
                parent.setAttribute(ORIG_ATTR, items[idx]);
              }
              state.originals.push({
                node: n,
                parent,
                index: parent ? Array.prototype.indexOf.call(parent.childNodes, n) : -1,
                original: items[idx]
              });
              n.nodeValue = translated;
            }
          });
        } else {
          failed += slice.length;
        }
        done += slice.length;
        showProgress(Math.min(99, Math.round((done / nodes.length) * 100)));
      }
      showProgress(100);
      setTimeout(hideProgress, 900);
      return { ok: true, translated: done - failed, failed };
    } finally {
      state.busyPage = false;
    }
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  let selectTimer = null;
  document.addEventListener('mouseup', (e) => {
    if (state.host && e.target && e.target.closest && e.target.closest(`#${HOST_ID}`)) return;
    clearTimeout(selectTimer);
    selectTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? String(sel).trim() : '';
      if (!text || text.length < 2 || text.length > 8000) {
        hideButton();
        return;
      }
      const rect = rectFromSelection();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        hideButton();
        return;
      }
      state.lastSelection = { text, rect };
      showButton(rect);
    }, 120);
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (state.host && e.target && e.target.closest && e.target.closest(`#${HOST_ID}`)) return;
    hideButton();
    closePanel();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePanel();
      hideButton();
    }
  }, true);

  window.addEventListener('scroll', () => hideButton(), true);

  /* ------------------------------ 消息监听 ------------------------------ */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.kind) return;
    if (msg.kind === 'ctxTranslate') {
      // 来自右键菜单：优先使用菜单提供的选中文本，否则用最后一次划词
      const text = (msg.text || (state.lastSelection && state.lastSelection.text) || '').trim();
      if (!text) {
        sendResponse({ ok: false, error: '没有选中的文本。' });
        return;
      }
      openPanel(text, rectFromSelection() || (state.lastSelection && state.lastSelection.rect));
      sendResponse({ ok: true });
      return;
    }
    if (msg.kind === 'getSelection') {
      sendResponse({ ok: true, text: (state.lastSelection && state.lastSelection.text) || '' });
      return;
    }
    if (msg.kind === 'pageTranslate') {
      translatePage(msg.target)
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: (e && e.message) || '翻译失败。' }));
      return true; // 异步
    }
    if (msg.kind === 'pageRestore') {
      const count = restorePage();
      hideProgress();
      sendResponse({ ok: true, count });
      return;
    }
    if (msg.kind === 'pageStatus') {
      sendResponse({ ok: true, translated: state.originals.length > 0, busy: state.busyPage });
      return;
    }
  });
})();
