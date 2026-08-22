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

  function looksLikeTranslationModel(model) {
    return /(hy-?mt|translation|translator|nllb|madlad|m2m|seamless)/i.test(model || '');
  }

  async function browserSpeak(text) {
    if (!('speechSynthesis' in window)) {
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

  function patchWordMeaning(AppClass) {
    AppClass.prototype.getWordMeaningGenericOpenAI = async function(word) {
      const cfg = this.getProviderConfig();
      if (!cfg.genericBaseUrl || !cfg.genericLlmModel) {
        return { meanings: [{ text: 'OpenAI-compatible LLM is not configured.', type: 'Error' }], synonyms: [], antonyms: [] };
      }

      const model = cfg.genericLlmModel;
      const translationModel = looksLikeTranslationModel(model);

      const prompt = translationModel
        ? `You are translating ONE English dictionary entry into Persian/Farsi.

Return ONLY one valid JSON object. Do not write markdown, explanations, or any text outside the JSON.

The JSON structure MUST be EXACTLY:
{
  "meanings": [
    {"text": "", "type": ""},
    {"text": "", "type": ""}
  ],
  "synonyms": [],
  "antonyms": []
}

Rules:
1. Keep the keys exactly: meanings, synonyms, antonyms.
2. meanings must contain the common Persian translations of the English word.
3. meanings[].text MUST be Persian/Farsi.
4. meanings[].type MUST be Persian, using terms such as اسم، فعل، صفت، قید، حرف اضافه، حرف ربط.
5. synonyms and antonyms MUST remain English words.
6. Do not add, remove, rename, or reorder the JSON keys.
7. Return 2-5 useful meanings when possible.
8. Return useful English synonyms and antonyms when they are clear; otherwise use an empty array.
9. Do not translate the JSON keys.

English word:
${word}`
        : `You are an expert English-Persian dictionary.

Return ONLY one valid JSON object with EXACTLY this structure:
{
  "meanings": [
    {"text": "رایج‌ترین معنی فارسی", "type": "اسم"},
    {"text": "معنی دوم فارسی", "type": "اسم"}
  ],
  "synonyms": ["synonym1", "synonym2"],
  "antonyms": ["antonym1", "antonym2"]
}

Rules:
1. Keep the keys exactly: meanings, synonyms, antonyms.
2. meanings[].text MUST be Persian.
3. meanings[].type MUST be Persian.
4. synonyms and antonyms MUST be English.
5. Return 3-5 common meanings when possible.
6. Return useful synonyms and antonyms when applicable.
7. JSON only; no markdown or explanation.

English word:
${word}`;

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

        const lowerWord = String(word).toLowerCase().trim();
        await this.db.set('word_meanings', { word: lowerWord, value: result }).catch(() => {});
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

  function patchBasicTTS(AppClass) {
    const originalPlayTextToSpeech = AppClass.prototype.playTextToSpeech;
    if (AppClass.prototype.__runtimeTtsFallbackPatched) return;
    AppClass.prototype.__runtimeTtsFallbackPatched = true;

    AppClass.prototype.playTextToSpeech = async function(text, button, progressBar, messageId) {
      if (this.ttsProvider !== 'openrouter' && this.ttsProvider !== 'openai_compatible') {
        return originalPlayTextToSpeech.call(this, text, button, progressBar, messageId);
      }

      const cfg = this.getProviderConfig();
      const baseUrl = this.ttsProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : normalizeBaseUrl(cfg.genericBaseUrl);
      const apiKey = this.ttsProvider === 'openrouter' ? cfg.openrouterApiKey : cfg.genericApiKey;
      const model = this.ttsProvider === 'openrouter' ? cfg.openrouterTtsModel : cfg.genericTtsModel;

      try {
        if (!baseUrl || !model) throw new Error('TTS server/model is not configured.');
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
        await this.playAudio(blob, button, progressBar);
      } catch (error) {
        console.warn('API TTS unavailable; falling back to browser/Windows speech:', error);
        try {
          await browserSpeak(text);
          this.showToast('Using the Windows/browser speech engine.', 'info');
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
        if (!response.ok) throw new Error(`TTS request failed (${response.status})`);
        const blob = await response.blob();
        await this.app.db.set('audio_cache', { text: cacheKey, value: blob }).catch(() => {});
        return blob;
      } catch (error) {
        console.warn('Advanced API TTS unavailable; browser fallback will be used:', error);
        this.__browserTtsFallbackText = text;
        return null;
      }
    };

    TTSClass.prototype.startPlayback = async function() {
      const audioBlob = await this.generateFullAudio(this.fullText);

      if (!audioBlob && this.__browserTtsFallbackText) {
        try {
          await browserSpeak(this.__browserTtsFallbackText);
          this.isPlaying = false;
          this.isPaused = false;
          this.updatePlayPauseButton();
          this.app.showToast('Using the Windows/browser speech engine.', 'info');
        } catch (error) {
          console.error('Browser fallback TTS failed:', error);
          this.app.showToast(`TTS failed: ${errorText(error)}`, 'error');
        }
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
  }

  function patch() {
    const AppClass = getAppClass();
    if (!AppClass) return;

    patchWordMeaning(AppClass);
    patchBasicTTS(AppClass);
    patchAdvancedTTS(getTTSClass());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patch, { once: true });
  } else {
    patch();
  }
})();
