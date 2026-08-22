(() => {
  'use strict';

  const STORAGE = {
    baseUrl: 'generic_openai_base_url',
    mode: 'generic_openai_connection_mode',
    last: 'generic_openai_last_detected_url',
    llm: 'generic_openai_llm_model',
    tts: 'generic_openai_tts_model',
    stt: 'generic_openai_stt_model'
  };

  const normalize = (raw) => {
    let value = String(raw || '').trim().replace(/\/+$/, '');
    if (!value) return '';
    return /\/v1$/i.test(value) ? value : `${value}/v1`;
  };

  const isPrivateHttp = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' && (
        u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1' ||
        /^192\.168\./.test(u.hostname) || /^10\./.test(u.hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(u.hostname)
      );
    } catch (_) { return false; }
  };

  const candidates = () => {
    const saved = localStorage.getItem(STORAGE.baseUrl) || '';
    const last = localStorage.getItem(STORAGE.last) || '';
    const list = [
      'http://127.0.0.1:8090/v1',
      'http://localhost:8090/v1',
      'http://127.0.0.1:8080/v1',
      'http://localhost:8080/v1',
      normalize(last),
      normalize(saved),
      'http://192.168.88.50:8090/v1',
      'http://192.168.88.50:8080/v1'
    ].filter(Boolean);
    return [...new Set(list)];
  };

  function setStatus(text, ok = false) {
    const el = document.getElementById('local-detect-status');
    if (!el) return;
    el.textContent = text;
    el.className = `provider-bridge-status ${ok ? 'ok' : 'error'}`;
  }

  function writeBaseUrl(url) {
    const normalized = normalize(url);
    const input = document.getElementById('generic-openai-base-url');
    if (input) {
      input.value = normalized;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    localStorage.setItem(STORAGE.baseUrl, normalized);
    localStorage.setItem(STORAGE.last, normalized);
    localStorage.setItem(STORAGE.mode, 'auto');
    return normalized;
  }

  function getModelId(model) { return model?.id || model?.name || ''; }

  function populateModelList(inputId, models) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const listId = input.getAttribute('list');
    const list = listId ? document.getElementById(listId) : null;
    if (!list) return;
    list.innerHTML = '';
    models.forEach(model => {
      const id = getModelId(model);
      if (!id) return;
      const option = document.createElement('option');
      option.value = id;
      option.label = model?.name ? `${model.name} — ${id}` : id;
      list.appendChild(option);
    });
  }

  function syncModelInput(storageKey, inputId, models) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const ids = models.map(getModelId).filter(Boolean);
    const current = String(input.value || '').trim();
    const saved = localStorage.getItem(storageKey) || '';
    if (!current && saved) input.value = saved;
    else if (!current && ids.length === 1) {
      input.value = ids[0];
      localStorage.setItem(storageKey, ids[0]);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function probe(baseUrl) {
    const normalized = normalize(baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const options = {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      };
      if (isPrivateHttp(normalized)) options.targetAddressSpace = 'local';
      const response = await fetch(`${normalized}/models`, options);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${body ? ` — ${body.slice(0, 180)}` : ''}`);
      }
      const data = await response.json();
      return { baseUrl: normalized, models: Array.isArray(data?.data) ? data.data : [] };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Connection timed out');
      const name = error?.name ? `${error.name}: ` : '';
      throw new Error(`${name}${error?.message || 'Network request failed'}`);
    } finally { clearTimeout(timeout); }
  }

  async function autoDetect() {
    const button = document.getElementById('local-detect-btn');
    if (button) { button.disabled = true; button.textContent = 'Detecting...'; }
    const list = candidates();
    setStatus(`Checking ${list.length} local endpoint(s)...`);
    const failures = [];
    try {
      for (const candidate of list) {
        try {
          const result = await probe(candidate);
          const baseUrl = writeBaseUrl(result.baseUrl);
          ['generic-openai-llm-model','generic-openai-tts-model','generic-openai-stt-model'].forEach(id => populateModelList(id, result.models));
          syncModelInput(STORAGE.llm, 'generic-openai-llm-model', result.models);
          syncModelInput(STORAGE.tts, 'generic-openai-tts-model', result.models);
          syncModelInput(STORAGE.stt, 'generic-openai-stt-model', result.models);
          const modelText = result.models.map(getModelId).filter(Boolean).join(', ') || 'no models returned';
          setStatus(`Connected: ${baseUrl} — ${result.models.length} model(s): ${modelText}`, true);
          const genericStatus = document.getElementById('generic-provider-status');
          if (genericStatus) { genericStatus.textContent = `${result.models.length} local model(s) loaded`; genericStatus.className = 'provider-bridge-status ok'; }
          window.dispatchEvent(new CustomEvent('ai-local-server-detected', { detail: result }));
          return result;
        } catch (error) { failures.push(`${candidate}: ${error?.message || 'failed'}`); }
      }
      throw new Error(`No reachable OpenAI-compatible server. ${failures.join(' | ')}`);
    } catch (error) { setStatus(error.message, false); return null; }
    finally { if (button) { button.disabled = false; button.textContent = 'Detect Local Server'; } }
  }

  async function testManual() {
    const input = document.getElementById('generic-openai-base-url');
    const value = normalize(input?.value);
    if (!value) { setStatus('Enter a Base URL first.'); return; }
    try {
      setStatus(`Testing ${value}...`);
      const result = await probe(value);
      writeBaseUrl(result.baseUrl);
      ['generic-openai-llm-model','generic-openai-tts-model','generic-openai-stt-model'].forEach(id => populateModelList(id, result.models));
      syncModelInput(STORAGE.llm, 'generic-openai-llm-model', result.models);
      syncModelInput(STORAGE.tts, 'generic-openai-tts-model', result.models);
      syncModelInput(STORAGE.stt, 'generic-openai-stt-model', result.models);
      setStatus(`Connected: ${result.baseUrl} — ${result.models.length} model(s) found`, true);
      return result;
    } catch (error) { setStatus(error.message, false); return null; }
  }

  function inject() {
    const wrapper = document.getElementById('provider-bridge-ui');
    const baseInput = document.getElementById('generic-openai-base-url');
    if (!wrapper || !baseInput || document.getElementById('local-detect-section')) return;
    const section = document.createElement('div');
    section.id = 'local-detect-section';
    section.className = 'setting-section provider-bridge-subsection';
    section.innerHTML = `
      <p>Local Server Connection:</p>
      <span class="provider-bridge-note">Uses the browser-compatible local bridge on port 8090 first, then direct llama-server on 8080.</span>
      <div class="provider-bridge-row" style="margin-top:8px; flex-wrap:wrap;">
        <button id="local-detect-btn" type="button" class="btn-secondary provider-bridge-refresh">Detect Local Server</button>
        <button id="local-test-btn" type="button" class="btn-secondary provider-bridge-refresh">Test Current URL</button>
        <button id="local-use-manual-btn" type="button" class="btn-secondary provider-bridge-refresh">Use Manual URL</button>
      </div>
      <span id="local-detect-status" class="provider-bridge-status"></span>
    `;
    const apiKeySection = document.getElementById('generic-openai-api-key')?.closest('.setting-section');
    if (apiKeySection) wrapper.insertBefore(section, apiKeySection); else wrapper.appendChild(section);
    document.getElementById('local-detect-btn')?.addEventListener('click', autoDetect);
    document.getElementById('local-test-btn')?.addEventListener('click', testManual);
    document.getElementById('local-use-manual-btn')?.addEventListener('click', () => {
      localStorage.setItem(STORAGE.mode, 'manual');
      setStatus('Manual URL mode enabled.');
      baseInput.focus();
    });
  }

  const observer = new MutationObserver(inject);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject, { once: true }); else inject();
})();
