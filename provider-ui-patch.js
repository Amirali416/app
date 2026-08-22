(() => {
  'use strict';

  function getAppClass() {
    try { return Function('return AIChatApp')(); } catch (_) { return null; }
  }

  function addOption(select, value, label) {
    if (!select || select.querySelector(`option[value="${value}"]`)) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  const AppClass = getAppClass();
  if (!AppClass || AppClass.__providerUiPatched) return;
  AppClass.__providerUiPatched = true;

  const originalInitElements = AppClass.prototype.initElements;
  AppClass.prototype.initElements = function(...args) {
    const result = originalInitElements.apply(this, args);
    addOption(this.chatProviderSelect, 'openai_compatible', 'OpenAI-Compatible / Local Network');
    addOption(this.chatProviderSelect, 'openrouter', 'OpenRouter');
    addOption(this.ttsProviderSelect, 'openai_compatible', 'OpenAI-Compatible / Local Network');
    addOption(this.ttsProviderSelect, 'openrouter', 'OpenRouter');
    return result;
  };
})();
