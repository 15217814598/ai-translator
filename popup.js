/**
 * 译流 · 弹窗逻辑
 */

const $ = (id) => document.getElementById(id);

const els = {
  banner: $('apiBanner'),
  bannerLink: $('bannerLink'),
  target: $('targetLang'),
  input: $('input'),
  translate: $('btnTranslate'),
  result: $('result'),
  resultMeta: $('resultMeta'),
  copy: $('btnCopy'),
  page: $('btnPage'),
  restore: $('btnRestore'),
  options: $('btnOptions'),
  historyList: $('historyList'),
  clearHistory: $('btnClearHistory')
};

const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  targetLang: 'zh',
  temperature: 0.2
};

let settings = { ...DEFAULT_SETTINGS };

/* ------------------------------- 初始化 ------------------------------- */

async function init() {
  const stored = await chrome.storage.local.get(['settings', 'history']);
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  els.target.value = settings.targetLang;
  if (!settings.apiKey) els.banner.classList.remove('hidden');
  renderHistory(stored.history || []);
  await loadPageStatus();
  await loadSelectionFromPage();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function unsupportedPage() {
  return '当前页面不支持此操作（浏览器内置页面无法注入脚本）。请刷新网页后重试。';
}

/* ---------------------------- 选中文本自动填充 ---------------------------- */

async function loadSelectionFromPage() {
  try {
    const tab = await activeTab();
    if (!tab || tab.id == null) return;
    const res = await chrome.tabs.sendMessage(tab.id, { kind: 'getSelection' });
    if (res && res.ok && res.text && !els.input.value) {
      els.input.value = res.text;
      doTranslate();
    }
  } catch {
    /* 页面无内容脚本，忽略 */
  }
}

/* ------------------------------- 翻译 ------------------------------- */

async function doTranslate() {
  const text = els.input.value.trim();
  if (!text) {
    showResult('先输入要翻译的文字。', 'placeholder');
    return;
  }
  if (!settings.apiKey) {
    showResult('请先在设置中填写 API Key。', 'error', true);
    return;
  }
  els.translate.disabled = true;
  els.translate.textContent = '翻译中…';
  showResult('译流正在翻译…', 'placeholder');
  const started = Date.now();

  let res;
  try {
    res = await chrome.runtime.sendMessage({
      kind: 'translate',
      text,
      target: els.target.value,
      recordHistory: true
    });
  } catch (e) {
    res = { ok: false, error: '扩展消息通道中断，请重新打开弹窗。' };
  }

  els.translate.disabled = false;
  els.translate.textContent = '翻译';

  if (res && res.ok) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    showResult(res.text, '', false, `${elapsed}s · ${res.text.length} 字`);
    loadHistory();
  } else {
    showResult((res && res.error) || '翻译失败。', 'error', true);
  }
}

function showResult(text, cls, withSettingsLink, meta) {
  els.result.className = 'result-text' + (cls ? ' ' + cls : '');
  els.result.textContent = text;
  els.result.setAttribute('data-text', cls === '' || !cls ? text : '');
  els.resultMeta.textContent = meta || '';
  // 仅在成功译文时显示「复制」
  els.copy.classList.toggle('hidden', !!cls);
  if (withSettingsLink && /设置|API Key|接口/.test(text)) {
    const link = document.createElement('a');
    link.textContent = ' 去设置';
    link.addEventListener('click', () => chrome.runtime.openOptionsPage());
    els.result.appendChild(link);
  }
}

/* ------------------------------ 整页翻译 ------------------------------ */

async function loadPageStatus() {
  try {
    const tab = await activeTab();
    if (!tab || tab.id == null) return;
    const res = await chrome.tabs.sendMessage(tab.id, { kind: 'pageStatus' });
    if (res && res.ok && res.translated) {
      els.page.classList.add('hidden');
      els.restore.classList.remove('hidden');
    }
  } catch { /* 无内容脚本 */ }
}

async function doPageTranslate() {
  if (!settings.apiKey) {
    showResult('请先在设置中填写 API Key。', 'error', true);
    return;
  }
  els.page.disabled = true;
  els.page.textContent = '翻译中…';
  try {
    const tab = await activeTab();
    if (!tab || tab.id == null) throw new Error('找不到当前标签页。');
    const res = await chrome.tabs.sendMessage(tab.id, { kind: 'pageTranslate', target: els.target.value });
    if (res && res.ok) {
      showResult(`整页翻译完成：${res.translated} 段${res.failed ? `，${res.failed} 段失败` : ''}。关闭弹窗即可阅读。`, 'placeholder');
      els.page.classList.add('hidden');
      els.restore.classList.remove('hidden');
    } else {
      showResult((res && res.error) || '翻译失败。', 'error', true);
    }
  } catch {
    showResult(unsupportedPage(), 'error');
  } finally {
    els.page.disabled = false;
    els.page.textContent = '翻译整页';
  }
}

async function doPageRestore() {
  try {
    const tab = await activeTab();
    if (!tab || tab.id == null) throw new Error('找不到当前标签页。');
    await chrome.tabs.sendMessage(tab.id, { kind: 'pageRestore' });
    els.restore.classList.add('hidden');
    els.page.classList.remove('hidden');
    showResult('已恢复原文。', 'placeholder');
  } catch {
    showResult(unsupportedPage(), 'error');
  }
}

/* ------------------------------- 历史 ------------------------------- */

async function loadHistory() {
  const { history } = await chrome.storage.local.get('history');
  renderHistory(history || []);
}

function renderHistory(list) {
  els.historyList.innerHTML = '';
  if (!list.length) {
    els.historyList.innerHTML = '<li class="history-empty">还没有翻译记录</li>';
    return;
  }
  for (const item of list.slice(0, 6)) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'history-item';
    const src = document.createElement('span');
    src.className = 'h-src';
    src.textContent = item.src || '';
    const dst = document.createElement('span');
    dst.className = 'h-dst';
    dst.textContent = item.dst || '';
    btn.append(src, dst);
    btn.addEventListener('click', () => {
      els.input.value = item.src || '';
      showResult(item.dst || '', '', false, '来自历史记录');
    });
    li.appendChild(btn);
    els.historyList.appendChild(li);
  }
}

/* -------------------------------- 事件 -------------------------------- */

els.translate.addEventListener('click', doTranslate);
els.input.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doTranslate();
});
els.target.addEventListener('change', async () => {
  settings.targetLang = els.target.value;
  await chrome.storage.local.set({ settings });
});
els.options.addEventListener('click', () => chrome.runtime.openOptionsPage());
els.bannerLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
els.page.addEventListener('click', doPageTranslate);
els.restore.addEventListener('click', doPageRestore);
els.copy.addEventListener('click', async () => {
  const text = els.result.getAttribute('data-text') || (els.copy.classList.contains('hidden') ? '' : els.result.textContent);
  if (!text || els.result.classList.contains('placeholder') || els.result.classList.contains('error')) return;
  try {
    await navigator.clipboard.writeText(text);
    els.copy.textContent = '已复制';
  } catch {
    els.copy.textContent = '复制失败';
  }
  setTimeout(() => { els.copy.textContent = '复制'; }, 1500);
});
els.clearHistory.addEventListener('click', async () => {
  await chrome.storage.local.set({ history: [] });
  renderHistory([]);
});

init();
