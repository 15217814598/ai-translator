/**
 * 译流 · AI 翻译 — Background Service Worker
 * 负责：设置读写、调用 OpenAI 兼容接口、上下文菜单、历史记录。
 */

const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  targetLang: 'zh', // zh | en | ja
  temperature: 0.2
};

const LANG_NAMES = { zh: '中文（简体）', en: 'English', ja: '日本語' };
const HISTORY_MAX = 20;

/* ---------------------------------- 设置 ---------------------------------- */

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

/* ---------------------------------- 历史 ---------------------------------- */

async function pushHistory(entry) {
  const { history } = await chrome.storage.local.get('history');
  const list = Array.isArray(history) ? history : [];
  list.unshift({ ...entry, ts: Date.now() });
  await chrome.storage.local.set({ history: list.slice(0, HISTORY_MAX) });
}

/* ---------------------------------- 翻译 ---------------------------------- */

function systemPromptFor(target) {
  const name = LANG_NAMES[target] || target;
  return `你是专业翻译引擎。把用户给出的内容准确翻译成${name}。
只输出译文本身：不要任何解释、前缀、后缀、引号或 markdown 标记。
保留原文的换行与排版结构。若内容已经是${name}，原样输出。`;
}

function systemPromptBatchFor(target) {
  const name = LANG_NAMES[target] || target;
  return `你是专业翻译引擎。用户会给你一个 JSON 字符串数组，数组每一项是一段待翻译文本。
请把每一项翻译成${name}，保持数组顺序与长度完全不变。
只输出一个等长的 JSON 字符串数组本身，不要 markdown 代码块，不要解释。
空字符串翻译后仍为空字符串；已是${name}的内容原样保留。`;
}

function friendlyError(status, bodyText) {
  if (status === 401) return '接口返回 401：API Key 无效，请在设置中检查。';
  if (status === 403) return '接口返回 403：没有访问权限，请检查 Key 或接口地址。';
  if (status === 404) return '接口返回 404：接口地址或模型名称不正确。';
  if (status === 429) return '接口返回 429：请求过于频繁或额度不足，请稍后再试。';
  if (status >= 500) return `接口返回 ${status}：服务端错误，请稍后再试。`;
  const short = (bodyText || '').slice(0, 180);
  return `接口返回 ${status}${short ? '：' + short : ''}`;
}

async function callChat(settings, systemContent, userContent) {
  const base = (settings.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('请先在设置中填写接口地址。');
  if (!settings.apiKey) throw new Error('请先在设置中填写 API Key。');

  const url = base + '/chat/completions';
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: Number(settings.temperature) || 0.2,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent }
        ]
      })
    });
  } catch (e) {
    throw new Error('网络请求失败：请检查接口地址与网络连接。');
  }

  const text = await resp.text();
  if (!resp.ok) throw new Error(friendlyError(resp.status, text));

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('接口返回了无法解析的内容。');
  }
  const content = data && data.choices && data.choices[0] &&
    data.choices[0].message && data.choices[0].message.content;
  if (typeof content !== 'string') throw new Error('接口响应中缺少翻译结果。');
  return content.trim();
}

function extractJsonArray(text) {
  if (!text) return null;
  let t = text.trim();
  // 去掉可能包裹的 markdown 代码块
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  try {
    const arr = JSON.parse(t);
    if (Array.isArray(arr)) return arr;
  } catch { /* fallthrough */ }
  // 宽松提取首个 [...] 区块
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(t.slice(start, end + 1));
      if (Array.isArray(arr)) return arr;
    } catch { /* fallthrough */ }
  }
  return null;
}

async function translateText(text, target) {
  const settings = await getSettings();
  return callChat(settings, systemPromptFor(target), text);
}

async function translateBatch(items, target) {
  const settings = await getSettings();
  const raw = await callChat(settings, systemPromptBatchFor(target), JSON.stringify(items));
  const parsed = extractJsonArray(raw);
  if (!parsed || parsed.length !== items.length) {
    throw new Error('批量翻译结果解析失败，请重试。');
  }
  return parsed.map((v, i) => (typeof v === 'string' ? v : String(items[i])));
}

/* ------------------------------- 上下文菜单 ------------------------------- */

async function buildContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'lf-sel-zh',
    title: '译成中文',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'lf-sel-en',
    title: 'Translate to English',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'lf-page',
    title: '翻译整页',
    contexts: ['page']
  });
}

chrome.runtime.onInstalled.addListener(() => {
  buildContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  if (info.menuItemId === 'lf-sel-zh' || info.menuItemId === 'lf-sel-en') {
    const target = info.menuItemId === 'lf-sel-zh' ? 'zh' : 'en';
    chrome.tabs.sendMessage(tab.id, { kind: 'ctxTranslate', target, text: info.selectionText })
      .catch(() => { /* 内容脚本未注入的页面（如 chrome://）静默忽略 */ });
  } else if (info.menuItemId === 'lf-page') {
    chrome.tabs.sendMessage(tab.id, { kind: 'pageTranslate' })
      .catch(() => { /* 同上 */ });
  }
});

/* -------------------------------- 消息路由 -------------------------------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.kind) {
        case 'translate': {
          const out = await translateText(msg.text, msg.target || (await getSettings()).targetLang);
          if (msg.recordHistory !== false) {
            await pushHistory({ src: msg.text.slice(0, 500), dst: out.slice(0, 2000), target: msg.target || null });
          }
          sendResponse({ ok: true, text: out });
          break;
        }
        case 'translateBatch': {
          const texts = await translateBatch(msg.items || [], msg.target || (await getSettings()).targetLang);
          sendResponse({ ok: true, texts });
          break;
        }
        case 'testApi': {
          const out = await translateText('hello', 'zh');
          sendResponse({ ok: true, message: `连接成功，测试译文：${out}` });
          break;
        }
        case 'pushHistory': {
          await pushHistory(msg.entry || {});
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: '未知消息类型。' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || '未知错误。' });
    }
  })();
  return true; // 异步响应
});
