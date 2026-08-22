(() => {
  'use strict';

  const STORAGE_KEY = 'generic_openai_base_url';
  const MODE_KEY = 'generic_openai_connection_mode';
  const LAST_FOUND_KEY = 'generic_openai_last_detected_url';

  const normalize = (raw) => {
    let value = String(raw || '').trim().replace(/\/+$/, '');
    if (!value) return '';
    if (!/\/v1$/i.test(value)) value += '/v1';
    return value;
  };

  const candidates = () => {
    const saved = localStorage.getItem(STORAGE_KEY) || '';
    const last = localStorage.getItem(LAST_FOUND_KEY) || '';
    const list = [
      'http://127.0.0.1:8080/v1',
      'http://localhost:8080/v1',
      normalize(last),
      normalize(saved),
      'http://192.168.88.50:8080/v1'
    ].filter(Boolean);
    return [...new Set(list)];
  };

  async function probe(baseUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    try {
      const response = await fetch(`${normalize(baseUrl)}/models`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const models = Array.isArray(data?.data) ? data.data : [];
      return { baseUrl: normalize(baseUrl), models };
    } finally {
      clearTimeout(timeout);
    }
  }

  function setStatus(text, ok = false) {
    const el = document.getElementById('local-detect-status');
    if (!el) return;
    el.textContent = text;
    el.className = `provider-bridge-status ${ok ? 'ok' : ''}`;
  }

  function setBaseUrl(url) {
    const normalized = normalize(url);
    const input = document.getElementById('generic-openai-base-url');
    if (input) input.value = normalized;
    localStorage.setItem(STORAGE_KEY, normalized);
    localStorage.setItem(LAST_FOUND_KEY, normalized);
    localStorage.setItem(MODE_KEY, 'auto');
  }

  async function autoDetect() {
    const button = document.getElementById('local-detect-btn');
    if (button) {
      button.disabled = true;
      button.textContent = 'Detecting...';
    }

    const list = candidates();
    setStatus(`Checking ${list.length} local endpoint(s)...`);

    try {
      for (const candidate of list) {
        try {
          const result = await probe(candidate);
          setBaseUrl(result.baseUrl);
          const modelText = result.models.length
            ? `${result.models.length} model(s) found`
            : 'Server found; no models were returned';
          setStatus(`Connected: ${result.baseUrl} — ${modelText}`, true);

          const llm = document.getElementById('generic-openai-llm-model');
          const datalist = document.getElementById('generic-openai-llm-models-list');
          if (datalist) {
            datalist.innerHTML = '';
            result.models.forEach(model => {
              const id = model?.id || model?.name;
              if (!id) return;
              const option = document.createElement('option');
              option.value = id;
              option.label = model?.name ? `${model.name} — ${id}` : id;
              datalist.appendChild(option);
            });
          }
          if (llm && !llm.value && result.models.length === 1) llm.value = result.models[0]?.id || result.models[0]?.name || '';
          return result;
        } catch (_) {
          // Try the next endpoint.
        }
      }
      throw new Error('No reachable OpenAI-compatible server was found.');
    } catch (error) {
      setStatus(error.message, false);
      return null;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Detect Local Server';
      }
    }
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
      <span class="provider-bridge-note">Auto Detect first checks this computer (127.0.0.1 / localhost), then the last saved server and the default LAN address 192.168.88.50.</span>
      <div class="provider-bridge-row" style="margin-top:8px;">
        <button id="local-detect-btn" type="button" class="btn-secondary provider-bridge-refresh">Detect Local Server</button>
        <button id="local-use-manual-btn" type="button" class="btn-secondary provider-bridge-refresh">Use Manual URL</button>
      </div>
      <span id="local-detect-status" class="provider-bridge-status"></span>
    `;

    wrapper.insertBefore(section, wrapper.querySelector('#generic-openai-api-key')?.closest('.setting-section') || null);

    document.getElementById('local-detect-btn')?.addEventListener('click', autoDetect);
    document.getElementById('local-use-manual-btn')?.addEventListener('click', () => {
      localStorage.setItem(MODE_KEY, 'manual');
      setStatus('Manual URL mode enabled.');
      baseInput.focus();
    });
  }

  function patch() {
    inject();
  }

  const observer = new MutationObserver(() => inject());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch, { once: true });
  else patch();
})();
