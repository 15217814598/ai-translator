/**
 * 译流 · 设置页逻辑
 */

const $ = (id) => document.getElementById(id);

const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  targetLang: 'zh',
  temperature: 0.2
};

const els = {
  baseUrl: $('baseUrl'),
  apiKey: $('apiKey'),
  toggleKey: $('btnToggleKey'),
  model: $('model'),
  temperature: $('temperature'),
  tempValue: $('tempValue'),
  targetLang: $('targetLang'),
  save: $('btnSave'),
  test: $('btnTest'),
  status: $('status')
};

function setStatus(text, cls) {
  els.status.textContent = text;
  els.status.className = 'status' + (cls ? ' ' + cls : '');
}

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  els.baseUrl.value = s.baseUrl;
  els.apiKey.value = s.apiKey;
  els.model.value = s.model;
  els.temperature.value = s.temperature;
  els.tempValue.value = s.temperature;
  els.targetLang.value = s.targetLang;
}

function collect() {
  return {
    baseUrl: els.baseUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim() || DEFAULT_SETTINGS.model,
    targetLang: els.targetLang.value,
    temperature: Number(els.temperature.value)
  };
}

async function save() {
  const settings = collect();
  await chrome.storage.local.set({ settings });
  setStatus('已保存。', 'ok');
  setTimeout(() => setStatus(''), 2000);
}

async function test() {
  // 先保存再测试，保证用的是当前填写的值
  const settings = collect();
  await chrome.storage.local.set({ settings });
  els.test.disabled = true;
  els.test.textContent = '测试中…';
  setStatus('');
  try {
    const res = await chrome.runtime.sendMessage({ kind: 'testApi' });
    if (res && res.ok) setStatus(res.message, 'ok');
    else setStatus((res && res.error) || '测试失败。', 'err');
  } catch {
    setStatus('扩展消息通道中断，请重新打开设置页。', 'err');
  } finally {
    els.test.disabled = false;
    els.test.textContent = '测试连接';
  }
}

els.toggleKey.addEventListener('click', () => {
  const showing = els.apiKey.type === 'text';
  els.apiKey.type = showing ? 'password' : 'text';
  els.toggleKey.textContent = showing ? '显示' : '隐藏';
});

els.temperature.addEventListener('input', () => {
  els.tempValue.value = els.temperature.value;
});

els.save.addEventListener('click', save);
els.test.addEventListener('click', test);

load();
