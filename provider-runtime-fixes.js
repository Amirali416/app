(() => {
  'use strict';

  function getAppClass() {
    try { return Function('return AIChatApp')(); } catch (_) { return null; }
  }

  function getTTSClass() {
    try { return Function('return AdvancedTTSPlayer')(); } catch (_) { return null; }
  }

  function authHeaders(apiKey) {
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  }

  function normalizeBaseUrl(raw) {
    let url = String(raw || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/\/v1$/i.test(url)) url += '/v1';
    return url;
  }

  function errorText(error) {
    return error?.message || String(error || 'Unknown error');
  }

  function normalizeCacheText(text) {
    return String(text || '').trim().toLowerCase();
  }

  function looksLikeTranslationModel(model) {
    return /(hy-?mt|translation|translator|nllb|madlad|m2m|seamless)/i.test(model || '');
  }

  function normalizeDictionaryResult(result) {
    const meanings = Array.isArray(result?.meanings) ? result.meanings : [];
    const synonyms = Array.isArray(result?.synonyms) ? result.synonyms : [];
    const antonyms = Array.isArray(result?.antonyms) ? result.antonyms : [];

    return {
      meanings: meanings.map(item => ({
        text: String(item?.text ?? item?.meaning ?? '').trim(),
        type: String(item?.type ?? item?.partOfSpeech ?? item?.pos ?? '').trim()
      })).filter(item => item.text),
      synonyms: synonyms.map(value => String(value ?? '').trim()).filter(Boolean),
      antonyms: antonyms.map(value => String(value ?? '').trim()).filter(Boolean)
    };
  }

  function extractJson(content) {
    let text = String(content || '').trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) text = text.slice(first, last + 1);
    return JSON.parse(text);
  }

  async function readMeaningCache(app, text) {
    const key = normalizeCacheText(text);
    if (!key || !app?.db) return null;
    try {
      const cached = await app.db.get('word_meanings', key);
      if (cached?.value) return cached.value;
    } catch (error) {
      console.warn('Meaning/translation cache read failed:', error);
    }
    return null;
  }

  async function writeMeaningCache(app, text, value) {
    const key = normalizeCacheText(text);
    if (!key || !app?.db || !value) return false;
    try {
      await app.db.set('word_meanings', { word: key, value });
      return true;
    } catch (error) {
      console.error('Meaning/translation cache write failed:', error);
      return false;
    }
  }

  async function browserSpeak(text) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      throw new Error('Browser/Windows speech engine is unavailable.');
    }

    const value = String(text || '').trim();
    if (!value) return;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = /[\u0600-\u06FF]/.test(value) ? 'fa-IR' : 'en-US';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => {
      const lang = String(v.lang || '').toLowerCase();
      return utterance.lang.startsWith('fa') ? lang.startsWith('fa') : lang.startsWith('en');
    });
    if (preferred) utterance.voice = preferred;

    await new Promise((resolve, reject) => {
      utterance.onend = resolve;
      utterance.onerror = event => reject(new Error(`Browser TTS failed: ${event.error || 'unknown error'}`));
      speechSynthesis.speak(utterance);
    });
  }

  function patchWordMeaning(AppClass) {
    AppClass.prototype.getWordMeaningGenericOpenAI = async function(word) {
      const cached = await readMeaningCache(this, word);
      if (cached) return cached;

      const cfg = this.getProviderConfig();
      if (!cfg.genericBaseUrl || !cfg.genericLlmModel) {
        return { meanings: [{ text: 'OpenAI-compatible LLM is not configured.', type: 'Error' }], synonyms: [], antonyms: [] };
      }

      const model = cfg.genericLlmModel;
      const translationModel = looksLikeTranslationModel(model);
      const prompt = translationModel
        ? `You are translating ONE English dictionary entry into Persian/Farsi.\n\nReturn ONLY one valid JSON object. Do not write markdown, explanations, or any text outside the JSON.\n\nThe JSON structure MUST be EXACTLY:\n{\n  "meanings": [\n    {"text": "", "type": ""},\n    {"text": "", "type": ""}\n  ],\n  "synonyms": [],\n  "antonyms": []\n}\n\nRules:\n1. Keep the keys exactly: meanings, synonyms, antonyms.\n2. meanings must contain the common Persian translations of the English word.\n3. meanings[].text MUST be Persian/Farsi.\n4. meanings[].type MUST be Persian, using terms such as اسم، فعل، صفت، قید، حرف اضافه، حرف ربط.\n5. synonyms and antonyms MUST remain English words.\n6. Do not add, remove, rename, or reorder the JSON keys.\n7. Return 2-5 useful meanings when possible.\n8. Return useful English synonyms and antonyms when they are clear; otherwise use an empty array.\n9. Do not translate the JSON keys.\n\nEnglish word:\n${word}`
        : `You are an expert English-Persian dictionary.\n\nReturn ONLY one valid JSON object with EXACTLY this structure:\n{\n  "meanings": [\n    {"text": "رایج‌ترین معنی فارسی", "type": "اسم"},\n    {"text": "معنی دوم فارسی", "type": "اسم"}\n  ],\n  "synonyms": ["synonym1", "synonym2"],\n  "antonyms": ["antonym1", "antonym2"]\n}\n\nRules:\n1. Keep the keys exactly: meanings, synonyms, antonyms.\n2. meanings[].text MUST be Persian.\n3. meanings[].type MUST be Persian.\n4. synonyms and antonyms MUST be English.\n5. Return 3-5 common meanings when possible.\n6. Return useful synonyms and antonyms when applicable.\n7. JSON only; no markdown or explanation.\n\nEnglish word:\n${word}`;

      try {
        const response = await fetch(`${normalizeBaseUrl(cfg.genericBaseUrl)}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.genericApiKey) },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            top_p: 0.6,
            top_k: 20,
            repetition_penalty: 1.05,
            max_tokens: 512
          })
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Dictionary request failed (${response.status}): ${body.slice(0, 500)}`);
        }

        const data = await response.json();
        const content = String(data?.choices?.[0]?.message?.content || '').trim();
        if (!content) throw new Error('The local model returned an empty response.');

        const result = normalizeDictionaryResult(extractJson(content));
        if (!result.meanings.length) throw new Error('The local model returned no meanings.');

        await writeMeaningCache(this, word, result);
        return result;
      } catch (error) {
        console.error('Generic word dictionary error:', error);
        return {
          meanings: [{ text: errorText(error), type: 'Error' }],
          synonyms: [],
          antonyms: []
        };
      }
    };
  }

  function patchSelectedTextTranslation(AppClass) {
    AppClass.prototype.translateTextGenericOpenAI = async function(text) {
      const cached = await readMeaningCache(this, text);
      if (cached?.meanings?.length) return cached.meanings[0].text;

      const cfg = this.getProviderConfig();
      if (!cfg.genericBaseUrl || !cfg.genericLlmModel) return 'Translation requires an OpenAI-compatible LLM configuration.';

      const response = await fetch(`${normalizeBaseUrl(cfg.genericBaseUrl)}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.genericApiKey) },
        body: JSON.stringify({
          model: cfg.genericLlmModel,
          messages: [{ role: 'user', content: `Translate this text to Persian/Farsi. Provide only the translation without any additional explanation:\n\n${text}` }],
          temperature: 0.2,
          top_p: 0.6,
          top_k: 20,
          repetition_penalty: 1.05,
          max_tokens: 1024
        })
      });
      if (!response.ok) throw await (async () => {
        const body = await response.text().catch(() => '');
        return new Error(`Translation request failed (${response.status}): ${body.slice(0, 500)}`);
      })();

      const data = await response.json();
      const translation = String(data?.choices?.[0]?.message?.content || '').trim();
      if (!translation) throw new Error('The local model returned an empty translation.');

      await writeMeaningCache(this, text, {
        meanings: [{ text: translation, type: 'ترجمه' }],
        synonyms: [],
        antonyms: []
      });
      return translation;
    };

    AppClass.prototype.translateTextOpenRouter = async function(text) {
      const cached = await readMeaningCache(this, text);
      if (cached?.meanings?.length) return cached.meanings[0].text;

      const cfg = this.getProviderConfig();
      if (!cfg.openrouterApiKey || !cfg.openrouterLlmModel) return 'Translation requires an OpenRouter configuration.';
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.openrouterApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.openrouterLlmModel,
          messages: [{ role: 'user', content: `Translate this text to Persian/Farsi. Provide only the translation without any additional explanation:\n\n${text}` }],
          temperature: 0.2
        })
      });
      if (!response.ok) throw await (async () => {
        const body = await response.text().catch(() => '');
        return new Error(`OpenRouter translation request failed (${response.status}): ${body.slice(0, 500)}`);
      })();
      const data = await response.json();
      const translation = String(data?.choices?.[0]?.message?.content || '').trim();
      if (!translation) throw new Error('OpenRouter returned an empty translation.');

      await writeMeaningCache(this, text, {
        meanings: [{ text: translation, type: 'ترجمه' }],
        synonyms: [],
        antonyms: []
      });
      return translation;
    };
  }

  function patchBasicTTS(AppClass) {
    const originalPlayTextToSpeech = AppClass.prototype.playTextToSpeech;
    if (AppClass.prototype.__runtimeTtsFallbackPatched) return;
    AppClass.prototype.__runtimeTtsFallbackPatched = true;

    AppClass.prototype.playTextToSpeech = async function(text, button, progressBar, messageId) {
      if (this.ttsProvider !== 'openrouter' && this.ttsProvider !== 'openai_compatible') {
        return originalPlayTextToSpeech.call(this, text, button, progressBar, messageId);
      }

      try {
        const cfg = this.getProviderConfig();
        const baseUrl = this.ttsProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : normalizeBaseUrl(cfg.genericBaseUrl);
        const apiKey = this.ttsProvider === 'openrouter' ? cfg.openrouterApiKey : cfg.genericApiKey;
        const model = this.ttsProvider === 'openrouter' ? cfg.openrouterTtsModel : cfg.genericTtsModel;
        if (!baseUrl || !model) throw new Error('TTS server/model is not configured.');

        const cachedAudio = await this.db.get('audio_cache', text).catch(() => null);
        if (cachedAudio?.value) {
          await this.playAudio(cachedAudio.value, button, progressBar);
          return;
        }

        const response = await fetch(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
          body: JSON.stringify({ model, input: text, voice: 'alloy', response_format: 'mp3' })
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`TTS request failed (${response.status}): ${body.slice(0, 400)}`);
        }
        const blob = await response.blob();
        await this.db.set('audio_cache', { text, value: blob }).catch(error => console.error('TTS cache write failed:', error));
        await this.playAudio(blob, button, progressBar);
      } catch (error) {
        console.warn('API TTS unavailable; falling back to browser/Windows speech:', error);
        try {
          await browserSpeak(text);
        } catch (fallbackError) {
          console.error('Browser TTS fallback failed:', fallbackError);
          this.showToast(`TTS failed: ${errorText(fallbackError)}`, 'error');
        }
      }
    };
  }

  function patchAdvancedTTS(TTSClass) {
    if (!TTSClass || TTSClass.__runtimeTtsFallbackPatched) return;
    TTSClass.__runtimeTtsFallbackPatched = true;

    const originalGenerateFullAudio = TTSClass.prototype.generateFullAudio;
    const originalStartPlayback = TTSClass.prototype.startPlayback;
    const originalTogglePlayPause = TTSClass.prototype.togglePlayPause;
    const originalPreviousSentence = TTSClass.prototype.previousSentence;
    const originalNextSentence = TTSClass.prototype.nextSentence;
    const originalStop = TTSClass.prototype.stop;

    TTSClass.prototype.generateFullAudio = async function(text) {
      if (this.app?.ttsProvider !== 'openrouter' && this.app?.ttsProvider !== 'openai_compatible') {
        return originalGenerateFullAudio.call(this, text);
      }

      const cfg = this.app.getProviderConfig();
      const baseUrl = this.app.ttsProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : normalizeBaseUrl(cfg.genericBaseUrl);
      const apiKey = this.app.ttsProvider === 'openrouter' ? cfg.openrouterApiKey : cfg.genericApiKey;
      const model = this.app.ttsProvider === 'openrouter' ? cfg.openrouterTtsModel : cfg.genericTtsModel;
      this.__browserTtsFallbackText = '';

      try {
        if (!baseUrl || !model) throw new Error('TTS server/model is not configured.');
        const cacheKey = `full_${text}`;
        const cachedAudio = await this.app.db.get('audio_cache', cacheKey).catch(() => null);
        if (cachedAudio?.value) return cachedAudio.value;

        const response = await fetch(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
          body: JSON.stringify({ model, input: text, voice: 'alloy', response_format: 'mp3' })
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`TTS request failed (${response.status}): ${body.slice(0, 400)}`);
        }
        const blob = await response.blob();
        await this.app.db.set('audio_cache', { text: cacheKey, value: blob }).catch(error => console.error('Advanced TTS cache write failed:', error));
        return blob;
      } catch (error) {
        console.warn('Advanced API TTS unavailable; browser fallback will be used:', error);
        this.__browserTtsFallbackText = text;
        return null;
      }
    };

    TTSClass.prototype.startBrowserSpeech = function() {
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        this.app.showToast('Browser/Windows speech engine is unavailable.', 'error');
        return;
      }

      this.__browserTtsActive = true;
      this.isPlaying = true;
      this.isPaused = false;
      this.currentSentenceIndex = Math.max(0, Math.min(this.currentSentenceIndex, this.sentences.length - 1));
      speechSynthesis.cancel();
      this.__speakBrowserSentence(this.currentSentenceIndex);
    };

    TTSClass.prototype.__speakBrowserSentence = function(index) {
      if (!this.__browserTtsActive) return;
      if (index < 0 || index >= this.sentences.length) {
        this.__browserTtsActive = false;
        this.isPlaying = false;
        this.isPaused = false;
        this.clearAllHighlights();
        this.updatePlayPauseButton();
        return;
      }

      const sentence = String(this.sentences[index] || '').trim();
      this.currentSentenceIndex = index;
      this.lastHighlightedSentence = -1;
      this.clearSentenceHighlight();
      this.highlightSentence(index);
      if (this.progressText) this.progressText.textContent = `${index + 1} / ${this.sentences.length}`;
      if (this.progressFill) this.progressFill.style.width = `${((index + 1) / Math.max(1, this.sentences.length)) * 100}%`;
      this.updatePlayPauseButton();

      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = /[\u0600-\u06FF]/.test(sentence) ? 'fa-IR' : 'en-US';
      utterance.rate = this.playbackRate || 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      const voice = speechSynthesis.getVoices().find(v => {
        const lang = String(v.lang || '').toLowerCase();
        return utterance.lang.startsWith('fa') ? lang.startsWith('fa') : lang.startsWith('en');
      });
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        if (!this.__browserTtsActive || this.isPaused) return;
        const next = index + 1;
        if (next < this.sentences.length) {
          this.__speakBrowserSentence(next);
        } else {
          this.__browserTtsActive = false;
          this.isPlaying = false;
          this.isPaused = false;
          this.clearAllHighlights();
          this.updatePlayPauseButton();
        }
      };
      utterance.onerror = event => {
        if (!this.__browserTtsActive) return;
        this.__browserTtsActive = false;
        this.isPlaying = false;
        this.isPaused = false;
        console.error('Browser sentence TTS error:', event.error);
        this.app.showToast(`TTS failed: ${event.error || 'unknown error'}`, 'error');
        this.updatePlayPauseButton();
      };

      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    };

    TTSClass.prototype.startPlayback = async function() {
      const audioBlob = await this.generateFullAudio(this.fullText);

      if (!audioBlob && this.__browserTtsFallbackText) {
        this.startBrowserSpeech();
        return;
      }

      if (!audioBlob) {
        this.app.showToast('Failed to generate audio.', 'error');
        return;
      }

      const originalGenerate = this.generateFullAudio;
      this.generateFullAudio = async () => audioBlob;
      try {
        await originalStartPlayback.call(this);
      } finally {
        this.generateFullAudio = originalGenerate;
      }
    };

    TTSClass.prototype.togglePlayPause = function() {
      if (!this.__browserTtsActive) {
        return originalTogglePlayPause.call(this);
      }

      if (this.isPaused) {
        this.isPaused = false;
        this.isPlaying = true;
        this.__speakBrowserSentence(this.currentSentenceIndex);
      } else {
        speechSynthesis.cancel();
        this.isPaused = true;
        this.isPlaying = false;
        this.updatePlayPauseButton();
      }
    };

    TTSClass.prototype.previousSentence = async function() {
      if (!this.__browserTtsActive) {
        return originalPreviousSentence.call(this);
      }
      speechSynthesis.cancel();
      this.currentSentenceIndex = Math.max(0, this.currentSentenceIndex - 1);
      this.isPaused = false;
      this.isPlaying = true;
      this.__speakBrowserSentence(this.currentSentenceIndex);
    };

    TTSClass.prototype.nextSentence = async function() {
      if (!this.__browserTtsActive) {
        return originalNextSentence.call(this);
      }
      speechSynthesis.cancel();
      this.currentSentenceIndex = Math.min(this.sentences.length - 1, this.currentSentenceIndex + 1);
      this.isPaused = false;
      this.isPlaying = true;
      this.__speakBrowserSentence(this.currentSentenceIndex);
    };

    TTSClass.prototype.stop = function() {
      if (!this.__browserTtsActive) {
        return originalStop.call(this);
      }
      speechSynthesis.cancel();
      this.__browserTtsActive = false;
      this.isPlaying = false;
      this.isPaused = false;
      this.clearAllHighlights();
      this.updatePlayPauseButton();
      this.updateProgressDisplay();
    };
  }

  function patch() {
    const AppClass = getAppClass();
    if (!AppClass) return;
    patchWordMeaning(AppClass);
    patchSelectedTextTranslation(AppClass);
    patchBasicTTS(AppClass);
    patchAdvancedTTS(getTTSClass());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patch, { once: true });
  } else {
    patch();
  }
})();
