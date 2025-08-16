// --- Database Helper for Caching ---
class CacheDB {
  constructor(dbName = "AIChatCache", version = 2) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = (event) => { console.error("IndexedDB error:", event.target.error); reject("IndexedDB error"); };
      request.onsuccess = (event) => { this.db = event.target.result; console.log("Database opened successfully."); resolve(); };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("word_meanings")) db.createObjectStore("word_meanings", { keyPath: "word" });
        if (!db.objectStoreNames.contains("audio_cache")) db.createObjectStore("audio_cache", { keyPath: "text" });
        if (!db.objectStoreNames.contains("leitner_cards")) {
          const leitnerStore = db.createObjectStore("leitner_cards", { keyPath: "word" });
          leitnerStore.createIndex("chatId", "chatId", { unique: false });
        }
      };
    });
  }

  async get(storeName, key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => { console.error(`Error getting data from ${storeName}:`, event.target.error); reject(event.target.error); };
    });
  }

  async getAll(storeName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => { console.error(`Error getting all data from ${storeName}:`, event.target.error); reject(event.target.error); };
    });
  }

  async set(storeName, data) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = (event) => { console.error(`Error setting data in ${storeName}:`, event.target.error); reject(event.target.error); };
    });
  }
}

class AIChatApp {
  constructor() {
    this.API_KEY = localStorage.getItem("gemini_api_key");
    this.AVALAI_API_KEY = localStorage.getItem("avalai_api_key");
    this.chatProvider = localStorage.getItem("chat_provider") || "gemini";
    this.ttsProvider = localStorage.getItem("tts_provider") || "gemini";
    this.chats = JSON.parse(localStorage.getItem("chats")) || [];
    this.currentChatId = null;
    this.isLoading = false;
    this.selectedText = "";
    this.selectionTimeout = null;
    this.currentUtterance = null;
    this.db = new CacheDB();

    this.leitnerQueue = [];
    this.currentCard = null;

    this.activePopups = [];
    this.baseZIndex = 1002;

    this.initElements();
    this.bindEvents();
    this.initApp();
  }

  // ---------- INIT / UI ----------
  async initApp() {
    await this.db.init().catch(err => console.error("Failed to initialize cache DB.", err));
    const style = document.createElement('style');
    // **MODIFIED STYLES FOR CARD BACK**
    style.textContent = `
        .tts-highlight { background-color: #0088cc; color: white; border-radius: 3px; padding: 0 2px; } 
        .clickable-word { cursor: pointer; } 
        .clickable-word:hover { text-decoration: underline; }
        #card-back-text { text-align: center; }
        .card-meaning-item { 
            position: relative; 
            padding: 8px 0;
            text-align: center; 
            font-size: 20px;
        }
        .card-meaning-type { 
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            font-size: 13px; 
            color: #555; 
            background-color: #e0e0e0; 
            padding: 2px 6px; 
            border-radius: 8px;
        }
    `;
    document.head.appendChild(style);
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!this.API_KEY && !this.AVALAI_API_KEY) {
      this.showApiModal();
    } else {
      this.showApp();
      this.renderChatList();
      if (this.chats.length > 0) this.switchToChat(this.chats[0].id);
      else this.showChatNameModal();
    }
    this.hideLoading();
  }

  initElements() {
    this.loadingScreen = document.getElementById("loading-screen");
    this.apiModal = document.getElementById("api-modal");
    this.apiKeyInput = document.getElementById("api-key-input");
    this.saveApiKeyBtn = document.getElementById("save-api-key");
    this.chatNameModal = document.getElementById("chat-name-modal");
    this.chatNameInput = document.getElementById("chat-name-input");
    this.saveChatNameBtn = document.getElementById("save-chat-name");
    this.cancelChatNameBtn = document.getElementById("cancel-chat-name");
    this.settingsModal = document.getElementById("settings-modal");
    this.newApiKeyInput = document.getElementById("new-api-key-input");
    this.avalaiApiKeyInput = document.getElementById("avalai-api-key-input");
    this.chatProviderSelect = document.getElementById("chat-provider-select");
    this.ttsProviderSelect = document.getElementById("tts-provider-select");
    this.saveSettingsBtn = document.getElementById("save-settings");
    this.cancelSettingsBtn = document.getElementById("cancel-settings");
    this.app = document.getElementById("app");
    this.chatListItems = document.getElementById("chat-list-items");
    this.chatTitle = document.getElementById("chat-title");
    this.messagesDiv = document.getElementById("messages");
    this.messageInput = document.getElementById("message-input");
    this.sendBtn = document.getElementById("send-btn");
    this.sidebarNewChatBtn = document.getElementById("sidebar-new-chat-btn");
    this.headerNewChatBtn = document.getElementById("header-new-chat-btn");
    this.renameChatBtn = document.getElementById("rename-chat");
    this.deleteChatBtn = document.getElementById("delete-chat");
    this.menuToggle = document.getElementById("menu-toggle");
    this.settingsBtn = document.getElementById("settings-btn");
    this.wordMeaningPopup = document.getElementById("word-meaning-popup");
    this.translationPopup = document.getElementById("translation-popup");
    this.originalTextEl = document.getElementById("original-text");
    this.translatedTextEl = document.getElementById("translated-text");
    this.closeTranslationBtn = document.getElementById("close-translation");
    this.playTranslationAudioBtn = document.getElementById("play-translation-audio-btn");
    this.sidebar = document.querySelector(".sidebar");
    this.translateSelectionBtn = document.getElementById("translate-selection-btn");
    this.leitnerModal = document.getElementById("leitner-modal");
    this.headerLeitnerBtn = document.getElementById("header-leitner-btn");
    this.closeLeitnerBtn = document.getElementById("close-leitner-btn");
    this.leitnerStatsNew = document.getElementById("leitner-stats-new");
    this.leitnerStatsDue = document.getElementById("leitner-stats-due");
    this.leitnerCardContainer = document.getElementById("leitner-card-container");
    this.leitnerCard = document.querySelector(".leitner-card");
    this.cardFrontText = document.getElementById("card-front-text");
    this.cardBackText = document.getElementById("card-back-text");
    this.leitnerPlayAudioBtn = document.getElementById("leitner-play-audio-btn");
    this.showAnswerBtn = document.getElementById("show-answer-btn");
    this.leitnerInitialControls = document.getElementById("leitner-initial-controls");
    this.leitnerRatingControls = document.getElementById("leitner-rating-controls");
    this.ratingAgainBtn = document.getElementById("rating-again");
    this.ratingHardBtn = document.getElementById("rating-hard");
    this.ratingGoodBtn = document.getElementById("rating-good");
    this.ratingEasyBtn = document.getElementById("rating-easy");
    this.leitnerFinishedScreen = document.getElementById("leitner-finished-screen");
    this.leitnerFinishedOkBtn = document.getElementById("leitner-finished-ok");
    this.importChatBtn = document.getElementById("import-chat-btn");
    this.importTextModal = document.getElementById("import-text-modal");
    this.importTextArea = document.getElementById("import-textarea");
    this.importFromFileBtn = document.getElementById("import-from-file-btn");
    this.fileInput = document.getElementById("file-input");
    this.importFromClipboardBtn = document.getElementById("import-from-clipboard-btn");
    this.cancelImportBtn = document.getElementById("cancel-import-btn");
    this.createChatFromImportBtn = document.getElementById("create-chat-from-import-btn");
    this.importDictionaryBtn = document.getElementById("import-dictionary-btn");
    this.dictionaryImportInput = document.getElementById("dictionary-import-input");
    this.exportDictionaryBtn = document.getElementById("export-dictionary-btn");
  }

  bindEvents() {
    this.saveApiKeyBtn.addEventListener("click", () => this.saveApiKey());
    this.apiKeyInput.addEventListener("keypress", (e) => { if (e.key === "Enter") this.saveApiKey(); });
    this.sidebarNewChatBtn.addEventListener("click", () => this.showChatNameModal());
    this.headerNewChatBtn.addEventListener("click", () => this.showChatNameModal());
    this.saveChatNameBtn.addEventListener("click", () => this.createChatWithName());
    this.cancelChatNameBtn.addEventListener("click", () => this.hideChatNameModal());
    this.chatNameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") this.createChatWithName(); });
    this.settingsBtn.addEventListener("click", () => this.showSettingsModal());
    this.saveSettingsBtn.addEventListener("click", () => this.saveSettings());
    this.cancelSettingsBtn.addEventListener("click", () => this.hideSettingsModal());
    this.renameChatBtn.addEventListener("click", () => this.renameChat());
    this.deleteChatBtn.addEventListener("click", () => this.deleteChat());
    this.menuToggle?.addEventListener("click", () => this.toggleSidebar());
    this.sendBtn.addEventListener("click", () => this.sendMessage());
    this.messageInput.addEventListener("input", () => this.adjustTextareaHeight());
    this.messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); } });
    
    this.closeTranslationBtn.addEventListener("click", () => this.hidePopup(this.translationPopup));
    this.playTranslationAudioBtn.addEventListener("click", () => this.playTranslationAudio());
    this.translationPopup.addEventListener("click", (e) => { if (e.target === this.translationPopup) this.hidePopup(this.translationPopup); });

    this.messagesDiv.addEventListener("click", (e) => {
      if (e.target.classList.contains("ai-word")) { const word = e.target.dataset.word; if (word) this.showWordMeaning(word); }
      const deleteBtn = e.target.closest('.btn-delete-message');
      if (deleteBtn) {
        const messageId = deleteBtn.dataset.messageId;
        this.deleteMessageById(messageId);
      }
    });
    document.addEventListener('pointerup', (e) => this.handleSelectionEnd(e));
    document.addEventListener('selectionchange', () => this.handleSelectionChange());
    this.translateSelectionBtn.addEventListener('click', () => this.handleTranslateButtonClick());
    document.addEventListener('click', (e) => {
      if (!this.translateSelectionBtn.contains(e.target)) this.hideTranslateButton();
      if (this.sidebar.classList.contains("active") && !this.sidebar.contains(e.target) && e.target !== this.menuToggle && !this.menuToggle.contains(e.target)) this.hideSidebar();
    });
    this.headerLeitnerBtn.addEventListener("click", () => this.openLeitnerModal(null));
    this.closeLeitnerBtn.addEventListener("click", () => this.closeLeitnerModal());
    this.showAnswerBtn.addEventListener("click", () => this.flipCard());
    this.leitnerCard.addEventListener("click", (e) => {
      if (e.target.closest('#leitner-play-audio-btn')) return;
      this.flipCard();
    });
    this.leitnerPlayAudioBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.playLeitnerCardAudio();
    });
    this.ratingAgainBtn.addEventListener("click", () => this.rateCard(1));
    this.ratingHardBtn.addEventListener("click", () => this.rateCard(2));
    this.ratingGoodBtn.addEventListener("click", () => this.rateCard(3));
    this.ratingEasyBtn.addEventListener("click", () => this.rateCard(4));
    this.leitnerFinishedOkBtn.addEventListener("click", () => this.closeLeitnerModal());
    this.importChatBtn.addEventListener("click", () => this.showImportTextModal());
    this.cancelImportBtn.addEventListener("click", () => this.hideImportTextModal());
    this.importFromFileBtn.addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", (e) => this.handleFileImport(e));
    this.importFromClipboardBtn.addEventListener("click", () => this.handleClipboardImport());
    this.createChatFromImportBtn.addEventListener("click", () => this.createChatFromImport());
    this.importDictionaryBtn.addEventListener("click", () => this.dictionaryImportInput.click());
    this.dictionaryImportInput.addEventListener("change", (e) => this.importDictionary(e));
    this.exportDictionaryBtn.addEventListener("click", () => this.exportDictionary());
  }

  adjustTextareaHeight() {
    this.messageInput.style.height = 'auto';
    const scrollHeight = this.messageInput.scrollHeight;
    this.messageInput.style.height = `${Math.min(scrollHeight, 120)}px`;
  }
  showLoading() { this.loadingScreen?.classList?.remove("hidden"); }
  hideLoading() { this.loadingScreen?.classList?.add("hidden"); }
  showApiModal() { this.apiModal.classList.remove("hidden"); this.apiKeyInput.focus(); }
  hideApiModal() { this.apiModal.classList.add("hidden"); }
  showChatNameModal() { this.chatNameInput.value = "New Chat"; this.chatNameModal.classList.remove("hidden"); this.chatNameInput.focus(); }
  hideChatNameModal() { this.chatNameModal.classList.add("hidden"); }

  showPopup(popupElement) {
    const newZIndex = this.baseZIndex + this.activePopups.length;
    popupElement.style.zIndex = newZIndex;
    popupElement.classList.remove("hidden");

    if (!this.activePopups.includes(popupElement)) {
        this.activePopups.push(popupElement);
    }
  }

  hidePopup(popupElement) {
    popupElement.classList.add("hidden");
    this.activePopups = this.activePopups.filter(p => p !== popupElement);
  }

  showSettingsModal() {
    this.newApiKeyInput.value = this.API_KEY || "";
    this.avalaiApiKeyInput.value = this.AVALAI_API_KEY || "";
    this.chatProviderSelect.value = this.chatProvider;
    this.ttsProviderSelect.value = this.ttsProvider;
    this.settingsModal.classList.remove("hidden");
  }

  hideSettingsModal() { this.settingsModal.classList.add("hidden"); }
  showApp() { this.app.classList.remove("hidden"); }
  saveApiKey() { const key = this.apiKeyInput.value.trim(); if (key) { localStorage.setItem("gemini_api_key", key); this.API_KEY = key; this.hideApiModal(); this.showApp(); this.renderChatList(); this.showChatNameModal(); } }

  saveSettings() {
    const geminiKey = this.newApiKeyInput.value.trim();
    const avalaiKey = this.avalaiApiKeyInput.value.trim();
    const chatProvider = this.chatProviderSelect.value;
    const ttsProvider = this.ttsProviderSelect.value;
    localStorage.setItem("gemini_api_key", geminiKey);
    this.API_KEY = geminiKey;
    localStorage.setItem("avalai_api_key", avalaiKey);
    this.AVALAI_API_KEY = avalaiKey;
    localStorage.setItem("chat_provider", chatProvider);
    this.chatProvider = chatProvider;
    localStorage.setItem("tts_provider", ttsProvider);
    this.ttsProvider = ttsProvider;
    this.hideSettingsModal();
    alert("Settings saved successfully!");
  }

  createChatWithName() {
    const name = this.chatNameInput.value.trim();
    if (name) {
      const id = Date.now().toString();
      const newChat = { id, title: name, messages: [], createdAt: new Date().toISOString() };
      this.chats.unshift(newChat);
      this.saveChats();
      this.switchToChat(id);
      this.renderChatList();
      this.hideChatNameModal();
    }
  }

  switchToChat(id) {
    this.currentChatId = id;
    const chat = this.chats.find(c => c.id === id);
    if (!chat) return;
    this.chatTitle.textContent = chat.title;
    this.messagesDiv.innerHTML = "";
    chat.messages.forEach(msg => this.addMessageToUI(msg.role, msg.content, msg.id));
    document.querySelectorAll(".chat-item").forEach(item => item.classList.remove("active"));
    const activeItem = document.querySelector(`[data-id="${id}"]`);
    if (activeItem) activeItem.classList.add("active");
    this.hideSidebar();
  }

  saveChats() { localStorage.setItem("chats", JSON.stringify(this.chats)); }

  renderChatList() {
    this.chatListItems.innerHTML = "";
    this.chats.forEach(chat => {
      const li = document.createElement("li");
      li.className = "chat-item";
      li.dataset.id = chat.id;
      const titleSpan = document.createElement("span");
      titleSpan.className = "chat-item-title";
      titleSpan.textContent = chat.title;
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "chat-item-actions";
      const leitnerBtn = document.createElement("button");
      leitnerBtn.className = "btn-icon";
      leitnerBtn.title = "Review Chat Flashcards";
      leitnerBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
      leitnerBtn.onclick = (e) => { e.stopPropagation(); this.openLeitnerModal(chat.id); };
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-icon danger";
      deleteBtn.title = "Delete Chat";
      deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the chat "${chat.title}"?`)) {
          this.deleteChatById(chat.id);
        }
      };
      actionsDiv.appendChild(leitnerBtn); actionsDiv.appendChild(deleteBtn);
      li.appendChild(titleSpan); li.appendChild(actionsDiv);
      li.addEventListener("click", () => this.switchToChat(chat.id));
      if (chat.id === this.currentChatId) li.classList.add("active");
      this.chatListItems.appendChild(li);
    });
  }

  addMessage(role, content) {
    const chat = this.chats.find(c => c.id === this.currentChatId);
    if (!chat) return;
    const message = { id: `msg-${Date.now()}`, role, content, timestamp: new Date().toISOString() };
    chat.messages.push(message);
    this.saveChats();
    this.addMessageToUI(role, content, message.id);
  }

  addMessageToUI(role, content, messageId) {
    const messageWrapper = document.createElement("div");
    messageWrapper.className = `message-wrapper ${role}`;
    messageWrapper.id = messageId;
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;
    const formattedContent = this.formatMessageContent(content, messageId);
    messageDiv.innerHTML = formattedContent;
    const controlsDiv = document.createElement("div");
    controlsDiv.className = "message-controls";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-message-action danger btn-delete-message";
    deleteBtn.title = "Delete Message";
    deleteBtn.dataset.messageId = messageId;
    deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    if (content && content.trim().length > 0) {
      const audioControls = this.createAudioControls(content, messageId);
      if (audioControls) {
        if (role === 'user') {
          controlsDiv.appendChild(audioControls);
          controlsDiv.appendChild(deleteBtn);
        } else {
          controlsDiv.appendChild(deleteBtn);
          controlsDiv.appendChild(audioControls);
        }
      }
    } else {
      controlsDiv.appendChild(deleteBtn);
    }
    messageWrapper.appendChild(messageDiv);
    messageWrapper.appendChild(controlsDiv);
    this.messagesDiv.appendChild(messageWrapper);
    this.scrollToBottom();
  }

  createAudioControls(content, messageId) {
    const audioBtn = document.createElement("button");
    audioBtn.className = "btn-message-action btn-audio";
    audioBtn.title = "Play Audio";
    audioBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon></svg>`;
    audioBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.playTextToSpeech(content, audioBtn, null, messageId)
    });
    const container = document.createElement('div');
    container.className = 'audio-controls-container';
    container.appendChild(audioBtn);
    return container;
  }

  base64ToArrayBuffer(base64) { const binaryString = window.atob(base64); const len = binaryString.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); } return bytes.buffer; }
  pcmToWav(pcmData, sampleRate) { const numChannels = 1, bitsPerSample = 16; const blockAlign = (numChannels * bitsPerSample) >> 3; const byteRate = sampleRate * blockAlign; const dataSize = pcmData.length * (bitsPerSample >> 3); const buffer = new ArrayBuffer(44 + dataSize); const view = new DataView(buffer); this._writeString(view, 0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); this._writeString(view, 8, 'WAVE'); this._writeString(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true); view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true); view.setUint16(34, bitsPerSample, true); this._writeString(view, 36, 'data'); view.setUint32(40, dataSize, true); let offset = 44; for (let i = 0; i < pcmData.length; i++, offset += 2) { view.setInt16(offset, pcmData[i], true); } return new Blob([view], { type: 'audio/wav' }); }
  _writeString(view, offset, string) { for (let i = 0; i < string.length; i++) { view.setUint8(offset + i, string.charCodeAt(i)); } }

  async playAudio(audioBlob, button, progressBar) {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    button.disabled = true;
    button.classList.add("playing");
    audio.addEventListener("timeupdate", () => {
      if (audio.duration && progressBar) {
        this.updateProgress(progressBar, (audio.currentTime / audio.duration) * 100);
      }
    });
    audio.addEventListener("ended", () => {
      button.classList.remove("playing");
      button.disabled = false;
      if (progressBar) {
        this.updateProgress(progressBar, 100);
        setTimeout(() => this.updateProgress(progressBar, 0), 500);
      }
      URL.revokeObjectURL(audioUrl);
    });
    audio.addEventListener("error", (e) => {
      console.error("Audio playback error:", e);
      button.classList.remove("playing");
      button.disabled = false;
      alert("Failed to play audio.");
    });
    await audio.play();
  }

  async playTextToSpeech(text, button, progressBar, messageId) {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      return;
    }
    try {
      const cachedAudio = await this.db.get('audio_cache', text);
      if (cachedAudio && cachedAudio.value) {
        await this.playAudio(cachedAudio.value, button, progressBar);
        return;
      }
    } catch (err) {
      console.error("Error reading audio cache:", err);
    }
    if (this.ttsProvider === 'avalai' && this.AVALAI_API_KEY) {
      this.playWithAvalaiTTS(text, button, progressBar);
    } else if (this.ttsProvider === 'gemini' && this.API_KEY) {
      this.playWithGeminiTTS(text, button, progressBar);
    } else {
      this.playWithBrowserTTS(text, button, progressBar, messageId);
    }
  }

  async playWithAvalaiTTS(text, button, progressBar) {
    button.disabled = true;
    button.classList.add("playing");
    if (progressBar) this.updateProgress(progressBar, 0);
    try {
      const response = await fetch('https://api.avalai.ir/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.AVALAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', input: text, voice: 'alloy' })
      });
      if (!response.ok) throw new Error(`Avalai TTS API error: ${response.status} ${response.statusText}`);
      const audioBlob = await response.blob();
      await this.playAudio(audioBlob, button, progressBar);
      await this.db.set('audio_cache', { text: text, value: audioBlob }).catch(err => console.error("Failed to cache audio:", err));
    } catch (error) {
      console.error("Avalai TTS Error:", error);
      button.classList.remove("playing");
      button.disabled = false;
      if (progressBar) this.updateProgress(progressBar, 0);
      alert(`Failed to generate speech with Avalai: ${error.message}`);
    }
  }

  async playWithGeminiTTS(text, button, progressBar) {
    button.disabled = true;
    button.classList.add("playing");
    if (progressBar) this.updateProgress(progressBar, 0);
    try {
      const payload = {
        contents: [{ parts: [{ text: `Say it naturally: ${text}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } } } },
        model: "gemini-2.5-flash-preview-tts"
      };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${this.API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Gemini TTS API error: ${response.status}`);
      const result = await response.json();
      const part = result?.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;
      if (!audioData) throw new Error("Invalid audio data from Gemini API.");
      const sampleRateMatch = mimeType.match(/rate=(\d+)/);
      const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;
      const pcmDataBuffer = this.base64ToArrayBuffer(audioData);
      const pcm16 = new Int16Array(pcmDataBuffer);
      const wavBlob = this.pcmToWav(pcm16, sampleRate);
      await this.playAudio(wavBlob, button, progressBar);
      await this.db.set('audio_cache', { text: text, value: wavBlob }).catch(err => console.error("Failed to cache audio:", err));
    } catch (error) {
      console.error("Gemini TTS Error:", error);
      button.classList.remove("playing");
      button.disabled = false;
      if (progressBar) this.updateProgress(progressBar, 0);
      alert(`Failed to generate speech with Gemini: ${error.message}`);
    }
  }

  playWithBrowserTTS(text, button, progressBar, messageId) {
    try {
      if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;
      utterance.lang = /[\u0600-\u06FF]/.test(text) ? 'fa-IR' : 'en-US';
      utterance.rate = 1.0; utterance.pitch = 1.0;
      let lastHighlightedIndex = -1;
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const messageElem = document.getElementById(messageId); if (!messageElem) return;
          const allWords = messageElem.querySelectorAll('.tts-word');
          const wordIndex = this.findWordIndexAtChar(text, event.charIndex);
          if (lastHighlightedIndex > -1 && lastHighlightedIndex < allWords.length) { allWords[lastHighlightedIndex].classList.remove('tts-highlight'); }
          if (wordIndex > -1 && wordIndex < allWords.length) { allWords[wordIndex].classList.add('tts-highlight'); lastHighlightedIndex = wordIndex; }
        }
      };
      utterance.onend = () => {
        const messageElem = document.getElementById(messageId);
        if (messageElem) messageElem.querySelectorAll('.tts-highlight').forEach(el => el.classList.remove('tts-highlight'));
        button.classList.remove("playing");
        button.disabled = false;
        if (progressBar) this.updateProgress(progressBar, 100);
        setTimeout(() => { if (progressBar) this.updateProgress(progressBar, 0) }, 500);
        this.currentUtterance = null;
      };
      utterance.onerror = (e) => { console.error("Browser TTS Error:", e); alert("Failed to generate speech."); };
      button.disabled = true; button.classList.add("playing"); speechSynthesis.speak(utterance);
    } catch (error) {
      console.error("Browser TTS Error:", error);
      alert("Text-to-speech is not supported in your browser.");
    }
  }

  findWordIndexAtChar(text, charIndex) { const textUpToChar = text.substring(0, charIndex); const words = textUpToChar.split(/\s+/).filter(w => w.length > 0); return words.length; }
  updateProgress(progressBar, percentage) { if (progressBar) progressBar.style.width = `${percentage}%`; }
  
  formatMessageContent(content, messageId) {
    if (content.startsWith('❌ Error:')) return `<p>${content}</p>`;
    let html;
    if (typeof marked === 'function') {
      html = marked.parse(content, { gfm: true, breaks: true });
    } else {
      console.warn("Marked.js not loaded. Using basic formatting.");
      html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    this.processNodeForClickable(doc.body.firstChild, messageId);
    return doc.body.firstChild.innerHTML;
  }
  
  processNodeForClickable(node, messageId) {
    let wordCounter = 0; const nodesToProcess = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    let textNode; while (textNode = walker.nextNode()) { const parent = textNode.parentNode; if (parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') { nodesToProcess.push(textNode); } }
    nodesToProcess.forEach(textNode => {
      const parent = textNode.parentNode;
      const words = textNode.textContent.split(/(\s+)/);
      if (words.every(w => w.trim() === '')) return;
      const fragment = document.createDocumentFragment();
      words.forEach(word => {
        if (/\b[a-zA-Z]+\b/.test(word)) {
          const span = document.createElement('span');
          span.className = 'ai-word tts-word';
          span.dataset.word = word;
          span.id = `word-${messageId}-${wordCounter++}`;
          span.textContent = word;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(word));
        }
      });
      parent.replaceChild(fragment, textNode);
    });
  }

  async sendMessage() {
    const text = this.messageInput.value.trim();
    if (!text || !this.currentChatId || this.isLoading) return;
    this.addMessage("user", text);
    this.messageInput.value = "";
    this.adjustTextareaHeight();
    const loadingWrapper = document.createElement("div");
    loadingWrapper.className = "message-wrapper ai";
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message ai";
    loadingDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    loadingWrapper.appendChild(loadingDiv);
    this.messagesDiv.appendChild(loadingWrapper);
    this.scrollToBottom();
    this.isLoading = true;
    try {
      const response = await this.callChatAPI(text);
      const aiText = response;
      loadingWrapper.remove();
      this.addMessage("ai", aiText);
      const chat = this.chats.find(c => c.id === this.currentChatId);
      if (chat && chat.messages.length === 2 && !chat.title.includes('(Imported)')) {
        chat.title = text.substring(0, 30) + (text.length > 30 ? "..." : "");
        this.saveChats();
        this.renderChatList();
        this.chatTitle.textContent = chat.title;
      }
    } catch (error) {
      console.error("Error:", error);
      loadingWrapper.remove();
      this.addMessage("ai", `❌ Error: ${error.message}`);
    } finally {
      this.isLoading = false;
    }
  }

  async callChatAPI(message) {
    if (this.chatProvider === 'gemini') return this.callGeminiChatAPI(message);
    else if (this.chatProvider === 'avalai') return this.callAvalaiChatAPI(message);
    else throw new Error("No chat provider selected or API key is missing.");
  }

  async callGeminiChatAPI(message) {
    if (!this.API_KEY) throw new Error("Gemini API key is not set.");
    const chat = this.chats.find(c => c.id === this.currentChatId);
    if (!chat) throw new Error("Chat not found");
    const history = chat.messages.filter(msg => msg.role !== "system").slice(-10).map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }]
    }));
    const requestBody = { contents: [...history, { role: "user", parts: [{ text: message }] }] };
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${this.API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody)
    });
    if (!response.ok) { const errorText = await response.text(); throw new Error(`Gemini API Error: ${response.status}, ${errorText}`); }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't get a response from Gemini.";
  }

  async callAvalaiChatAPI(message) {
    if (!this.AVALAI_API_KEY) throw new Error("Avalai API key is not set.");
    const chat = this.chats.find(c => c.id === this.currentChatId);
    if (!chat) throw new Error("Chat not found");
    const history = chat.messages.filter(msg => msg.role !== "system").slice(-10).map(msg => ({
      role: msg.role === "user" ? "user" : "assistant", content: msg.content
    }));
    const requestBody = { model: "gpt-5-nano", messages: [...history, { role: "user", content: message }] };
    const response = await fetch('https://api.avalai.ir/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${this.AVALAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
    });
    if (!response.ok) { const errorText = await response.text(); throw new Error(`Avalai API Error: ${response.status}, ${errorText}`); }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response from Avalai.";
  }

  // ---------- Dictionary / Translation ----------
  async getWordMeaning(word) {
    if (this.chatProvider === 'avalai') return this.getWordMeaningAvalai(word);
    return this.getWordMeaningGemini(word);
  }

  async getWordMeaningAvalai(word) {
    const lowerWord = word.toLowerCase().trim();
    try { const cachedMeaning = await this.db.get('word_meanings', lowerWord); if (cachedMeaning) return cachedMeaning.value; } catch (err) { console.error("Error reading meaning cache:", err); }
    if (!this.AVALAI_API_KEY) return { meanings: [{ text: `No Avalai API Key`, type: "Error" }], synonyms: [], antonyms: [] };
    const prompt = `You are a dictionary assistant. Your only task is to provide the Persian translation and details for an English word in a strict JSON format. Word: "${word}". Provide the output ONLY in the following JSON format. Do not add any extra text, explanations, or markdown. { "meanings": [{"text": "Persian translation", "type": "part of speech in Persian"}], "synonyms": ["synonym1", "synonym2"], "antonyms": ["antonym1"] }. For the "type" field, use one of these Persian terms: اسم, فعل, صفت, قید, حرف ندا, حرف ربط, حرف اضافه. If the word is not found or has no synonyms/antonyms, return empty arrays for the respective fields. Example for the word "hi": { "meanings": [{"text": "سلام", "type": "حرف ندا"}], "synonyms": ["hello"], "antonyms": [] }`;
    const returnError = (message) => ({ meanings: [{ text: message, type: "Error" }], synonyms: [], antonyms: [] });
    try {
      const response = await fetch('https://api.avalai.ir/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.AVALAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: "gpt-5-nano", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } })
      });
      if (!response.ok) return returnError(`Avalai API Error: ${response.status}`);
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) return returnError("No response from Avalai API");
      try {
        const result = JSON.parse(text);
        if (!result.meanings || !Array.isArray(result.meanings)) return returnError("Invalid format received");
        await this.db.set('word_meanings', { word: lowerWord, value: result }).catch(err => console.error("Failed to cache meaning:", err));
        return result;
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError, "Raw response:", text);
        return returnError("Failed to parse meaning");
      }
    } catch (error) {
      console.error("Word meaning error (Avalai):", error);
      return returnError("Request failed");
    }
  }

  async getWordMeaningGemini(word) {
    const lowerWord = word.toLowerCase().trim();
    try { const cachedMeaning = await this.db.get('word_meanings', lowerWord); if (cachedMeaning) { return cachedMeaning.value; } } catch (err) { console.error("Error reading meaning cache:", err); }
    if (!this.API_KEY) return { meanings: [{ text: `No API Key`, type: "Error" }], synonyms: [], antonyms: [] };
    const prompt = `You are a dictionary assistant. Your only task is to provide the Persian translation and details for an English word in a strict JSON format. Word: "${word}". Provide the output ONLY in the following JSON format. Do not add any extra text, explanations, or markdown. { "meanings": [{"text": "Persian translation", "type": "part of speech in Persian"}], "synonyms": ["synonym1", "synonym2"], "antonyms": ["antonym1"] }. For the "type" field, use one of these Persian terms: اسم, فعل, صفت, قید, حرف ندا, حرف ربط, حرف اضافه. If the word is not found or has no synonyms/antonyms, return empty arrays for the respective fields. Example for the word "hi": { "meanings": [{"text": "سلام", "type": "حرف ندا"}], "synonyms": ["hello"], "antonyms": [] }`;
    const returnError = (message) => ({ meanings: [{ text: message, type: "Error" }], synonyms: [], antonyms: [] });
    try {
      const modelName = "gemini-2.5-flash-lite";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      if (!response.ok) return returnError(`API Error: ${response.status}`);
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return returnError("No response from API");
      try {
        const result = JSON.parse(text);
        if (!result.meanings || !Array.isArray(result.meanings)) return returnError("Invalid format received");
        await this.db.set('word_meanings', { word: lowerWord, value: result }).catch(err => console.error("Failed to cache meaning:", err));
        return result;
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError, "Raw response:", text);
        return returnError("Failed to parse meaning");
      }
    } catch (error) {
      console.error("Word meaning error:", error);
      return returnError("Request failed");
    }
  }

  async showWordMeaning(word) {
    if (!word.trim()) return;

    const newPopup = this.wordMeaningPopup.cloneNode(true);
    newPopup.id = `word-meaning-popup-${Date.now()}`;
    newPopup.classList.add('hidden'); // Start hidden
    document.body.appendChild(newPopup);

    const titleEl = newPopup.querySelector("#word-meaning-title");
    const meaningsListEl = newPopup.querySelector("#meanings-list");
    const synonymsListEl = newPopup.querySelector("#synonyms-list");
    const antonymsListEl = newPopup.querySelector("#antonyms-list");
    const closeBtn = newPopup.querySelector("#close-word-meaning");
    const playAudioBtn = newPopup.querySelector("#play-word-audio-btn");
    const addToLeitnerBtn = newPopup.querySelector("#add-to-leitner-btn");
    
    titleEl.textContent = word;
    meaningsListEl.innerHTML = '<div class="meaning-item">Loading...</div>';
    
    this.showPopup(newPopup);

    // Bind events for the new popup
    closeBtn.addEventListener('click', () => {
        this.hidePopup(newPopup);
        newPopup.remove();
    });
    
    playAudioBtn.addEventListener('click', () => this.playTextToSpeech(word, playAudioBtn, null, null));
    
    addToLeitnerBtn.addEventListener('click', () => this.addCurrentWordToLeitner(word));

    const playWordItemAudio = (event) => {
        const button = event.target.closest('.btn-audio-word-item');
        if (button) {
            event.stopPropagation();
            const text = button.dataset.text;
            if (text) {
                this.playTextToSpeech(text, button, null, null);
            }
        }
    };
    synonymsListEl.addEventListener('click', playWordItemAudio);
    antonymsListEl.addEventListener('click', playWordItemAudio);
    
    const handleWordClick = (event) => {
      if (event.target.classList.contains('clickable-word')) {
          this.showWordMeaning(event.target.textContent);
      }
    };
    synonymsListEl.addEventListener('click', handleWordClick);
    antonymsListEl.addEventListener('click', handleWordClick);

    // Fetch and render data
    const meaningData = await this.getWordMeaning(word);
    meaningsListEl.innerHTML = '';
    if (meaningData.meanings && meaningData.meanings.length > 0 && meaningData.meanings[0].type !== "Error") {
      meaningData.meanings.forEach(meaning => {
        const div = document.createElement("div");
        div.className = "meaning-item";
        div.innerHTML = `<div class="meaning-text">${meaning.text}</div><span class="meaning-type">${meaning.type}</span>`;
        meaningsListEl.appendChild(div);
      });
    } else {
      const errorMessage = meaningData.meanings[0]?.text || "Meaning not found";
      meaningsListEl.innerHTML = `<div class="meaning-item">${errorMessage}</div>`;
    }
    const renderWordList = (listElement, wordList, itemClass) => {
      listElement.innerHTML = '';
      if (wordList && wordList.length > 0) {
        wordList.forEach(itemWord => {
          const container = document.createElement("div");
          container.className = `${itemClass}-container`;
          const span = document.createElement("span");
          span.className = `${itemClass} clickable-word`;
          span.textContent = itemWord;
          const button = document.createElement("button");
          button.className = "btn-icon btn-audio-word-item";
          button.dataset.text = itemWord;
          button.title = `Play ${itemWord}`;
          button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon></svg>`;
          container.appendChild(span);
          container.appendChild(button);
          listElement.appendChild(container);
        });
      } else {
        listElement.innerHTML = `<span class="${itemClass}-item">${itemClass === 'synonym-item' ? 'No synonyms found' : 'No antonyms found'}</span>`;
      }
    };
    renderWordList(synonymsListEl, meaningData.synonyms, "synonym-item");
    renderWordList(antonymsListEl, meaningData.antonyms, "antonym-item");
  }

  playLeitnerCardAudio() { if (this.currentCard) { this.playTextToSpeech(this.currentCard.word, this.leitnerPlayAudioBtn, null, null); } }
  playTranslationAudio() { const text = this.originalTextEl.textContent; if (text) { this.playTextToSpeech(text, this.playTranslationAudioBtn, null, null); } }

  async translateText(text) {
    if (this.chatProvider === 'avalai' && this.AVALAI_API_KEY) return this.translateTextAvalai(text);
    return this.translateTextGemini(text);
  }

  async translateTextGemini(text) {
    if (!this.API_KEY) return `Translation requires API key.`;
    const prompt = `Translate this text to Persian/Farsi. Provide only the translation without any additional explanation: "${text}"`;
    try {
      const modelName = "gemini-2.5-flash-lite";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "Translation failed";
    } catch (error) {
      console.error("Translation error:", error);
      return "Translation failed";
    }
  }

  async translateTextAvalai(text) {
    if (!this.AVALAI_API_KEY) return `Translation requires API key.`;
    const prompt = `Translate this text to Persian/Farsi. Provide only the translation without any additional explanation: "${text}"`;
    try {
      const response = await fetch('https://api.avalai.ir/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${this.AVALAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: "gpt-5-nano", messages: [{ role: "user", content: prompt }] })
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "Translation failed";
    } catch (error) {
      console.error("Translation error (Avalai):", error);
      return "Translation failed";
    }
  }

  handleSelectionChange() {
    clearTimeout(this.selectionTimeout);
    this.selectionTimeout = setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      if (selectedText.length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) this.showTranslateButton(rect);
      } else {
        this.hideTranslateButton();
      }
    }, 100);
  }

  handleSelectionEnd(event) {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection.isCollapsed) {
        if (!event.target.closest('.floating-btn')) this.hideTranslateButton();
      }
    }, 200);
  }

  showTranslateButton(rect) { this.translateSelectionBtn.style.left = `${rect.left + window.scrollX + rect.width / 2 - this.translateSelectionBtn.offsetWidth / 2}px`; this.translateSelectionBtn.style.top = `${rect.bottom + window.scrollY + 8}px`; this.translateSelectionBtn.classList.remove('hidden'); }
  hideTranslateButton() { this.translateSelectionBtn.classList.add('hidden'); }

  handleTranslateButtonClick() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (selectedText) {
      if (!/\s/.test(selectedText)) this.showWordMeaning(selectedText);
      else this.showTranslationPopup(selectedText);
    }
    this.hideTranslateButton();
    selection.removeAllRanges();
  }

  async showTranslationPopup(text) {
    if (!text.trim()) return;
    this.originalTextEl.textContent = text;
    this.translatedTextEl.textContent = "Translating...";
    this.showPopup(this.translationPopup);
    try { const translation = await this.translateText(text); this.translatedTextEl.textContent = translation; }
    catch { this.translatedTextEl.textContent = "Translation failed"; }
  }
  
  renameChat() {
    const chat = this.chats.find(c => c.id === this.currentChatId);
    if (!chat) return;
    const newTitle = prompt("Enter new chat name:", chat.title);
    if (newTitle && newTitle.trim() !== "") {
        chat.title = newTitle.trim();
        this.saveChats();
        this.renderChatList();
        this.chatTitle.textContent = chat.title;
    }
  }

  deleteChat() {
    if (confirm("Are you sure you want to delete this chat?")) {
        this.deleteChatById(this.currentChatId);
    }
  }

  deleteChatById(chatId) {
    this.chats = this.chats.filter(c => c.id !== chatId);
    this.saveChats();
    if (this.currentChatId === chatId) {
        this.currentChatId = null;
        this.messagesDiv.innerHTML = "";
        this.chatTitle.textContent = "Select a chat";
        if (this.chats.length > 0) {
            this.switchToChat(this.chats[0].id);
        }
    }
    this.renderChatList();
  }
  
  deleteMessageById(messageId) {
      if (!confirm("Are you sure you want to delete this message?")) {
          return;
      }
      const chat = this.chats.find(c => c.id === this.currentChatId);
      if (chat) {
          const messageIndex = chat.messages.findIndex(m => m.id === messageId);
          if (messageIndex > -1) {
              chat.messages.splice(messageIndex, 1);
              this.saveChats();
              const messageElement = document.getElementById(messageId);
              if (messageElement) {
                  messageElement.remove();
              }
          }
      }
  }

  toggleSidebar() {
      this.sidebar.classList.toggle("active");
  }

  hideSidebar() {
      this.sidebar.classList.remove("active");
  }

  scrollToBottom() {
      this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
  }
  
  // --- Leitner Functions ---

  async addCurrentWordToLeitner(word) {
    const lowerWord = word.toLowerCase().trim();
    if (!lowerWord || !this.currentChatId) {
      alert("Cannot add word. No word or chat selected.");
      return;
    }
    try {
      const existingCard = await this.db.get('leitner_cards', lowerWord);
      if (existingCard) {
        alert(`"${lowerWord}" is already in your flashcards.`);
        return;
      }
      const newCard = {
        word: lowerWord,
        chatId: this.currentChatId,
        createdAt: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        interval: 0,
        easeFactor: 2.5,
        status: 'new'
      };
      await this.db.set('leitner_cards', newCard);
      alert(`"${lowerWord}" added to flashcards!`);
    } catch (error) {
      console.error("Error adding card to Leitner:", error);
      alert("Failed to add word to flashcards.");
    }
  }

  async openLeitnerModal(chatId = null) {
    this.leitnerModal.classList.remove("hidden");
    this.leitnerCardContainer.classList.remove('hidden');
    this.leitnerFinishedScreen.classList.add('hidden');
    try {
      const allCards = await this.db.getAll('leitner_cards');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let cardsToReview = allCards.filter(card => {
        const inCurrentChat = chatId ? card.chatId === chatId : true;
        const dueDate = new Date(card.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return inCurrentChat && dueDate <= today;
      });
      this.leitnerQueue = cardsToReview.sort(() => Math.random() - 0.5);
      const newCount = this.leitnerQueue.filter(c => c.status === 'new').length;
      const dueCount = this.leitnerQueue.length - newCount;
      this.leitnerStatsNew.textContent = `New: ${newCount}`;
      this.leitnerStatsDue.textContent = `Due: ${dueCount}`;
      if (this.leitnerQueue.length > 0) {
        this.showNextCard();
      } else {
        this.showFinishedScreen();
      }
    } catch (error) {
      console.error("Error starting Leitner review:", error);
      this.cardFrontText.textContent = "Error loading cards.";
    }
  }
  
  showNextCard() {
    if (this.leitnerQueue.length === 0) {
      this.showFinishedScreen();
      return;
    }
    this.currentCard = this.leitnerQueue.shift();
    this.leitnerCard.classList.remove('is-flipped');
    this.leitnerRatingControls.classList.add('hidden');
    this.leitnerInitialControls.classList.remove('hidden');
    this.cardFrontText.textContent = this.currentCard.word;
    this.cardBackText.innerHTML = '<div class="card-meaning-item">Loading meaning...</div>';
  }
  
  showFinishedScreen() {
    this.leitnerCardContainer.classList.add('hidden');
    this.leitnerInitialControls.classList.add('hidden');
    this.leitnerRatingControls.classList.add('hidden');
    this.leitnerFinishedScreen.classList.remove('hidden');
  }

  closeLeitnerModal() {
    this.leitnerModal.classList.add("hidden");
    this.currentCard = null;
    this.leitnerQueue = [];
  }

  async flipCard() {
    if (!this.currentCard) return;
    if (this.leitnerCard.classList.contains('is-flipped')) {
      this.leitnerCard.classList.remove('is-flipped');
      this.leitnerInitialControls.classList.remove('hidden');
      this.leitnerRatingControls.classList.add('hidden');
      return;
    }
    this.leitnerCard.classList.add('is-flipped');
    this.leitnerInitialControls.classList.add('hidden');
    this.leitnerRatingControls.classList.remove('hidden');
    this.updateRatingButtons();
    try {
        const meaningData = await this.getWordMeaning(this.currentCard.word);
        if (meaningData && meaningData.meanings && meaningData.meanings.length > 0) {
            this.cardBackText.innerHTML = meaningData.meanings
                .map(m => `<div class="card-meaning-item"><span class="card-meaning-text">${m.text}</span><span class="card-meaning-type">${m.type}</span></div>`)
                .join('');
        } else {
            this.cardBackText.innerHTML = '<div class="card-meaning-item">Meaning not found.</div>';
        }
    } catch (error) {
        console.error("Error fetching meaning for card:", error);
        this.cardBackText.innerHTML = '<div class="card-meaning-item">Error loading meaning.</div>';
    }
  }
  
  formatInterval(minutes) {
    if (!minutes || minutes < 1) return `≤1m`;
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = hours / 24;
    return `${Math.round(days)}d`;
  }
  
  updateRatingButtons() {
    const card = this.currentCard;
    const interval = card.interval || 0;
    const easeFactor = card.easeFactor || 2.5;
    const againInterval = this.formatInterval(10);
    const hardInterval = this.formatInterval(interval > 0 ? interval * 1.2 * 1440 : 12 * 60);
    const goodInterval = this.formatInterval(interval > 0 ? interval * easeFactor * 1440 : 1 * 1440);
    const easyInterval = this.formatInterval(interval > 0 ? interval * easeFactor * 1.3 * 1440 : 4 * 1440);
    this.ratingAgainBtn.querySelector('small').textContent = againInterval;
    this.ratingHardBtn.querySelector('small').textContent = `~${hardInterval}`;
    this.ratingGoodBtn.querySelector('small').textContent = `~${goodInterval}`;
    this.ratingEasyBtn.querySelector('small').textContent = `~${easyInterval}`;
  }

  async rateCard(rating) {
      if (!this.currentCard) return;
      let { interval, easeFactor, status } = this.currentCard;
      interval = interval || 0;
      easeFactor = easeFactor || 2.5;
      let nextDueDate = new Date();

      if (rating === 1) { // Again
          interval = 0;
          easeFactor = Math.max(1.3, easeFactor - 0.2);
          nextDueDate.setMinutes(nextDueDate.getMinutes() + 10);
      } else {
          if (status === 'new' || status === 'learning' || interval < 1) { // Treat intervals less than a day as 'learning'
              if (rating === 2) { // Hard
                  interval = 12 / 24; // 0.5 days
              } else if (rating === 3) { // Good
                  interval = 1; 
              } else if (rating === 4) { // Easy
                  interval = 4;
              }
          } else { // Reviewing
              if (rating === 2) { // Hard
                  interval = interval * 1.2;
                  easeFactor = Math.max(1.3, easeFactor - 0.15);
              } else if (rating === 3) { // Good
                  interval = interval * easeFactor;
              } else if (rating === 4) { // Easy
                  interval = interval * easeFactor * 1.3;
                  easeFactor += 0.15;
              }
          }
          const daysToAdd = Math.ceil(interval);
          nextDueDate.setDate(nextDueDate.getDate() + daysToAdd);
      }
      
      const updatedCard = {
          ...this.currentCard,
          interval,
          easeFactor,
          dueDate: nextDueDate.toISOString(),
          status: 'review'
      };
      await this.db.set('leitner_cards', updatedCard);
      this.showNextCard();
  }
  
  // --- Import/Export ---
  showImportTextModal() { this.importTextModal.classList.remove("hidden"); }
  hideImportTextModal() { this.importTextModal.classList.add("hidden"); }

  handleFileImport(e) {
      const file = e.target.files[0];
      if (!file) return;
      if (file.type !== "text/plain") {
          alert("Please upload a .txt file.");
          return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
          this.importTextArea.value = event.target.result;
      };
      reader.onerror = (error) => {
          console.error("File reading error:", error);
          alert("Failed to read the file.");
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset file input to allow re-uploading the same file
  }

  async handleClipboardImport() {
      try {
          if (!navigator.clipboard?.readText) {
              alert("Clipboard access is not supported by your browser.");
              return;
          }
          const text = await navigator.clipboard.readText();
          this.importTextArea.value = text;
      } catch (error) {
          console.error("Clipboard reading error:", error);
          alert("Failed to paste from clipboard.");
      }
  }

  createChatFromImport() {
      const text = this.importTextArea.value.trim();
      if (!text) {
          alert("There is no text to import.");
          return;
      }
      const name = text.substring(0, 30) + (text.length > 30 ? "... (Imported)" : " (Imported)");
      const id = Date.now().toString();
      const firstMessage = {
          id: `msg-${Date.now()}`,
          role: 'ai', // Treat imported content as an AI message for context
          content: text,
          timestamp: new Date().toISOString()
      };
      const newChat = { id, title: name, messages: [firstMessage], createdAt: new Date().toISOString() };
      this.chats.unshift(newChat);
      this.saveChats();
      this.switchToChat(id);
      this.renderChatList();
      this.hideImportTextModal();
      this.importTextArea.value = ""; // Clear textarea after import
  }

  async exportDictionary() {
    try {
      const allWords = await this.db.getAll('word_meanings');
      if (allWords.length === 0) {
        alert("Your dictionary is empty.");
        return;
      }
      const dataStr = JSON.stringify(allWords, null, 2);
      const dataBlob = new Blob([dataStr], {type: "application/json"});
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ai_chat_dictionary.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert("Dictionary exported successfully!");
    } catch (error) {
      console.error("Error exporting dictionary:", error);
      alert("Failed to export dictionary.");
    }
  }

  async importDictionary(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "application/json") {
      alert("Please upload a .json file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const words = JSON.parse(e.target.result);
        if (!Array.isArray(words)) {
          throw new Error("Invalid JSON format. Expected an array of words.");
        }
        let importedCount = 0;
        let skippedCount = 0;
        for (const wordData of words) {
          if (wordData.word && wordData.value) {
            await this.db.set('word_meanings', wordData);
            importedCount++;
          } else {
            skippedCount++;
          }
        }
        alert(`Dictionary import complete!\nImported: ${importedCount}\nSkipped: ${skippedCount}`);
      } catch (error) {
        console.error("Error importing dictionary:", error);
        alert(`Failed to import dictionary: ${error.message}`);
      }
    };
    reader.onerror = (error) => {
      console.error("File reading error:", error);
      alert("Failed to read the file.");
    };
    reader.readAsText(file);
    event.target.value = '';
  }
}

// Instantiate the app
document.addEventListener('DOMContentLoaded', () => {
    new AIChatApp();
});
