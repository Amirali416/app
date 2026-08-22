(() => {
  'use strict';

  // app.js is a classic script, so AIChatApp is available as a global lexical binding.
  // Export it explicitly so the provider runtime bridge can access it reliably.
  try {
    if (typeof AIChatApp !== 'undefined') window.AIChatApp = AIChatApp;
  } catch (_) {}

  const labels = {
    gemini: 'Google Gemini',
    avalai: 'AvalAI',
    openrouter: 'OpenRouter',
    openai_compatible: 'OpenAI-Compatible / Local or Custom Server'
  };

  function ensureOption(select, value, label) {
    if (!select) return;
    const existing = select.querySelector(`option[value="${value}"]`);
    if (existing) {
      existing.textContent = label;
      return;
    }
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function cleanSelect(select, options) {
    if (!select) return;
    Array.from(select.options).forEach(option => {
      if (option.value === 'puter' || /Puter/i.test(option.textContent || '')) option.remove();
    });
    Object.entries(options).forEach(([value, label]) => ensureOption(select, value, label));
  }

  function normalizeCurrentProvider() {
    if (localStorage.getItem('chat_provider') === 'puter') localStorage.setItem('chat_provider', 'openrouter');
    if (localStorage.getItem('tts_provider') === 'puter') localStorage.setItem('tts_provider', 'openrouter');
    if (localStorage.getItem('stt_provider') === 'puter') localStorage.setItem('stt_provider', 'browser');
  }

  function applyProviderUi() {
    normalizeCurrentProvider();
    const chat = document.getElementById('chat-provider-select');
    const tts = document.getElementById('tts-provider-select');
    cleanSelect(chat, labels);
    cleanSelect(tts, labels);
    const legacyTts = Array.from(tts?.options || []).find(o => o.value === 'browser');
    if (legacyTts) legacyTts.textContent = 'Browser TTS';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyProviderUi, { once: true });
  } else {
    applyProviderUi();
  }
})();
