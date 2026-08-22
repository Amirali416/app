(() => {
  'use strict';

  const STORAGE = {
    genericBaseUrl: 'generic_openai_base_url',
    genericApiKey: 'generic_openai_api_key',
    genericLlmModel: 'generic_openai_llm_model',
    genericTtsModel: 'generic_openai_tts_model',
    genericSttModel: 'generic_openai_stt_model',
    openrouterLlmModel: 'openrouter_llm_model',
    openrouterTtsModel: 'openrouter_tts_model',
    openrouterSttModel: 'openrouter_stt_model',
    sttProvider: 'stt_provider'
  };

  const defaults = {
    genericBaseUrl: 'http://127.0.0.1:8080/v1',
    genericLlmModel: '',
    genericTtsModel: '',
    genericSttModel: '',
    openrouterLlmModel: 'google/gemma-3-27b-it:free',
    openrouterTtsModel: 'openai/gpt-4o-mini-tts-2025-12-15',
    openrouterSttModel: 'openai/whisper-1',
    sttProvider: 'browser'
  };

  const getStored = (key, fallback = '') => {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  };

  const setStored = (key, value) => localStorage.setItem(key, value ?? '');

  const getConfig = () => ({
    genericBaseUrl: getStored(STORAGE.genericBaseUrl, defaults.genericBaseUrl),
    genericApiKey: getStored(STORAGE.genericApiKey, ''),
    genericLlmModel: getStored(STORAGE.genericLlmModel, defaults.genericLlmModel),
    genericTtsModel: getStored(STORAGE.genericTtsModel, defaults.genericTtsModel),
    genericSttModel: getStored(STORAGE.genericSttModel, defaults.genericSttModel),
    openrouterLlmModel: getStored(STORAGE.openrouterLlmModel, defaults.openrouterLlmModel),
    openrouterTtsModel: getStored(STORAGE.openrouterTtsModel, defaults.openrouterTtsModel),
    openrouterSttModel: getStored(STORAGE.openrouterSttModel, defaults.openrouterSttModel),
    sttProvider: getStored(STORAGE.sttProvider, defaults.sttProvider)
  });

  const normalizeBaseUrl = (raw) => {
    let url = String(raw || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/\/v1$/i.test(url)) url += '/v1';
    return url;
  };

  const authHeaders = (apiKey) => apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  const parseError = async (response, prefix) => {
    let detail = '';
    try {
      const text = await response.text();
      detail = text ? `: ${text.slice(0, 600)}` : '';
    } catch (_) {}
    return new Error(`${prefix} (${response.status} ${response.statusText})${detail}`);
  };

  async function fetchModels(baseUrl, apiKey) {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
      headers: { ...authHeaders(apiKey) }
    });
    if (!response.ok) throw await parseError(response, 'Model list request failed');
    const data = await response.json();
    return Array.isArray(data?.data) ? data.data : [];
  }

  async function fetchOpenRouterModels(query = '') {
    const url = new URL('https://openrouter.ai/api/v1/models');
    if (query) url.searchParams.set('output_modalities', query);
    const key = localStorage.getItem('openrouter_api_key') || '';
    const response = await fetch(url.toString(), { headers: authHeaders(key) });
    if (!response.ok) throw await parseError(response, 'OpenRouter model list request failed');
    const data = await response.json();
    return Array.isArray(data?.data) ? data.data : [];
  }

  const modelId = model => model?.id || model?.name || '';
  const modelLabel = model => model?.name ? `${model.name} — ${modelId(model)}` : modelId(model);

  function setDatalistOptions(inputId, models) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const listId = input.getAttribute('list');
    const list = listId ? document.getElementById(listId) : null;
    if (!list) return;
    list.innerHTML = '';
    const seen = new Set();
    models.forEach(model => {
      const id = modelId(model);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const option = document.createElement('option');
      option.value = id;
      option.label = modelLabel(model);
      list.appendChild(option);
    });
  }

  function injectStyles() {
    if (document.getElementById('provider-bridge-styles')) return;
    const style = document.createElement('style');
    style.id = 'provider-bridge-styles';
    style.textContent = `
      .provider-bridge-note { display:block; margin-top:6px; color:#777; font-size:11px; line-height:1.45; }
      .provider-bridge-row { display:flex; gap:8px; align-items:center; }
      .provider-bridge-row > input { flex:1; min-width:0; }
      .provider-bridge-refresh { white-space:nowrap; }
      .provider-bridge-status { display:block; margin-top:6px; min-height:16px; font-size:11px; }
      .provider-bridge-status.ok { color:#238636; }
      .provider-bridge-status.error { color:#c62828; }
      .provider-bridge-subsection { border-top:1px solid rgba(127,127,127,.18); padding-top:10px; margin-top:10px; }
    `;
    document.head.appendChild(style);
  }

  function makeField({ id, label, type = 'text', value = '', placeholder = '', parent, listId }) {
    const section = document.createElement('div');
    section.className = 'setting-section';
    const p = document.createElement('p');
    p.textContent = label;
    section.appendChild(p);
    const input = document.createElement('input');
    input.id = id;
    input.type = type;
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (listId) input.setAttribute('list', listId);
    section.appendChild(input);
    parent.appendChild(section);
    return input;
  }

  function makeModelField({ id, label, value, listId, datalistId, refresh }) {
    const section = document.createElement('div');
    section.className = 'setting-section provider-bridge-model-section';
    const p = document.createElement('p');
    p.textContent = label;
    section.appendChild(p);
    const row = document.createElement('div');
    row.className = 'provider-bridge-row';
    const input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.value = value || '';
    input.placeholder = 'Type model ID manually or choose a suggestion';
    input.autocomplete = 'off';
    input.setAttribute('list', listId);
    const datalist = document.createElement('datalist');
    datalist.id = datalistId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary provider-bridge-refresh';
    button.textContent = 'Refresh';
    button.addEventListener('click', refresh);
    row.appendChild(input);
    row.appendChild(button);
    section.appendChild(row);
    return { section, input, datalist, button };
  }

  function injectSettingsUI() {
    if (document.getElementById('provider-bridge-ui')) return;
    injectStyles();
    const modalScroll = document.querySelector('#settings-modal .modal-scroll');
    if (!modalScroll) return;

    const cfg = getConfig();
    const wrapper = document.createElement('div');
    wrapper.id = 'provider-bridge-ui';

    const openAiSection = document.createElement('div');
    openAiSection.className = 'setting-section';
    openAiSection.innerHTML = `
      <p>OpenAI-Compatible Local / Custom Provider:</p>
      <span class="provider-bridge-note">Works with llama.cpp, LM Studio, vLLM and other OpenAI-compatible servers. For your laptop use e.g. http://192.168.88.50:8080/v1</span>
    `;
    wrapper.appendChild(openAiSection);

    makeField({ id: 'generic-openai-base-url', label: 'Base URL', value: cfg.genericBaseUrl, placeholder: 'http://192.168.88.50:8080/v1', parent: wrapper });
    makeField({ id: 'generic-openai-api-key', label: 'API Key', type: 'password', value: cfg.genericApiKey, placeholder: 'Optional for local servers', parent: wrapper });

    const genericLlm = makeModelField({
      id: 'generic-openai-llm-model',
      label: 'LLM Model',
      value: cfg.genericLlmModel,
      listId: 'generic-openai-llm-models-list',
      datalistId: 'generic-openai-llm-models-list',
      refresh: async () => {
        const status = document.getElementById('generic-provider-status');
        try {
          const models = await fetchModels(document.getElementById('generic-openai-base-url')?.value, document.getElementById('generic-openai-api-key')?.value);
          setDatalistOptions('generic-openai-llm-model', models);
          if (status) { status.textContent = `${models.length} model(s) loaded`; status.className = 'provider-bridge-status ok'; }
        } catch (error) {
          if (status) { status.textContent = error.message; status.className = 'provider-bridge-status error'; }
        }
      }
    });
    wrapper.appendChild(genericLlm.section);
    wrapper.appendChild(genericLlm.datalist);

    const genericTts = makeModelField({
      id: 'generic-openai-tts-model',
      label: 'TTS Model',
      value: cfg.genericTtsModel,
      listId: 'generic-openai-tts-models-list',
      datalistId: 'generic-openai-tts-models-list',
      refresh: async () => {
        const status = document.getElementById('generic-provider-status');
        try {
          const models = await fetchModels(document.getElementById('generic-openai-base-url')?.value, document.getElementById('generic-openai-api-key')?.value);
          setDatalistOptions('generic-openai-tts-model', models);
          if (status) { status.textContent = `${models.length} model(s) loaded. Choose a TTS-capable one manually.`; status.className = 'provider-bridge-status ok'; }
        } catch (error) {
          if (status) { status.textContent = error.message; status.className = 'provider-bridge-status error'; }
        }
      }
    });
    wrapper.appendChild(genericTts.section);
    wrapper.appendChild(genericTts.datalist);

    const genericStt = makeModelField({
      id: 'generic-openai-stt-model',
      label: 'STT / Transcription Model',
      value: cfg.genericSttModel,
      listId: 'generic-openai-stt-models-list',
      datalistId: 'generic-openai-stt-models-list',
      refresh: async () => {
        const status = document.getElementById('generic-provider-status');
        try {
          const models = await fetchModels(document.getElementById('generic-openai-base-url')?.value, document.getElementById('generic-openai-api-key')?.value);
          setDatalistOptions('generic-openai-stt-model', models);
          if (status) { status.textContent = `${models.length} model(s) loaded. Choose a transcription-capable one manually.`; status.className = 'provider-bridge-status ok'; }
        } catch (error) {
          if (status) { status.textContent = error.message; status.className = 'provider-bridge-status error'; }
        }
      }
    });
    wrapper.appendChild(genericStt.section);
    wrapper.appendChild(genericStt.datalist);

    const genericStatus = document.createElement('span');
    genericStatus.id = 'generic-provider-status';
    genericStatus.className = 'provider-bridge-status';
    wrapper.appendChild(genericStatus);

    const orSection = document.createElement('div');
    orSection.className = 'setting-section provider-bridge-subsection';
    orSection.innerHTML = `
      <p>OpenRouter Model Configuration:</p>
      <span class="provider-bridge-note">LLM, TTS and STT models are pulled from OpenRouter's live model catalog. You can also type any valid model ID manually.</span>
    `;
    wrapper.appendChild(orSection);

    const orLlm = makeModelField({
      id: 'openrouter-llm-model',
      label: 'OpenRouter LLM Model',
      value: cfg.openrouterLlmModel,
      listId: 'openrouter-llm-models-list',
      datalistId: 'openrouter-llm-models-list',
      refresh: async () => {
        const status = document.getElementById('openrouter-provider-status');
        try {
          const models = await fetchOpenRouterModels();
          setDatalistOptions('openrouter-llm-model', models.filter(m => (m?.architecture?.output_modalities || ['text']).includes('text')));
          if (status) { status.textContent = `${models.length} OpenRouter models loaded`; status.className = 'provider-bridge-status ok'; }
        } catch (error) {
          if (status) { status.textContent = error.message; status.className = 'provider-bridge-status error'; }
        }
      }
    });
    wrapper.appendChild(orLlm.section);
    wrapper.appendChild(orLlm.datalist);

    const orTts = makeModelField({
      id: 'openrouter-tts-model',
      label: 'OpenRouter TTS Model',
      value: cfg.openrouterTtsModel,
      listId: 'openrouter-tts-models-list',
      datalistId: 'openrouter-tts-models-list',
      refresh: async () => {
        const status = document.getElementById('openrouter-provider-status');
        try {
          const models = await fetchOpenRouterModels('audio');
          setDatalistOptions('openrouter-tts-model', models);
          if (status) { status.textContent = `${models.length} audio-capable model(s) loaded`; status.className = 'provider-bridge-status ok'; }
        } catch (error) {
          if (status) { status.textContent = error.message; status.className = 'provider-bridge-status error'; }
        }
      }
    });
    wrapper.appendChild(orTts.section);
    wrapper.appendChild(orTts.datalist);

    const orStt = makeModelField({
      id: 'openrouter-stt-model',
      label: 'OpenRouter STT / Transcription Model',
      value: cfg.openrouterSttModel,
      listId: 'openrouter-stt-models-list',
      datalistId: 'openrouter-stt-models-list',
      refresh: async () => {
        const status = document.getElementById('openrouter-provider-status');
        try {
          const models = await fetchOpenRouterModels('transcription');
          setDatalistOptions('openrouter-stt-model', models);
          if (status) { status.textContent = `${models.length} transcription model(s) loaded`; status.className = 'provider-bridge-status ok'; }
        } catch (error) {
          if (status) { status.textContent = error.message; status.className = 'provider-bridge-status error'; }
        }
      }
    });
    wrapper.appendChild(orStt.section);
    wrapper.appendChild(orStt.datalist);

    const orStatus = document.createElement('span');
    orStatus.id = 'openrouter-provider-status';
    orStatus.className = 'provider-bridge-status';
    wrapper.appendChild(orStatus);

    const sttSection = document.createElement('div');
    sttSection.className = 'setting-section provider-bridge-subsection';
    const sttP = document.createElement('p');
    sttP.textContent = 'Voice Input / STT Provider:';
    sttSection.appendChild(sttP);
    const sttSelect = document.createElement('select');
    sttSelect.id = 'stt-provider-select';
    sttSelect.className = 'settings-select';
    sttSelect.innerHTML = `
      <option value="browser">Browser Speech Recognition</option>
      <option value="avalai">Provider 2 (Avalai)</option>
      <option value="openrouter">OpenRouter</option>
      <option value="openai_compatible">OpenAI-Compatible</option>
    `;
    sttSelect.value = cfg.sttProvider;
    sttSection.appendChild(sttSelect);
    wrapper.appendChild(sttSection);

    modalScroll.appendChild(wrapper);
  }

  function getAppClass() {
    try { return Function('return AIChatApp')(); } catch (_) { return null; }
  }

  function getTTSClass() {
    try { return Function('return AdvancedTTSPlayer')(); } catch (_) { return null; }
  }

  function patchApplication() {
    const AppClass = getAppClass();
    if (!AppClass || AppClass.__providerBridgePatched) return;
    AppClass.__providerBridgePatched = true;

    const originalInitElements = AppClass.prototype.initElements;
    AppClass.prototype.initElements = function(...args) {
      const result = originalInitElements.apply(this, args);
      window.__aiChatAppInstance = this;
      injectSettingsUI();
      return result;
    };

    const originalShowSettingsModal = AppClass.prototype.showSettingsModal;
    AppClass.prototype.showSettingsModal = function(...args) {
      const result = originalShowSettingsModal.apply(this, args);
      injectSettingsUI();
      const cfg = getConfig();
      const fields = {
        'generic-openai-base-url': cfg.genericBaseUrl,
        'generic-openai-api-key': cfg.genericApiKey,
        'generic-openai-llm-model': cfg.genericLlmModel,
        'generic-openai-tts-model': cfg.genericTtsModel,
        'generic-openai-stt-model': cfg.genericSttModel,
        'openrouter-llm-model': cfg.openrouterLlmModel,
        'openrouter-tts-model': cfg.openrouterTtsModel,
        'openrouter-stt-model': cfg.openrouterSttModel,
        'stt-provider-select': cfg.sttProvider
      };
      Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el && value !== undefined) el.value = value;
      });
      return result;
    };

    const originalSaveSettings = AppClass.prototype.saveSettings;
    AppClass.prototype.saveSettings = function(...args) {
      const result = originalSaveSettings.apply(this, args);
      const values = {
        [STORAGE.genericBaseUrl]: normalizeBaseUrl(document.getElementById('generic-openai-base-url')?.value || defaults.genericBaseUrl),
        [STORAGE.genericApiKey]: document.getElementById('generic-openai-api-key')?.value?.trim() || '',
        [STORAGE.genericLlmModel]: document.getElementById('generic-openai-llm-model')?.value?.trim() || '',
        [STORAGE.genericTtsModel]: document.getElementById('generic-openai-tts-model')?.value?.trim() || '',
        [STORAGE.genericSttModel]: document.getElementById('generic-openai-stt-model')?.value?.trim() || '',
        [STORAGE.openrouterLlmModel]: document.getElementById('openrouter-llm-model')?.value?.trim() || defaults.openrouterLlmModel,
        [STORAGE.openrouterTtsModel]: document.getElementById('openrouter-tts-model')?.value?.trim() || defaults.openrouterTtsModel,
        [STORAGE.openrouterSttModel]: document.getElementById('openrouter-stt-model')?.value?.trim() || defaults.openrouterSttModel,
        [STORAGE.sttProvider]: document.getElementById('stt-provider-select')?.value || defaults.sttProvider
      };
      Object.entries(values).forEach(([key, value]) => setStored(key, value));
      this.sttProvider = values[STORAGE.sttProvider];
      this.genericOpenAIBaseUrl = values[STORAGE.genericBaseUrl];
      this.genericOpenAIKey = values[STORAGE.genericApiKey];
      this.genericOpenAILLMModel = values[STORAGE.genericLlmModel];
      this.genericOpenAITTSModel = values[STORAGE.genericTtsModel];
      this.genericOpenAISTTModel = values[STORAGE.genericSttModel];
      this.openrouterLLMModel = values[STORAGE.openrouterLlmModel];
      this.openrouterTTSModel = values[STORAGE.openrouterTtsModel];
      this.openrouterSTTModel = values[STORAGE.openrouterSttModel];
      return result;
    };

    const originalCallChatAPI = AppClass.prototype.callChatAPI;
    AppClass.prototype.callChatAPI = function(message) {
      if (this.chatProvider === 'openrouter') return this.callOpenRouterChatAPI(message);
      if (this.chatProvider === 'openai_compatible') return this.callGenericOpenAIChatAPI(message);
      return originalCallChatAPI.call(this, message);
    };

    AppClass.prototype.getProviderConfig = function() {
      const cfg = getConfig();
      return {
        ...cfg,
        openrouterApiKey: this.OPENROUTER_API_KEY || localStorage.getItem('openrouter_api_key') || '',
        genericBaseUrl: normalizeBaseUrl(cfg.genericBaseUrl)
      };
    };

    AppClass.prototype.callGenericOpenAIChatAPI = async function(message) {
      const cfg = this.getProviderConfig();
      if (!cfg.genericBaseUrl) throw new Error('OpenAI-compatible Base URL is not configured.');
      if (!cfg.genericLlmModel) throw new Error('OpenAI-compatible LLM model is not configured.');
      const chat = this.chats.find(c => c.id === this.currentChatId);
      if (!chat) throw new Error('Chat not found');
      const history = chat.messages.filter(msg => msg.role !== 'system').slice(-10).map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content }));
      const response = await fetch(`${cfg.genericBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.genericApiKey) },
        body: JSON.stringify({ model: cfg.genericLlmModel, messages: [...history, { role: 'user', content: message }] })
      });
      if (!response.ok) throw await parseError(response, 'OpenAI-compatible chat request failed');
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'No response from the OpenAI-compatible provider.';
    };

    AppClass.prototype.callOpenRouterChatAPI = async function(message) {
      const cfg = this.getProviderConfig();
      if (!cfg.openrouterApiKey) throw new Error('OpenRouter API key is not set.');
      if (!cfg.openrouterLlmModel) throw new Error('OpenRouter LLM model is not configured.');
      const chat = this.chats.find(c => c.id === this.currentChatId);
      if (!chat) throw new Error('Chat not found');
      const history = chat.messages.filter(msg => msg.role !== 'system').slice(-10).map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content }));
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfg.openrouterApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.openrouterLlmModel, messages: [...history, { role: 'user', content: message }] })
      });
      if (!response.ok) throw await parseError(response, 'OpenRouter chat request failed');
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'No response from OpenRouter.';
    };

    const originalGetWordMeaning = AppClass.prototype.getWordMeaning;
    AppClass.prototype.getWordMeaning = function(word) {
      if (this.chatProvider === 'openai_compatible') return this.getWordMeaningGenericOpenAI(word);
      if (this.chatProvider === 'openrouter') return this.getWordMeaningOpenRouter(word);
      return originalGetWordMeaning.call(this, word);
    };

    AppClass.prototype.getWordMeaningGenericOpenAI = async function(word) {
      const cfg = this.getProviderConfig();
      if (!cfg.genericBaseUrl || !cfg.genericLlmModel) return { meanings: [{ text: 'OpenAI-compatible LLM is not configured.', type: 'Error' }], synonyms: [], antonyms: [] };
      const prompt = `You are an expert English-Persian dictionary. Analyze the word "${word}" comprehensively. Return strict JSON only with keys meanings, synonyms, antonyms. meanings must be an array of objects with text and type. Provide 3-5 common meanings, 5-10 synonyms and 3-5 antonyms when applicable.`;
      try {
        const response = await fetch(`${cfg.genericBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.genericApiKey) },
          body: JSON.stringify({ model: cfg.genericLlmModel, messages: [{ role: 'user', content: prompt }], temperature: 0.3, response_format: { type: 'json_object' } })
        });
        if (!response.ok) throw await parseError(response, 'Dictionary request failed');
        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '{}';
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first >= 0 && last > first) text = text.slice(first, last + 1);
        const result = JSON.parse(text);
        if (!Array.isArray(result.meanings)) throw new Error('Invalid dictionary JSON');
        return result;
      } catch (error) {
        console.error('Generic dictionary error:', error);
        return { meanings: [{ text: error.message, type: 'Error' }], synonyms: [], antonyms: [] };
      }
    };

    const originalTranslateText = AppClass.prototype.translateText;
    AppClass.prototype.translateText = function(text) {
      if (this.chatProvider === 'openai_compatible') return this.translateTextGenericOpenAI(text);
      if (this.chatProvider === 'openrouter') return this.translateTextOpenRouter(text);
      return originalTranslateText.call(this, text);
    };

    AppClass.prototype.translateTextGenericOpenAI = async function(text) {
      const cfg = this.getProviderConfig();
      if (!cfg.genericBaseUrl || !cfg.genericLlmModel) return 'Translation requires an OpenAI-compatible LLM configuration.';
      const response = await fetch(`${cfg.genericBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.genericApiKey) },
        body: JSON.stringify({ model: cfg.genericLlmModel, messages: [{ role: 'user', content: `Translate this text to Persian/Farsi. Provide only the translation without additional explanation: "${text}"` }] })
      });
      if (!response.ok) throw await parseError(response, 'Translation request failed');
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'Translation failed';
    };

    AppClass.prototype.translateTextOpenRouter = async function(text) {
      const cfg = this.getProviderConfig();
      if (!cfg.openrouterApiKey || !cfg.openrouterLlmModel) return 'Translation requires an OpenRouter configuration.';
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.openrouterApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.openrouterLlmModel, messages: [{ role: 'user', content: `Translate this text to Persian/Farsi. Provide only the translation without additional explanation: "${text}"` }] })
      });
      if (!response.ok) throw await parseError(response, 'OpenRouter translation request failed');
      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'Translation failed';
    };

    const originalPlayTextToSpeech = AppClass.prototype.playTextToSpeech;
    AppClass.prototype.playTextToSpeech = async function(text, button, progressBar, messageId) {
      if (this.ttsProvider === 'openrouter' || this.ttsProvider === 'openai_compatible') {
        const cfg = this.getProviderConfig();
        const model = this.ttsProvider === 'openrouter' ? cfg.openrouterTtsModel : cfg.genericTtsModel;
        const baseUrl = this.ttsProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : cfg.genericBaseUrl;
        const apiKey = this.ttsProvider === 'openrouter' ? cfg.openrouterApiKey : cfg.genericApiKey;
        if (!model) {
          this.showToast('TTS model is not configured.', 'error');
          return;
        }
        try {
          const response = await fetch(`${baseUrl}/audio/speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
            body: JSON.stringify({ model, input: text, voice: 'alloy', response_format: 'mp3' })
          });
          if (!response.ok) throw await parseError(response, 'TTS request failed');
          const blob = await response.blob();
          await this.playAudio(blob, button, progressBar);
        } catch (error) {
          console.error('TTS error:', error);
          this.showToast(error.message, 'error');
        }
        return;
      }
      return originalPlayTextToSpeech.call(this, text, button, progressBar, messageId);
    };

    const originalTranscribeAudio = AppClass.prototype.transcribeAudio;
    AppClass.prototype.transcribeAudio = function(audioBlob) {
      const provider = getConfig().sttProvider;
      if (provider === 'openrouter') return this.transcribeAudioWithProvider(audioBlob, 'openrouter');
      if (provider === 'openai_compatible') return this.transcribeAudioWithProvider(audioBlob, 'openai_compatible');
      return originalTranscribeAudio.call(this, audioBlob);
    };

    AppClass.prototype.transcribeAudioWithProvider = async function(audioBlob, provider) {
      const cfg = this.getProviderConfig();
      const baseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : cfg.genericBaseUrl;
      const apiKey = provider === 'openrouter' ? cfg.openrouterApiKey : cfg.genericApiKey;
      const model = provider === 'openrouter' ? cfg.openrouterSttModel : cfg.genericSttModel;
      if (!baseUrl || !model) throw new Error('STT provider is not configured.');
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', model);
      formData.append('language', 'en');
      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: formData
      });
      if (!response.ok) throw await parseError(response, 'Transcription request failed');
      const data = await response.json();
      const text = data.text || data.transcript || '';
      this.messageInput.value = text;
      this.adjustTextareaHeight();
      this.messageInput.focus();
      return text;
    };

    const originalStartRecording = AppClass.prototype.startRecording;
    AppClass.prototype.startRecording = async function() {
      const provider = getConfig().sttProvider;
      if (provider !== 'openrouter' && provider !== 'openai_compatible') return originalStartRecording.call(this);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];
        this.currentAudioStream = stream;
        this.mediaRecorder.ondataavailable = event => this.audioChunks.push(event.data);
        this.mediaRecorder.onstop = async () => {
          try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            await this.transcribeAudio(audioBlob);
          } catch (error) {
            console.error('STT error:', error);
            notificationManager.error(error.message);
          } finally {
            stream.getTracks().forEach(track => track.stop());
          }
        };
        this.mediaRecorder.start();
        this.isRecording = true;
        this.voiceBtn.classList.add('recording');
        this.voiceBtn.style.backgroundColor = '#ef4444';
        this.messageInput.placeholder = 'Recording... Click to stop';
      } catch (error) {
        console.error('Error accessing microphone:', error);
        notificationManager.error('Cannot access microphone. Please check permissions.');
      }
    };

    AppClass.prototype.getConfiguredModel = function(kind) {
      const cfg = this.getProviderConfig();
      if (kind === 'llm') return this.chatProvider === 'openrouter' ? cfg.openrouterLlmModel : cfg.genericLlmModel;
      if (kind === 'tts') return this.ttsProvider === 'openrouter' ? cfg.openrouterTtsModel : cfg.genericTtsModel;
      return cfg.sttProvider === 'openrouter' ? cfg.openrouterSttModel : cfg.genericSttModel;
    };

    const TTSClass = getTTSClass();
    if (TTSClass && !TTSClass.__providerBridgePatched) {
      TTSClass.__providerBridgePatched = true;
      const originalGenerateFullAudio = TTSClass.prototype.generateFullAudio;
      TTSClass.prototype.generateFullAudio = async function(text) {
        const provider = this.app?.ttsProvider;
        if (provider !== 'openrouter' && provider !== 'openai_compatible') return originalGenerateFullAudio.call(this, text);
        const cfg = this.app.getProviderConfig();
        const baseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : cfg.genericBaseUrl;
        const apiKey = provider === 'openrouter' ? cfg.openrouterApiKey : cfg.genericApiKey;
        const model = provider === 'openrouter' ? cfg.openrouterTtsModel : cfg.genericTtsModel;
        if (!model) throw new Error('TTS model is not configured.');
        const response = await fetch(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
          body: JSON.stringify({ model, input: text, voice: 'alloy', response_format: 'mp3' })
        });
        if (!response.ok) throw await parseError(response, 'TTS request failed');
        return response.blob();
      };
    }

    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        const app = window.__aiChatAppInstance;
        if (!app) return;
        app.sttProvider = getConfig().sttProvider;
        app.genericOpenAIBaseUrl = getConfig().genericBaseUrl;
        app.genericOpenAIKey = getConfig().genericApiKey;
      }, 0);
    });
  }

  patchApplication();
})();
