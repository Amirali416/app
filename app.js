// --- Database Helper for Caching ---
class CacheDB {
  constructor(dbName = "AIChatCache", version = 3) {
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
          leitnerStore.createIndex("dueDate", "dueDate", { unique: false });
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
    this.theme = localStorage.getItem("theme") || "light";
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

    // Voice recording
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;

    this.initElements();
    this.bindEvents();
    this.initApp();
  }

  // ---------- INIT / UI ----------
  async initApp() {
    await this.db.init().catch(err => console.error("Failed to initialize cache DB.", err));
    
    // Apply saved theme
    this.applyTheme(this.theme);
    
    const style = document.createElement('style');
    // **MODIFIED STYLES FOR CARD BACK**
    style.textContent = `
        .tts-highlight { background-color: var(--primary-color); color: white; border-radius: 3px; padding: 0 2px; } 
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
            color: var(--text-color); 
            background-color: var(--hover-bg); 
            padding: 2px 6px; 
            border-radius: 8px;
        }
    `;
    document.head.appendChild(style);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Always show app, user can add API key later from settings
    this.showApp();
    this.renderChatList();
    if (this.chats.length > 0) this.switchToChat(this.chats[0].id);
    else this.showChatNameModal();
    
    this.hideLoading();
  }

  initElements() {
    this.loadingScreen = document.getElementById("loading-screen");
    this.toastContainer = document.getElementById("toast-container");
    // API modal removed - now in settings only
    this.chatNameModal = document.getElementById("chat-name-modal");
    this.chatNameInput = document.getElementById("chat-name-input");
    this.saveChatNameBtn = document.getElementById("save-chat-name");
    this.cancelChatNameBtn = document.getElementById("cancel-chat-name");
    this.settingsModal = document.getElementById("settings-modal");
    this.newApiKeyInput = document.getElementById("new-api-key-input");
    this.avalaiApiKeyInput = document.getElementById("avalai-api-key-input");
    this.chatProviderSelect = document.getElementById("chat-provider-select");
    this.ttsProviderSelect = document.getElementById("tts-provider-select");
    this.themeSelect = document.getElementById("theme-select");
    this.saveSettingsBtn = document.getElementById("save-settings");
    this.cancelSettingsBtn = document.getElementById("cancel-settings");
    this.app = document.getElementById("app");
    this.chatListItems = document.getElementById("chat-list-items");
    this.chatTitle = document.getElementById("chat-title");
    this.messagesDiv = document.getElementById("messages");
    this.messageInput = document.getElementById("message-input");
    this.sendBtn = document.getElementById("send-btn");
    this.voiceBtn = document.getElementById("voice-btn");
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
    this.currentChatLeitnerBtn = document.getElementById("current-chat-leitner-btn");
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
    // API modal removed - API key now managed in settings only
    this.sidebarNewChatBtn.addEventListener("click", () => this.showChatNameModal());
    this.headerNewChatBtn.addEventListener("click", () => this.showChatNameModal());
    this.saveChatNameBtn.addEventListener("click", () => this.createChatWithName());
    this.cancelChatNameBtn.addEventListener("click", () => this.hideChatNameModal());
    this.chatNameModal.addEventListener("click", (e) => { if (e.target === this.chatNameModal) this.hideChatNameModal(); });
    this.chatNameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") this.createChatWithName(); });
    this.settingsBtn.addEventListener("click", () => this.showSettingsModal());
    this.saveSettingsBtn.addEventListener("click", () => this.saveSettings());
    this.cancelSettingsBtn.addEventListener("click", () => this.hideSettingsModal());
    this.settingsModal.addEventListener("click", (e) => { if (e.target === this.settingsModal) this.hideSettingsModal(); });
    this.renameChatBtn.addEventListener("click", () => this.renameChat());
    this.deleteChatBtn.addEventListener("click", () => this.deleteChat());
    this.menuToggle?.addEventListener("click", () => this.toggleSidebar());
    this.sendBtn.addEventListener("click", () => this.sendMessage());
    this.voiceBtn?.addEventListener("click", () => this.toggleVoiceRecording());
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
    this.currentChatLeitnerBtn?.addEventListener("click", () => this.openLeitnerModal(this.currentChatId));
    this.closeLeitnerBtn.addEventListener("click", () => this.closeLeitnerModal());
    this.leitnerModal.addEventListener("click", (e) => { if (e.target === this.leitnerModal) this.closeLeitnerModal(); });
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
    this.importTextModal.addEventListener("click", (e) => { if (e.target === this.importTextModal) this.hideImportTextModal(); });
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

  showToast(message, type = 'info', duration = 3000) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const titles = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Info'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <div class="toast-content">
        <div class="toast-title">${titles[type]}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close">×</button>
    `;

    this.toastContainer.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.removeToast(toast));

    if (duration > 0) {
      setTimeout(() => this.removeToast(toast), duration);
    }
  }

  removeToast(toast) {
    toast.classList.add('hiding');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }

  showSettingsModal() {
    this.newApiKeyInput.value = this.API_KEY || "";
    this.avalaiApiKeyInput.value = this.AVALAI_API_KEY || "";
    this.chatProviderSelect.value = this.chatProvider;
    this.ttsProviderSelect.value = this.ttsProvider;
    this.themeSelect.value = this.theme;
    this.settingsModal.classList.remove("hidden");
  }

  hideSettingsModal() { this.settingsModal.classList.add("hidden"); }
  showApp() { this.app.classList.remove("hidden"); }

  saveSettings() {
    const geminiKey = this.newApiKeyInput.value.trim();
    const avalaiKey = this.avalaiApiKeyInput.value.trim();
    const chatProvider = this.chatProviderSelect.value;
    const ttsProvider = this.ttsProviderSelect.value;
    const theme = this.themeSelect.value;
    localStorage.setItem("gemini_api_key", geminiKey);
    this.API_KEY = geminiKey;
    localStorage.setItem("avalai_api_key", avalaiKey);
    this.AVALAI_API_KEY = avalaiKey;
    localStorage.setItem("chat_provider", chatProvider);
    this.chatProvider = chatProvider;
    localStorage.setItem("tts_provider", ttsProvider);
    this.ttsProvider = ttsProvider;
    localStorage.setItem("theme", theme);
    this.theme = theme;
    this.applyTheme(theme);
    this.hideSettingsModal();
    this.showToast("Settings saved successfully!", "success");
  }

  applyTheme(theme) {
    // Remove all theme classes
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-blue', 'theme-purple');
    
    // Add selected theme class
    document.body.classList.add(`theme-${theme}`);
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
      this.showToast("Failed to play audio.", "error");
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
      if (!response.ok) throw new Error(`Provider 2 TTS API error: ${response.status} ${response.statusText}`);
      const audioBlob = await response.blob();
      await this.playAudio(audioBlob, button, progressBar);
      await this.db.set('audio_cache', { text: text, value: audioBlob }).catch(err => console.error("Failed to cache audio:", err));
    } catch (error) {
      console.error("Provider 2 TTS Error:", error);
      button.classList.remove("playing");
      button.disabled = false;
      if (progressBar) this.updateProgress(progressBar, 0);
      this.showToast(`Failed to generate speech with Provider 2: ${error.message}`, "error");
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
      if (!response.ok) throw new Error(`Provider 1 TTS API error: ${response.status}`);
      const result = await response.json();
      const part = result?.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;
      if (!audioData) throw new Error("Invalid audio data from Provider 1 API.");
      const sampleRateMatch = mimeType.match(/rate=(\d+)/);
      const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;
      const pcmDataBuffer = this.base64ToArrayBuffer(audioData);
      const pcm16 = new Int16Array(pcmDataBuffer);
      const wavBlob = this.pcmToWav(pcm16, sampleRate);
      await this.playAudio(wavBlob, button, progressBar);
      await this.db.set('audio_cache', { text: text, value: wavBlob }).catch(err => console.error("Failed to cache audio:", err));
    } catch (error) {
      console.error("Provider 1 TTS Error:", error);
      button.classList.remove("playing");
      button.disabled = false;
      if (progressBar) this.updateProgress(progressBar, 0);
      this.showToast(`Failed to generate speech with Provider 1: ${error.message}`, "error");
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
      utterance.onerror = (e) => { console.error("Browser TTS Error:", e); this.showToast("Failed to generate speech.", "error"); };
      button.disabled = true; button.classList.add("playing"); speechSynthesis.speak(utterance);
    } catch (error) {
      console.error("Browser TTS Error:", error);
      this.showToast("Text-to-speech is not supported in your browser.", "error");
    }
  }

  findWordIndexAtChar(text, charIndex) { const textUpToChar = text.substring(0, charIndex); const words = textUpToChar.split(/\s+/).filter(w => w.length > 0); return words.length; }
  updateProgress(progressBar, percentage) { if (progressBar) progressBar.style.width = `${percentage}%`; }
  
  // Download word audio as MP3
  formatMessageContent(content, messageId) {
    if (content.startsWith('❌ Error:')) return `<p>${content}</p>`;
    
    let html;
    if (typeof marked === 'function') {
      // Configure marked for better formatting
      marked.setOptions({
        gfm: true,
        breaks: true,
        sanitize: false,
        smartLists: true,
        smartypants: true
      });
      html = marked.parse(content);
    } else {
      console.warn("Marked.js not loaded. Using basic formatting.");
      html = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    
    // Apply Persian font to Persian text
    this.applyPersianFont(doc.body.firstChild);
    
    // Make English words clickable
    this.processNodeForClickable(doc.body.firstChild, messageId);
    
    return doc.body.firstChild.innerHTML;
  }
  
  applyPersianFont(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let textNode;
    
    while (textNode = walker.nextNode()) {
      textNodes.push(textNode);
    }
    
    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      // Check if contains Persian/Arabic characters
      if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) {
        const parent = textNode.parentNode;
        if (parent && !parent.classList.contains('persian-text')) {
          const span = document.createElement('span');
          span.className = 'persian-text';
          span.textContent = text;
          parent.replaceChild(span, textNode);
        }
      }
    });
  }
  
  processNodeForClickable(node, messageId) {
    let wordCounter = 0; 
    const nodesToProcess = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    let textNode; 
    
    while (textNode = walker.nextNode()) { 
      const parent = textNode.parentNode; 
      if (parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') { 
        nodesToProcess.push(textNode); 
      } 
    }
    
    nodesToProcess.forEach(textNode => {
      const parent = textNode.parentNode;
      // Split by word boundaries and keep whitespace
      const words = textNode.textContent.split(/(\s+)/);
      if (words.every(w => w.trim() === '')) return;
      
      const fragment = document.createDocumentFragment();
      words.forEach(word => {
        // Check if word contains English letters
        if (/[a-zA-Z]+/.test(word)) {
          // Extract pure word without punctuation
          const cleanWord = word.replace(/^[^\w]+|[^\w]+$/g, '').replace(/[^\w\s'-]/g, '');
          
          if (cleanWord && /^[a-zA-Z'-]+$/.test(cleanWord)) {
            // Get leading and trailing punctuation
            const leadingPunct = word.match(/^[^\w]+/)?.[0] || '';
            const trailingPunct = word.match(/[^\w]+$/)?.[0] || '';
            
            // Add leading punctuation
            if (leadingPunct) {
              fragment.appendChild(document.createTextNode(leadingPunct));
            }
            
            // Create span for the clean word
            const span = document.createElement('span');
            span.className = 'ai-word tts-word';
            span.dataset.word = cleanWord.toLowerCase(); // Store clean lowercase word
            span.id = `word-${messageId}-${wordCounter++}`;
            span.textContent = cleanWord; // Display clean word
            fragment.appendChild(span);
            
            // Add trailing punctuation
            if (trailingPunct) {
              fragment.appendChild(document.createTextNode(trailingPunct));
            }
          } else {
            fragment.appendChild(document.createTextNode(word));
          }
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
    if (!this.API_KEY) throw new Error("Provider 1 API key is not set.");
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
    if (!response.ok) { const errorText = await response.text(); throw new Error(`Provider 1 API Error: ${response.status}, ${errorText}`); }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't get a response from Provider 1.";
  }

  async callAvalaiChatAPI(message) {
    if (!this.AVALAI_API_KEY) throw new Error("Provider 2 API key is not set.");
    const chat = this.chats.find(c => c.id === this.currentChatId);
    if (!chat) throw new Error("Chat not found");
    const history = chat.messages.filter(msg => msg.role !== "system").slice(-10).map(msg => ({
      role: msg.role === "user" ? "user" : "assistant", content: msg.content
    }));
    const requestBody = { model: "gpt-5-nano", messages: [...history, { role: "user", content: message }] };
    const response = await fetch('https://api.avalai.ir/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${this.AVALAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
    });
    if (!response.ok) { const errorText = await response.text(); throw new Error(`Provider 2 API Error: ${response.status}, ${errorText}`); }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response from Provider 2.";
  }

  // ---------- Dictionary / Translation ----------
  async getWordMeaning(word) {
    if (this.chatProvider === 'avalai') return this.getWordMeaningAvalai(word);
    return this.getWordMeaningGemini(word);
  }

  async getWordMeaningAvalai(word) {
    const lowerWord = word.toLowerCase().trim();
    try { const cachedMeaning = await this.db.get('word_meanings', lowerWord); if (cachedMeaning) return cachedMeaning.value; } catch (err) { console.error("Error reading meaning cache:", err); }
    if (!this.AVALAI_API_KEY) return { meanings: [{ text: `No Provider 2 API Key`, type: "Error" }], synonyms: [], antonyms: [] };
    const prompt = `You are a dictionary assistant. Your only task is to provide the Persian translation and details for an English word in a strict JSON format. Word: "${word}". Provide the output ONLY in the following JSON format. Do not add any extra text, explanations, or markdown. { "meanings": [{"text": "Persian translation", "type": "part of speech in Persian"}], "synonyms": ["synonym1", "synonym2"], "antonyms": ["antonym1"] }. For the "type" field, use one of these Persian terms: اسم, فعل, صفت, قید, حرف ندا, حرف ربط, حرف اضافه. If the word is not found or has no synonyms/antonyms, return empty arrays for the respective fields. Example for the word "hi": { "meanings": [{"text": "سلام", "type": "حرف ندا"}], "synonyms": ["hello"], "antonyms": [] }`;
    const returnError = (message) => ({ meanings: [{ text: message, type: "Error" }], synonyms: [], antonyms: [] });
    try {
      const response = await fetch('https://api.avalai.ir/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.AVALAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: "gpt-5-nano", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } })
      });
      if (!response.ok) return returnError(`Provider 2 API Error: ${response.status}`);
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) return returnError("No response from Provider 2 API");
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
      console.error("Word meaning error (Provider 2):", error);
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

    // Close popup when clicking outside the content area
    newPopup.addEventListener('click', (e) => {
        if (e.target === newPopup) {
            this.hidePopup(newPopup);
            newPopup.remove();
        }
    });

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
          // Clean the word before showing meaning
          const rawWord = event.target.textContent.trim();
          const cleanWord = rawWord.replace(/^[^\w]+|[^\w]+$/g, '').replace(/[^\w\s'-]/g, '').toLowerCase();
          if (cleanWord) {
              this.showWordMeaning(cleanWord);
          }
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
      console.error("Translation error (Provider 2):", error);
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
      // Clean single words before showing meaning
      if (!/\s/.test(selectedText)) {
        const cleanWord = selectedText.replace(/^[^\w]+|[^\w]+$/g, '').replace(/[^\w\s'-]/g, '').toLowerCase();
        if (cleanWord) {
          this.showWordMeaning(cleanWord);
        }
      } else {
        this.showTranslationPopup(selectedText);
      }
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
      this.showToast("Cannot add word. No word or chat selected.", "warning");
      return;
    }
    try {
      const existingCard = await this.db.get('leitner_cards', lowerWord);
      if (existingCard) {
        this.showToast(`"${lowerWord}" is already in your flashcards.`, "info");
        // Play audio even if already exists
        await this.playTextToSpeech(lowerWord, null, null, null);
        return;
      }
      // SM-2 Initial values
      const newCard = {
        word: lowerWord,
        chatId: this.currentChatId,
        createdAt: new Date().toISOString(),
        dueDate: new Date().toISOString(), // Due immediately for new cards
        repetitions: 0, // Number of consecutive correct reviews
        interval: 0, // Days until next review
        easeFactor: 2.5, // SM-2 default ease factor
        lastReviewed: null,
        status: 'new' // 'new', 'learning', 'review'
      };
      await this.db.set('leitner_cards', newCard);
      
      // Play audio automatically after adding
      await this.playTextToSpeech(lowerWord, null, null, null);
      
      this.showToast(`"${lowerWord}" added to flashcards!`, "success");
    } catch (error) {
      console.error("Error adding card to Leitner:", error);
      this.showToast("Failed to add word to flashcards.", "error");
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
        // Filter by chat if chatId is provided
        if (chatId && card.chatId !== chatId) return false;
        
        // Check if card is due
        const dueDate = new Date(card.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate <= today;
      });
      
      // Shuffle cards
      this.leitnerQueue = cardsToReview.sort(() => Math.random() - 0.5);
      
      // Calculate stats
      const newCount = this.leitnerQueue.filter(c => c.repetitions === 0).length;
      const reviewCount = this.leitnerQueue.filter(c => c.repetitions > 0).length;
      
      this.leitnerStatsNew.textContent = `New: ${newCount}`;
      this.leitnerStatsDue.textContent = `Review: ${reviewCount}`;
      
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
  
  // SM-2 Algorithm Implementation (Standard Spaced Repetition)
  calculateSM2(card, quality) {
    /*
     * Anki SM-2 Algorithm with Learning Steps
     * quality: 0-5 where:
     *   0: Again (Complete blackout)
     *   2: Hard (Incorrect but remembered)  
     *   3: Good (Correct but difficult)
     *   5: Easy (Perfect recall)
     */
    
    let { repetitions, interval, easeFactor } = card;
    
    // Ensure defaults
    repetitions = repetitions || 0;
    interval = interval || 0;
    easeFactor = easeFactor || 2.5;
    
    let newRepetitions;
    let newInterval;
    let newEaseFactor;
    
    if (quality < 3) {
      // Failed card - reset to learning
      newRepetitions = 0;
      // Again button shows card in same session for new cards, tomorrow for review cards
      if (repetitions === 0) {
        newInterval = 0; // Show again soon (display as <1d)
      } else {
        newInterval = 1; // Review tomorrow for lapsed cards
      }
      newEaseFactor = Math.max(1.3, easeFactor - 0.2); // Decrease ease factor
    } else {
      // Passed card
      // Calculate new ease factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
      newEaseFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
      
      if (repetitions === 0) {
        // First successful review (Learning -> Graduated)
        if (quality === 5) {
          // Easy button on new card - graduate immediately with longer interval
          newInterval = 4; // Anki default: 4 days for easy on new cards
          newRepetitions = 2; // Skip learning phase
        } else if (quality === 2) {
          // Hard button on new card - stay in learning longer
          newInterval = 0; // Show again in same session
          newRepetitions = 0; // Stay in learning
        } else {
          // Good button on new card - graduate to review
          newInterval = 1; // Graduate with 1 day interval
          newRepetitions = 1;
        }
      } else if (repetitions === 1) {
        // Second successful review (first review after graduating)
        if (quality === 5) {
          // Easy button
          newInterval = Math.round(interval * newEaseFactor * 1.3); // Bonus for easy
        } else if (quality === 2) {
          // Hard button - slightly longer than current
          newInterval = Math.max(2, Math.round(interval * 1.2)); // At least 2 days
        } else {
          // Good button
          newInterval = 6; // Anki default graduating interval (2nd review)
        }
        newRepetitions = 2;
      } else {
        // Mature card (repetitions >= 2)
        if (quality === 5) {
          // Easy button - bonus multiplier
          newInterval = Math.round(interval * newEaseFactor * 1.3);
        } else if (quality === 2) {
          // Hard button - multiply by 1.2
          newInterval = Math.max(Math.round(interval * 1.2), interval + 1);
        } else {
          // Good button - normal interval
          newInterval = Math.round(interval * newEaseFactor);
        }
        newRepetitions = repetitions + 1;
      }
    }
    
    return {
      repetitions: newRepetitions,
      interval: newInterval,
      easeFactor: newEaseFactor
    };
  }
  
  formatInterval(days) {
    if (!days || days < 1) return `<1d`;
    if (days === 1) return `1 day`;
    if (days < 30) return `${days} days`;
    const months = Math.round(days / 30);
    if (months === 1) return `1 month`;
    if (months < 12) return `${months} months`;
    const years = Math.round(months / 12);
    return years === 1 ? `1 year` : `${years} years`;
  }
  
  updateRatingButtons() {
    if (!this.currentCard) return;
    
    const card = this.currentCard;
    
    // Calculate what would happen with each rating
    const againResult = this.calculateSM2(card, 0);
    const hardResult = this.calculateSM2(card, 2);
    const goodResult = this.calculateSM2(card, 3);
    const easyResult = this.calculateSM2(card, 5);
    
    // Update button labels with intervals
    this.ratingAgainBtn.querySelector('small').textContent = this.formatInterval(againResult.interval);
    this.ratingHardBtn.querySelector('small').textContent = this.formatInterval(hardResult.interval);
    this.ratingGoodBtn.querySelector('small').textContent = this.formatInterval(goodResult.interval);
    this.ratingEasyBtn.querySelector('small').textContent = this.formatInterval(easyResult.interval);
  }

  async rateCard(rating) {
    if (!this.currentCard) return;
    
    // Map our 4 buttons to SM-2 quality scores (0-5)
    const qualityMap = {
      1: 0, // Again = Complete failure
      2: 2, // Hard = Incorrect but remembered
      3: 3, // Good = Correct with difficulty
      4: 5  // Easy = Perfect recall
    };
    
    const quality = qualityMap[rating];
    const sm2Result = this.calculateSM2(this.currentCard, quality);
    
    // Calculate next due date
    const nextDueDate = new Date();
    nextDueDate.setHours(0, 0, 0, 0); // Set to midnight
    nextDueDate.setDate(nextDueDate.getDate() + sm2Result.interval);
    
    // Determine status
    let status;
    if (sm2Result.repetitions === 0) {
      status = 'learning';
    } else if (sm2Result.repetitions < 2) {
      status = 'learning';
    } else {
      status = 'review';
    }
    
    // Update card in database
    const updatedCard = {
      ...this.currentCard,
      repetitions: sm2Result.repetitions,
      interval: sm2Result.interval,
      easeFactor: sm2Result.easeFactor,
      dueDate: nextDueDate.toISOString(),
      lastReviewed: new Date().toISOString(),
      status: status
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
          this.showToast("Please upload a .txt file.", "warning");
          return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
          this.importTextArea.value = event.target.result;
      };
      reader.onerror = (error) => {
          console.error("File reading error:", error);
          this.showToast("Failed to read the file.", "error");
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset file input to allow re-uploading the same file
  }

  async handleClipboardImport() {
      try {
          if (!navigator.clipboard?.readText) {
              this.showToast("Clipboard access is not supported by your browser.", "error");
              return;
          }
          const text = await navigator.clipboard.readText();
          this.importTextArea.value = text;
      } catch (error) {
          console.error("Clipboard reading error:", error);
          this.showToast("Failed to paste from clipboard.", "error");
      }
  }

  createChatFromImport() {
      const text = this.importTextArea.value.trim();
      if (!text) {
          this.showToast("There is no text to import.", "warning");
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
        this.showToast("Your dictionary is empty.", "info");
        return;
      }
      
      // Get all audio cache entries
      const allAudio = await this.db.getAll('audio_cache');
      
      // Create a map of text -> audio for quick lookup
      const audioMap = {};
      for (const audioEntry of allAudio) {
        if (audioEntry.text && audioEntry.value) {
          // Convert Blob to base64
          const base64Audio = await this.blobToBase64(audioEntry.value);
          audioMap[audioEntry.text.toLowerCase()] = base64Audio;
        }
      }
      
      // Add audio data to word entries
      const wordsWithAudio = allWords.map(wordEntry => {
        const wordText = wordEntry.word?.toLowerCase();
        if (wordText && audioMap[wordText]) {
          return {
            ...wordEntry,
            audio: audioMap[wordText]
          };
        }
        return wordEntry;
      });
      
      const dataStr = JSON.stringify(wordsWithAudio, null, 2);
      const dataBlob = new Blob([dataStr], {type: "application/json"});
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ai_chat_dictionary.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.showToast("Dictionary exported successfully!", "success");
    } catch (error) {
      console.error("Error exporting dictionary:", error);
      this.showToast("Failed to export dictionary.", "error");
    }
  }
  
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  async base64ToBlob(base64Data) {
    const response = await fetch(base64Data);
    return await response.blob();
  }

  async importDictionary(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "application/json") {
      this.showToast("Please upload a .json file.", "warning");
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
        let audioCount = 0;
        
        for (const wordData of words) {
          if (wordData.word && wordData.value) {
            // Import word meaning (without audio field)
            const { audio, ...wordWithoutAudio } = wordData;
            await this.db.set('word_meanings', wordWithoutAudio);
            importedCount++;
            
            // Import audio if exists
            if (audio) {
              try {
                // Convert base64 to Blob
                const audioBlob = await this.base64ToBlob(audio);
                await this.db.set('audio_cache', { 
                  text: wordData.word.toLowerCase(), 
                  value: audioBlob 
                });
                audioCount++;
              } catch (audioError) {
                console.error(`Failed to import audio for "${wordData.word}":`, audioError);
              }
            }
          } else {
            skippedCount++;
          }
        }
        this.showToast(`Dictionary import complete! Words: ${importedCount}, Audio: ${audioCount}, Skipped: ${skippedCount}`, "success", 5000);
      } catch (error) {
        console.error("Error importing dictionary:", error);
        this.showToast(`Failed to import dictionary: ${error.message}`, "error");
      }
    };
    reader.onerror = (error) => {
      console.error("File reading error:", error);
      this.showToast("Failed to read the file.", "error");
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // --- Voice Recording & Whisper API ---
  
  async toggleVoiceRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        await this.transcribeAudio(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      
      // Update UI
      this.voiceBtn.classList.add('recording');
      this.voiceBtn.style.backgroundColor = '#ef4444';
      this.messageInput.placeholder = '🎙️ Recording... Click to stop';
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Cannot access microphone. Please check permissions.');
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      // Reset UI
      this.voiceBtn.classList.remove('recording');
      this.voiceBtn.style.backgroundColor = '';
      this.messageInput.placeholder = 'Type a message...';
    }
  }

  async transcribeAudio(audioBlob) {
    if (!this.AVALAI_API_KEY) {
      alert('Please set your API key in settings to use voice input.');
      return;
    }

    // Show loading indicator
    this.messageInput.placeholder = '🎧 Transcribing audio...';
    this.messageInput.disabled = true;

    try {
      // Convert webm to mp3/wav for better compatibility
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en'); // or 'fa' for Persian

      const response = await fetch('https://api.avalai.ir/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.AVALAI_API_KEY}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Transcription failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const transcribedText = data.text;

      // Insert transcribed text into input
      this.messageInput.value = transcribedText;
      this.adjustTextareaHeight();
      this.messageInput.focus();

    } catch (error) {
      console.error('Transcription error:', error);
      alert(`Failed to transcribe audio: ${error.message}`);
    } finally {
      this.messageInput.placeholder = 'Type a message...';
      this.messageInput.disabled = false;
    }
  }
}

// Instantiate the app
document.addEventListener('DOMContentLoaded', () => {
    new AIChatApp();
});
