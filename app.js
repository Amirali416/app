// --- Notification Manager for Toast Messages (replaces alert) ---
class NotificationManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Create container for notifications
    this.container = document.createElement('div');
    this.container.id = 'notification-container';
    this.container.className = 'notification-container';
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', duration = 4000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // Icon based on type
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    
    notification.innerHTML = `
      <div class="notification-icon">${icons[type] || icons.info}</div>
      <div class="notification-message">${message}</div>
    `;
    
    this.container.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => notification.classList.add('notification-show'), 10);
    
    // Auto remove
    setTimeout(() => {
      notification.classList.remove('notification-show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  success(message, duration) {
    this.show(message, 'success', duration);
  }

  error(message, duration) {
    this.show(message, 'error', duration);
  }

  warning(message, duration) {
    this.show(message, 'warning', duration);
  }

  info(message, duration) {
    this.show(message, 'info', duration);
  }
}

// --- Dialog Manager for Confirm/Prompt (replaces confirm/prompt) ---
class DialogManager {
  constructor() {
    this.overlay = null;
    this.init();
  }

  init() {
    // Create overlay for dialogs
    this.overlay = document.createElement('div');
    this.overlay.id = 'dialog-overlay';
    this.overlay.className = 'dialog-overlay';
    document.body.appendChild(this.overlay);
  }

  async confirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.className = 'dialog-box dialog-confirm';
      dialog.innerHTML = `
        <div class="dialog-header">${title}</div>
        <div class="dialog-body">${message}</div>
        <div class="dialog-footer">
          <button class="dialog-btn dialog-btn-cancel">Cancel</button>
          <button class="dialog-btn dialog-btn-confirm">Confirm</button>
        </div>
      `;
      
      this.overlay.appendChild(dialog);
      this.overlay.classList.add('dialog-overlay-show');
      setTimeout(() => dialog.classList.add('dialog-show'), 10);
      
      const cleanup = (result) => {
        dialog.classList.remove('dialog-show');
        this.overlay.classList.remove('dialog-overlay-show');
        setTimeout(() => {
          dialog.remove();
        }, 300);
        resolve(result);
      };
      
      dialog.querySelector('.dialog-btn-confirm').onclick = () => cleanup(true);
      dialog.querySelector('.dialog-btn-cancel').onclick = () => cleanup(false);
      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) cleanup(false);
      };
    });
  }

  async prompt(message, defaultValue = '', title = 'Input') {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.className = 'dialog-box dialog-prompt';
      dialog.innerHTML = `
        <div class="dialog-header">${title}</div>
        <div class="dialog-body">
          <div class="dialog-message">${message}</div>
          <input type="text" class="dialog-input" value="${defaultValue}" />
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn dialog-btn-cancel">Cancel</button>
          <button class="dialog-btn dialog-btn-confirm">OK</button>
        </div>
      `;
      
      this.overlay.appendChild(dialog);
      this.overlay.classList.add('dialog-overlay-show');
      setTimeout(() => dialog.classList.add('dialog-show'), 10);
      
      const input = dialog.querySelector('.dialog-input');
      input.focus();
      input.select();
      
      const cleanup = (result) => {
        dialog.classList.remove('dialog-show');
        this.overlay.classList.remove('dialog-overlay-show');
        setTimeout(() => {
          dialog.remove();
        }, 300);
        resolve(result);
      };
      
      const submit = () => {
        const value = input.value.trim();
        cleanup(value || null);
      };
      
      dialog.querySelector('.dialog-btn-confirm').onclick = submit;
      dialog.querySelector('.dialog-btn-cancel').onclick = () => cleanup(null);
      input.onkeydown = (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') cleanup(null);
      };
      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) cleanup(null);
      };
    });
  }
}

// Global instances
const notificationManager = new NotificationManager();
const dialogManager = new DialogManager();

// --- Database Helper for Caching ---
class CacheDB {
  constructor(dbName = "AIChatCache", version = 6) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = (event) => { 
        console.error("IndexedDB error:", event.target.error); 
        reject("IndexedDB error"); 
      };
      request.onsuccess = (event) => { 
        this.db = event.target.result;
        resolve(); 
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        
        // Create word_meanings store if not exists
        if (!db.objectStoreNames.contains("word_meanings")) {
          db.createObjectStore("word_meanings", { keyPath: "word" });
        }
        
        // Create audio_cache store if not exists
        if (!db.objectStoreNames.contains("audio_cache")) {
          db.createObjectStore("audio_cache", { keyPath: "text" });
        }
        
        // Create leitner_cards_v2 store if not exists
        if (!db.objectStoreNames.contains("leitner_cards_v2")) {
          const leitnerStore = db.createObjectStore("leitner_cards_v2", { keyPath: "id" });
          leitnerStore.createIndex("scopeKey", "scopeKey", { unique: false });
          leitnerStore.createIndex("word", "word", { unique: false });
          leitnerStore.createIndex("dueDate", "dueDate", { unique: false });
        }

        // Migrate old leitner_cards to leitner_cards_v2 if exists
        if (db.objectStoreNames.contains("leitner_cards")) {
          const oldStore = event.target.transaction.objectStore("leitner_cards");
          const newStore = event.target.transaction.objectStore("leitner_cards_v2");
          oldStore.openCursor().onsuccess = (cursorEvent) => {
            const cursor = cursorEvent.target.result;
            if (cursor) {
              const value = cursor.value;
              if (value && value.word) {
                const scopeType = value.chatId ? 'chat' : 'global';
                const scopeId = value.chatId || 'all';
                const scopeKey = `${scopeType}:${scopeId}`;
                const id = `${scopeKey}:${value.word}`;
                const migrated = {
                  ...value,
                  id,
                  scopeType,
                  scopeId,
                  scopeKey,
                  createdAt: value.createdAt || new Date().toISOString(),
                  migratedFromLegacy: true
                };
                try {
                  newStore.put(migrated);
                } catch (migrationError) {
                  console.error('Failed to migrate card', value.word, migrationError);
                }
              }
              cursor.continue();
            }
          };
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

  async delete(storeName, key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = (event) => { console.error(`Error deleting data from ${storeName}:`, event.target.error); reject(event.target.error); };
    });
  }

  async clearStore(storeName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        console.error(`Error clearing data in ${storeName}:`, event.target.error);
        reject(event.target.error);
      };
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
    this.fontSize = parseInt(localStorage.getItem("font_size")) || 14;
    this.boldText = localStorage.getItem("bold_text") === "true";
    this.chats = JSON.parse(localStorage.getItem("chats")) || [];
    try {
      this.documents = JSON.parse(localStorage.getItem("documents")) || [];
    } catch (error) {
      console.error("Failed to parse documents:", error);
      this.documents = [];
    }
    this.documents = this.sanitizeDocuments(this.documents);
    this.currentChatId = null;
    this.currentDocumentId = null;
    this.activeSidebarSection = "chat";
    this.isLoading = false;
    this.selectedText = "";
    this.selectionTimeout = null;
    this.currentUtterance = null;
    this.db = new CacheDB();
  this.LEITNER_STORE = 'leitner_cards_v2';

    this.leitnerQueue = [];
    this.currentCard = null;
  this.currentLeitnerScope = this.getGlobalScope();
  this.leitnerDueCache = new Map();
  this.currentScopeCards = [];
  
  // Global highlighting system
  this.highlightObserver = null;
  this.highlightDebounceTimer = null;

    this.activePopups = [];
    this.baseZIndex = 1002;

  this.documentEditorDirty = false;
  this.collapsedFolders = new Set();

    // Voice recording
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    
    // Advanced TTS Player
    this.advancedTTSPlayer = new AdvancedTTSPlayer(this);
    this.activeTTSPlayers = new Map(); // messageId -> player instance

    this.initElements();
    this.bindEvents();
    this.initApp();
  }

  // ---------- INIT / UI ----------
  async initApp() {
    await this.db.init().catch(err => console.error("Failed to initialize cache DB.", err));
    
    // Apply saved theme
    this.applyTheme(this.theme);
    
    // Apply saved font size
    this.applyFontSize(this.fontSize);
    
    // Apply saved bold text setting
    this.applyBoldText(this.boldText);
    
    // Initialize global highlighting system
    this.initGlobalHighlighting();
    
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
    this.renderDocumentTree();
  this.switchSidebarSection(this.activeSidebarSection);
    if (this.chats.length > 0) this.switchToChat(this.chats[0].id);
    else this.showChatNameModal();
    this.updateDocumentPanelState();
    
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
    this.fontSizeSelect = document.getElementById("font-size-select");
    this.boldTextCheckbox = document.getElementById("bold-text-checkbox");
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
    this.documentMenuToggle = document.getElementById("document-menu-toggle");
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
    this.importAppDataBtn = document.getElementById("import-app-data-btn");
    this.appDataImportInput = document.getElementById("app-data-import-input");
    this.exportAppDataBtn = document.getElementById("export-app-data-btn");
    this.sidebarTabs = document.querySelectorAll(".sidebar-tab");
    this.chatSidebarSection = document.getElementById("chat-sidebar-section");
    this.documentSidebarSection = document.getElementById("document-sidebar-section");
    this.chatMainPanel = document.getElementById("chat-main");
    this.documentsMainPanel = document.getElementById("documents-main");
    this.documentTree = document.getElementById("document-tree");
    this.documentImportBtn = document.getElementById("document-import-btn");
    this.documentImportInput = document.getElementById("document-import-input");
    this.documentNewFileBtn = document.getElementById("document-new-file-btn");
    this.documentNewFolderBtn = document.getElementById("document-new-folder-btn");
    this.documentRenameBtn = document.getElementById("document-rename-btn");
    this.documentDeleteBtn = document.getElementById("document-delete-btn");
    this.documentTitleEl = document.getElementById("document-title");
    this.documentEditor = document.getElementById("document-editor");
    this.documentContentView = document.getElementById("document-content-view");
    this.documentEmptyState = document.getElementById("document-empty-state");
    this.documentSaveBtn = document.getElementById("document-save-btn");
    this.documentEditBtn = document.getElementById("document-edit-btn");
    this.documentCancelBtn = document.getElementById("document-cancel-btn");
    this.globalLeitnerBtn = document.getElementById("global-leitner-btn");
    this.documentLeitnerBtn = document.getElementById("document-leitner-btn");
    this.documentEditMode = false;
  this.documentWordClickListenerAttached = false;
    
    // Document name modal
    this.documentNameModal = document.getElementById("document-name-modal");
    this.documentModalTitle = document.getElementById("document-modal-title");
    this.documentModalDescription = document.getElementById("document-modal-description");
    this.documentNameInput = document.getElementById("document-name-input");
    this.documentParentSelect = document.getElementById("document-parent-select");
    this.saveDocumentNameBtn = document.getElementById("save-document-name");
    this.cancelDocumentNameBtn = document.getElementById("cancel-document-name");
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
    this.documentMenuToggle?.addEventListener("click", () => this.toggleSidebar());
    this.sendBtn.addEventListener("click", () => this.sendMessage());
    this.voiceBtn?.addEventListener("click", () => this.toggleVoiceRecording());
    
    // Font size slider real-time update
    this.fontSizeSelect.addEventListener("input", (e) => {
      const sizeValue = e.target.value;
      document.getElementById("font-size-value").textContent = sizeValue;
    });
    
    this.messageInput.addEventListener("input", () => this.adjustTextareaHeight());
    this.messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); } });
    
    this.closeTranslationBtn.addEventListener("click", () => this.hidePopup(this.translationPopup));
    this.playTranslationAudioBtn.addEventListener("click", () => this.playTranslationAudio());
    this.translationPopup.addEventListener("click", (e) => { if (e.target === this.translationPopup) this.hidePopup(this.translationPopup); });

    this.messagesDiv.addEventListener("click", (e) => {
      // Handle word clicks
      if (e.target.classList.contains("ai-word")) {
        const word = e.target.dataset.word;
        if (word) {
          // Check if there's an active TTS player for this message
          const messageWrapper = e.target.closest('.message-wrapper');
          if (messageWrapper) {
            const messageId = messageWrapper.id;
            const player = this.activeTTSPlayers.get(messageId);
            
            // If actively playing (not paused), jump to word
            if (player && player.isPlaying && !player.isPaused) {
              e.preventDefault();
              e.stopPropagation();
              
              // Find word index and jump
              const wordText = e.target.textContent.toLowerCase();
              const wordIndex = player.words.findIndex(w => w.text.toLowerCase() === wordText);
              if (wordIndex >= 0) {
                player.jumpToWord(wordIndex);
              }
              return;
            }
          }
          
          // Normal word meaning lookup (when paused/stopped/no player)
          e.preventDefault();
          e.stopPropagation();
          this.showWordMeaning(word);
        }
      }
      // Handle delete button
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
      if (this.sidebar.classList.contains("active") && !this.sidebar.contains(e.target) && e.target !== this.menuToggle && !this.menuToggle.contains(e.target) && e.target !== this.documentMenuToggle && !this.documentMenuToggle?.contains(e.target)) this.hideSidebar();
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
    
    // Keyboard shortcuts for Leitner
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts when Leitner modal is open
      if (this.leitnerModal.classList.contains('hidden')) return;
      
      // Space or Enter to flip card
      if ((e.key === ' ' || e.key === 'Enter') && !this.leitnerCard.classList.contains('is-flipped')) {
        e.preventDefault();
        this.flipCard();
        return;
      }
      
      // Rating shortcuts (only when card is flipped)
      if (this.leitnerCard.classList.contains('is-flipped')) {
        if (e.key === '1') {
          e.preventDefault();
          this.rateCard(1); // Again
        } else if (e.key === '2') {
          e.preventDefault();
          this.rateCard(2); // Hard
        } else if (e.key === '3') {
          e.preventDefault();
          this.rateCard(3); // Good
        } else if (e.key === '4') {
          e.preventDefault();
          this.rateCard(4); // Easy
        }
      }
      
      // Escape to close modal
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeLeitnerModal();
      }
    });
    
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
    this.importAppDataBtn.addEventListener("click", () => this.appDataImportInput.click());
    this.appDataImportInput.addEventListener("change", (e) => this.importAppData(e));
    this.exportAppDataBtn.addEventListener("click", () => this.exportAppData());
    this.sidebarTabs.forEach(tab => {
      tab.addEventListener("click", () => this.switchSidebarSection(tab.dataset.section));
    });
    this.documentImportBtn?.addEventListener("click", () => this.documentImportInput.click());
    this.documentImportInput?.addEventListener("change", (e) => this.importDocumentFromFile(e));
    this.documentNewFileBtn?.addEventListener("click", () => this.showDocumentNameModal('file'));
    this.documentNewFolderBtn?.addEventListener("click", () => this.showDocumentNameModal('folder'));
    this.documentRenameBtn?.addEventListener("click", () => this.renameDocument());
    this.documentDeleteBtn?.addEventListener("click", () => this.deleteDocument());
    this.documentSaveBtn?.addEventListener("click", () => this.saveCurrentDocument());
    this.documentEditBtn?.addEventListener("click", () => this.enterEditMode());
    this.documentCancelBtn?.addEventListener("click", () => this.cancelEditMode());
    this.documentEditor?.addEventListener("input", () => {
      this.documentEditorDirty = true;
    });
    this.saveDocumentNameBtn?.addEventListener("click", () => this.handleDocumentNameSave());
    this.cancelDocumentNameBtn?.addEventListener("click", () => this.hideDocumentNameModal());
    this.documentNameModal?.addEventListener("click", (e) => { if (e.target === this.documentNameModal) this.hideDocumentNameModal(); });
    this.documentNameInput?.addEventListener("keypress", (e) => { if (e.key === "Enter") this.handleDocumentNameSave(); });
    this.globalLeitnerBtn?.addEventListener("click", () => this.openLeitnerModal(null, { type: 'global' }));
    this.documentLeitnerBtn?.addEventListener("click", () => this.openLeitnerForCurrentDocument());
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
      success: 'OK',
      error: 'X',
      warning: '!',
      info: 'i'
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
    this.fontSizeSelect.value = this.fontSize;
    document.getElementById("font-size-value").textContent = this.fontSize;
    this.boldTextCheckbox.checked = this.boldText;
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
    const fontSize = this.fontSizeSelect.value;
    const boldText = this.boldTextCheckbox.checked;
    
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
    localStorage.setItem("font_size", fontSize);
    this.fontSize = fontSize;
    this.applyFontSize(fontSize);
    localStorage.setItem("bold_text", boldText);
    this.boldText = boldText;
    this.applyBoldText(boldText);
    this.hideSettingsModal();
    this.showToast("Settings saved successfully!", "success");
  }

  applyTheme(theme) {
    // Remove all theme classes
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-blue', 'theme-purple', 'theme-beige', 'theme-rgb-glass');
    
    // Add selected theme class
    document.body.classList.add(`theme-${theme}`);
  }
  
  applyFontSize(size) {
    // Remove all font size classes
    document.body.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
    
    // Convert to number if it's a string
    const fontSize = parseInt(size) || 14;
    
    // Apply font size using CSS custom property
    document.documentElement.style.setProperty('--dynamic-font-size', `${fontSize}px`);
  }
  
  applyBoldText(bold) {
    if (bold) {
      document.body.classList.add('text-bold');
    } else {
      document.body.classList.remove('text-bold');
    }
  }
  
  // Global Leitner Highlighting System
  initGlobalHighlighting() {
    // Create MutationObserver to watch for DOM changes
    this.highlightObserver = new MutationObserver((mutations) => {
      // Debounce to avoid too many updates
      if (this.highlightDebounceTimer) {
        clearTimeout(this.highlightDebounceTimer);
      }
      
      this.highlightDebounceTimer = setTimeout(() => {
        this.updateLeitnerHighlights();
      }, 100);
    });
    
    // Start observing the document with configured parameters
    const config = {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false
    };
    
    this.highlightObserver.observe(document.body, config);
  }
  
  stopGlobalHighlighting() {
    if (this.highlightObserver) {
      this.highlightObserver.disconnect();
      this.highlightObserver = null;
    }
    if (this.highlightDebounceTimer) {
      clearTimeout(this.highlightDebounceTimer);
      this.highlightDebounceTimer = null;
    }
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

  async switchToChat(id) {
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
    await this.preloadLeitnerForScope(this.getChatScope(id));
    this.updateLeitnerHighlights();
  }

  saveChats() { localStorage.setItem("chats", JSON.stringify(this.chats)); }

  renderChatList() {
    this.chatListItems.innerHTML = "";
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
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
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (await dialogManager.confirm(`Are you sure you want to delete the chat "${chat.title}"?`, 'Delete Chat')) {
          this.deleteChatById(chat.id);
        }
      };
      actionsDiv.appendChild(leitnerBtn); actionsDiv.appendChild(deleteBtn);
      li.appendChild(titleSpan); li.appendChild(actionsDiv);
      li.addEventListener("click", () => this.switchToChat(chat.id));
      if (chat.id === this.currentChatId) li.classList.add("active");
      fragment.appendChild(li);
    });
    
    // Append all at once
    this.chatListItems.appendChild(fragment);
  }

  switchSidebarSection(section) {
    const target = section === 'documents' ? 'documents' : 'chat';
    this.activeSidebarSection = target;

    if (this.sidebarTabs?.length) {
      this.sidebarTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === target);
      });
    }

    if (this.chatSidebarSection && this.documentSidebarSection) {
      if (target === 'chat') {
        this.chatSidebarSection.classList.remove('hidden');
        this.documentSidebarSection.classList.add('hidden');
      } else {
        this.chatSidebarSection.classList.add('hidden');
        this.documentSidebarSection.classList.remove('hidden');
      }
    }

    if (this.chatMainPanel && this.documentsMainPanel) {
      if (target === 'chat') {
        this.chatMainPanel.classList.remove('hidden');
        this.documentsMainPanel.classList.add('hidden');
      } else {
        this.chatMainPanel.classList.add('hidden');
        this.documentsMainPanel.classList.remove('hidden');
        this.updateDocumentPanelState();
      }
    }
  }

  saveDocuments() {
    try {
      localStorage.setItem('documents', JSON.stringify(this.documents));
    } catch (error) {
      console.error('Failed to save documents:', error);
    }
  }

  getScopeKey(scope) {
    if (!scope || !scope.type) return 'global:all';
    if (scope.type === 'global') return 'global:all';
    const id = scope.id || 'all';
    return `${scope.type}:${id}`;
  }

  getLeitnerCardId(word, scope) {
    const cleanWord = this.normalizeWord(word);
    return `${this.getScopeKey(scope)}:${cleanWord}`;
  }

  normalizeWord(word) {
    return (word || '').toString().trim().toLowerCase();
  }

  getChatScope(chatId = null) {
    const id = chatId || this.currentChatId;
    return id ? { type: 'chat', id } : { type: 'global' };
  }

  getDocumentScope(documentId = null) {
    const id = documentId || this.currentDocumentId;
    return id ? { type: 'document', id } : { type: 'global' };
  }

  getGlobalScope() {
    return { type: 'global', id: 'all' };
  }

  getActiveScope(includeGlobalFallback = true) {
    if (this.activeSidebarSection === 'documents' && this.currentDocumentId) {
      return this.getDocumentScope();
    }
    if (this.currentChatId) {
      return this.getChatScope();
    }
    return includeGlobalFallback ? this.getGlobalScope() : null;
  }

  async getLeitnerCardsByScope(scope, includeGlobal = true) {
    const scopeKey = this.getScopeKey(scope);
    const allCards = await this.db.getAll(this.LEITNER_STORE);
    const filtered = allCards.filter(card => card.scopeKey === scopeKey);
    if (includeGlobal && scopeKey !== 'global:all') {
      const globalCards = allCards.filter(card => card.scopeKey === 'global:all');
      return [...filtered, ...globalCards];
    }
    return filtered;
  }

  async preloadLeitnerForScope(scope) {
    const cards = await this.getLeitnerCardsByScope(scope, true);
    this.currentScopeCards = cards;
    this.leitnerDueCache.clear();
    
    // Store all cards in cache with their full key
    cards.forEach(card => {
      const wordKey = `${card.scopeKey}:${card.word}`;
      this.leitnerDueCache.set(wordKey, this.evaluateCardDueState(card));
    });
    
    this.updateLeitnerHighlights();
  }

  evaluateCardDueState(card) {
    if (!card) return { state: 'none' };
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const due = card.dueDate ? new Date(card.dueDate) : new Date();
    due.setHours(0, 0, 0, 0);
    
    const isDue = due <= now;
    const daysDiff = Math.floor((now - due) / (24 * 60 * 60 * 1000));
    const overdue = isDue && daysDiff > 1;
    
    return {
      state: isDue ? (overdue ? 'overdue' : 'due') : (card.repetitions === 0 ? 'new' : 'scheduled'),
      dueDate: card.dueDate,
      card
    };
  }

  async refreshLeitnerDueCacheForWord(word, scope) {
    const normalizedWord = this.normalizeWord(word);
    const scopeKey = this.getScopeKey(scope);
    const cardId = `${scopeKey}:${normalizedWord}`;
    
    // Try to get updated card from database
    try {
      const card = await this.db.get(this.LEITNER_STORE, cardId);
      if (card) {
        const wordKey = `${card.scopeKey}:${card.word}`;
        this.leitnerDueCache.set(wordKey, this.evaluateCardDueState(card));
      } else {
        // Card was deleted, remove from cache
        this.leitnerDueCache.delete(cardId);
      }
      
      // Also check for global card if not in global scope
      if (scopeKey !== 'global:all') {
        const globalCardId = `global:all:${normalizedWord}`;
        const globalCard = await this.db.get(this.LEITNER_STORE, globalCardId);
        if (globalCard) {
          const wordKey = `${globalCard.scopeKey}:${globalCard.word}`;
          this.leitnerDueCache.set(wordKey, this.evaluateCardDueState(globalCard));
        }
      }
      
      this.updateLeitnerHighlights();
    } catch (error) {
      console.error('Error refreshing Leitner cache for word:', error);
    }
  }

  sanitizeDocuments(documents) {
    if (!Array.isArray(documents)) return [];
    return documents
      .filter(doc => doc && doc.id)
      .map(doc => {
        const type = doc.type === 'folder' ? 'folder' : 'file';
        return {
          id: doc.id,
          title: doc.title || (type === 'folder' ? 'Untitled Folder' : 'Untitled Document'),
          type,
          parentId: doc.parentId || null,
          content: type === 'file' ? (doc.content || '') : undefined,
          createdAt: doc.createdAt || doc.updatedAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString()
        };
      });
  }

  renderDocumentTree() {
    if (!this.documentTree) return;
    this.documentTree.innerHTML = '';
    const roots = this.getDocumentChildren(null);
    if (roots.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'document-tree-empty';
      empty.textContent = 'No documents yet.';
      this.documentTree.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    roots.sort((a, b) => this.compareDocuments(a, b)).forEach(node => {
      fragment.appendChild(this.buildDocumentTreeNode(node));
    });
    this.documentTree.appendChild(fragment);
  }

  buildDocumentTreeNode(node) {
    const li = document.createElement('li');
    li.className = `document-node ${node.type}`;
    if (node.id === this.currentDocumentId) li.classList.add('active');
    if (node.type === 'folder' && this.collapsedFolders.has(node.id)) li.classList.add('collapsed');

    const row = document.createElement('div');
    row.className = 'document-node-row';
    row.dataset.id = node.id;
    row.dataset.type = node.type;

    if (node.type === 'folder') {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggle-icon';
      toggleBtn.innerHTML = this.getChevronIcon(this.collapsedFolders.has(node.id));
      toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.toggleFolderCollapse(node.id);
      });
      row.appendChild(toggleBtn);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'toggle-icon placeholder';
      row.appendChild(spacer);
    }

    const iconSpan = document.createElement('span');
    iconSpan.className = 'node-icon';
    iconSpan.innerHTML = this.getDocumentIcon(node.type);
    row.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'node-label';
    labelSpan.textContent = node.title || (node.type === 'folder' ? 'Untitled Folder' : 'Untitled Document');
  labelSpan.title = labelSpan.textContent;
    row.appendChild(labelSpan);

    row.addEventListener('click', () => {
      this.selectDocument(node.id);
    });

    li.appendChild(row);

    const children = this.getDocumentChildren(node.id);
    if (children.length > 0) {
      const childList = document.createElement('ul');
      children.sort((a, b) => this.compareDocuments(a, b)).forEach(child => {
        childList.appendChild(this.buildDocumentTreeNode(child));
      });
      li.appendChild(childList);
    }

    return li;
  }

  getDocumentChildren(parentId) {
    return this.documents.filter(doc => (parentId === null ? !doc.parentId : doc.parentId === parentId));
  }

  compareDocuments(a, b) {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  }

  getDocumentById(id) {
    if (!id) return null;
    return this.documents.find(doc => doc.id === id) || null;
  }

  toggleFolderCollapse(folderId) {
    if (this.collapsedFolders.has(folderId)) this.collapsedFolders.delete(folderId);
    else this.collapsedFolders.add(folderId);
    this.renderDocumentTree();
  }

  async selectDocument(documentId) {
    if (this.documentEditorDirty && this.currentDocumentId && this.currentDocumentId !== documentId) {
      const currentDoc = this.getDocumentById(this.currentDocumentId);
      if (currentDoc && currentDoc.type === 'file') {
        const discard = await dialogManager.confirm('You have unsaved changes in the current document. Discard them?', 'Unsaved Changes');
        if (!discard) {
          return;
        }
      }
      this.documentEditorDirty = false;
    }
    const doc = this.getDocumentById(documentId);
    if (!doc) return;
    this.currentDocumentId = documentId;
    this.documentEditorDirty = false;
    this.documentEditMode = false; // Always start in read mode
    this.renderDocumentTree();
    this.updateDocumentPanelState();
    this.preloadLeitnerForScope(this.getDocumentScope(documentId));
  }

  clearDocumentSelection() {
    this.currentDocumentId = null;
    this.documentEditorDirty = false;
    this.updateDocumentPanelState();
    this.renderDocumentTree();
    this.preloadLeitnerForScope(this.getGlobalScope());
  }

  updateDocumentPanelState() {
    if (!this.documentsMainPanel) return;
    const doc = this.getDocumentById(this.currentDocumentId);

    if (!doc) {
      if (this.documentTitleEl) this.documentTitleEl.textContent = 'Documents';
      if (this.documentEditor) this.documentEditor.classList.add('hidden');
      if (this.documentContentView) this.documentContentView.classList.add('hidden');
      if (this.documentEmptyState) {
        this.documentEmptyState.classList.remove('hidden');
        this.documentEmptyState.textContent = 'Select or create a document to begin.';
      }
      if (this.documentSaveBtn) this.documentSaveBtn.classList.add('hidden');
      if (this.documentEditBtn) this.documentEditBtn.classList.add('hidden');
      if (this.documentCancelBtn) this.documentCancelBtn.classList.add('hidden');
      this.documentEditMode = false;
      return;
    }

    if (this.documentTitleEl) this.documentTitleEl.textContent = doc.title || (doc.type === 'folder' ? 'Untitled Folder' : 'Untitled Document');

    if (doc.type === 'folder') {
      if (this.documentEditor) this.documentEditor.classList.add('hidden');
      if (this.documentContentView) this.documentContentView.classList.add('hidden');
      if (this.documentEmptyState) {
        this.documentEmptyState.classList.remove('hidden');
        this.documentEmptyState.textContent = 'Folder selected. Choose a document or create a new one.';
      }
      if (this.documentSaveBtn) this.documentSaveBtn.classList.add('hidden');
      if (this.documentEditBtn) this.documentEditBtn.classList.add('hidden');
      if (this.documentCancelBtn) this.documentCancelBtn.classList.add('hidden');
      this.documentEditMode = false;
      this.documentEditorDirty = false;
      return;
    }

    // File selected - show in read mode by default
    if (this.documentEmptyState) this.documentEmptyState.classList.add('hidden');
    
    if (!this.documentEditMode) {
      // Read mode
      this.showDocumentReadMode(doc);
    } else {
      // Edit mode
      this.showDocumentEditMode(doc);
    }
  }

  ensureDocumentWordClickListener() {
    if (!this.documentContentView || this.documentWordClickListenerAttached) return;

    this.documentContentView.addEventListener('click', (e) => {
      const wordTarget = e.target.closest('.ai-word');
      if (wordTarget) {
        const word = wordTarget.dataset.word;
        if (word) {
          const messageWrapper = wordTarget.closest('.message-wrapper');
          if (messageWrapper) {
            const messageId = messageWrapper.id;
            const player = this.activeTTSPlayers.get(messageId);
            // If actively playing (not paused), jump to word
            if (player && player.isPlaying && !player.isPaused) {
              e.preventDefault();
              e.stopPropagation();
              const wordText = wordTarget.textContent.toLowerCase();
              const wordIndex = player.words.findIndex(w => w.text.toLowerCase() === wordText);
              if (wordIndex >= 0) {
                player.jumpToWord(wordIndex);
              }
              return;
            }
          }

          // Normal word meaning lookup (when paused/stopped/no player)
          e.preventDefault();
          e.stopPropagation();
          this.showWordMeaning(word);
        }
        return;
      }
    });

    this.documentWordClickListenerAttached = true;
  }

  showDocumentReadMode(doc) {
    // Hide editor, show content view
    if (this.documentEditor) this.documentEditor.classList.add('hidden');
    if (this.documentContentView) {
      this.documentContentView.classList.remove('hidden');
      this.documentContentView.innerHTML = '';

      const messageId = `doc-${doc.id}`;
      const content = doc.content || '';
      const messageWrapper = this.buildMessageElement('ai', content, messageId, {
        allowDelete: false,
        includeAudio: content.trim().length > 0,
        includeCopy: true
      });

      this.documentContentView.appendChild(messageWrapper);
      this.ensureDocumentWordClickListener();
    }
    
    // Show Edit button, hide Save/Cancel
    if (this.documentEditBtn) this.documentEditBtn.classList.remove('hidden');
    if (this.documentSaveBtn) this.documentSaveBtn.classList.add('hidden');
    if (this.documentCancelBtn) this.documentCancelBtn.classList.add('hidden');
  }

  showDocumentEditMode(doc) {
    // Hide content view, show editor
    if (this.documentContentView) this.documentContentView.classList.add('hidden');
    if (this.documentEditor) {
      this.documentEditor.classList.remove('hidden');
      if (!this.documentEditorDirty) {
        this.documentEditor.value = doc.content || '';
      }
    }
    
    // Hide Edit button, show Save/Cancel
    if (this.documentEditBtn) this.documentEditBtn.classList.add('hidden');
    if (this.documentSaveBtn) this.documentSaveBtn.classList.remove('hidden');
    if (this.documentCancelBtn) this.documentCancelBtn.classList.remove('hidden');
  }

  enterEditMode() {
    if (!this.currentDocumentId) return;
    const doc = this.getDocumentById(this.currentDocumentId);
    if (!doc || doc.type !== 'file') return;
    
    this.documentEditMode = true;
    this.showDocumentEditMode(doc);
  }

  async cancelEditMode() {
    if (this.documentEditorDirty) {
      const discard = await dialogManager.confirm('You have unsaved changes. Discard them?', 'Unsaved Changes');
      if (!discard) return;
    }
    
    this.documentEditMode = false;
    this.documentEditorDirty = false;
    const doc = this.getDocumentById(this.currentDocumentId);
    if (doc) {
      this.showDocumentReadMode(doc);
    }
  }

  makeDocumentContentClickable() {
    // Add event listener for text selection in document editor
    if (!this.documentEditor) return;
    
    // Remove existing listeners
    if (this.documentEditorMouseUp) {
      this.documentEditor.removeEventListener('mouseup', this.documentEditorMouseUp);
    }
    if (this.documentEditorTouchEnd) {
      this.documentEditor.removeEventListener('touchend', this.documentEditorTouchEnd);
    }
    if (this.documentEditorClick) {
      this.documentEditor.removeEventListener('click', this.documentEditorClick);
    }
    
    // Add click listener for single words
    this.documentEditorClick = (e) => {
      // Get selection to check if user is selecting text
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      
      // If text is selected, don't handle click (let selection handler do it)
      if (selectedText) return;
      
      // Get word at cursor position
      const textarea = e.target;
      const cursorPos = textarea.selectionStart;
      const text = textarea.value;
      
      // Find word boundaries around cursor
      let start = cursorPos;
      let end = cursorPos;
      
      // Move start backward to find word start
      while (start > 0 && /[a-zA-Z'-]/.test(text[start - 1])) {
        start--;
      }
      
      // Move end forward to find word end
      while (end < text.length && /[a-zA-Z'-]/.test(text[end])) {
        end++;
      }
      
      // Extract the word
      const word = text.substring(start, end).trim();
      
      // Check if it's a valid English word
      if (word && /^[a-zA-Z'-]+$/.test(word)) {
        this.showWordMeaning(word.toLowerCase());
      }
    };
    
    // Add new listeners
    this.documentEditorMouseUp = () => this.handleDocumentSelection();
    this.documentEditorTouchEnd = () => this.handleDocumentSelection();
    
    this.documentEditor.addEventListener('click', this.documentEditorClick);
    this.documentEditor.addEventListener('mouseup', this.documentEditorMouseUp);
    this.documentEditor.addEventListener('touchend', this.documentEditorTouchEnd);
  }

  handleDocumentSelection() {
    if (!this.documentEditor) return;
    
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (!text) return;
    
    // Clear any existing timeout
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }
    
    // Check if it's a single word or a phrase
    const wordCount = text.split(/\s+/).length;
    
    if (wordCount === 1) {
      // Single word - show word meaning
      const cleanWord = text.replace(/^[^\w]+|[^\w]+$/g, '').replace(/[^\w\s'-]/g, '').toLowerCase();
      if (cleanWord && /^[a-zA-Z'-]+$/.test(cleanWord)) {
        this.showWordMeaning(cleanWord);
      }
    } else {
      // Multiple words - show translate button
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      this.selectedText = text;
      this.translateSelectionBtn.style.top = `${rect.top + window.scrollY - 45}px`;
      this.translateSelectionBtn.style.left = `${rect.left + window.scrollX}px`;
      this.translateSelectionBtn.classList.remove('hidden');
      
      this.selectionTimeout = setTimeout(() => {
        this.translateSelectionBtn.classList.add('hidden');
      }, 5000);
    }
  }

  getTargetFolderId() {
    const selected = this.getDocumentById(this.currentDocumentId);
    if (!selected) return null;
    if (selected.type === 'folder') return selected.id;
    return selected.parentId || null;
  }

  // Document Name Modal Functions
  showDocumentNameModal(type) {
    this.pendingDocumentType = type;
    this.documentModalTitle.textContent = type === 'folder' ? 'New Folder' : 'New Document';
    this.documentModalDescription.textContent = `Enter ${type} name:`;
    this.documentNameInput.value = type === 'folder' ? 'New Folder' : 'New Document';
    this.documentNameInput.select();
    
    // Populate parent selector with all folders
    this.populateParentFolderSelect();
    
    this.documentNameModal.classList.remove('hidden');
  }

  hideDocumentNameModal() {
    this.documentNameModal.classList.add('hidden');
    this.documentNameInput.value = '';
    this.pendingDocumentType = null;
  }

  populateParentFolderSelect() {
    this.documentParentSelect.innerHTML = '<option value="">Root (No parent)</option>';
    
    const addFolderOptions = (parentId = null, prefix = '') => {
      const folders = this.documents.filter(doc => 
        doc.type === 'folder' && 
        (parentId === null ? !doc.parentId : doc.parentId === parentId)
      ).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = prefix + (folder.title || 'Untitled Folder');
        this.documentParentSelect.appendChild(option);
        
        // Recursively add subfolders
        addFolderOptions(folder.id, prefix + '  ');
      });
    };
    
    addFolderOptions();
    
    // Pre-select current folder if we're inside one
    if (this.currentDocumentId) {
      const currentDoc = this.getDocumentById(this.currentDocumentId);
      if (currentDoc) {
        if (currentDoc.type === 'folder') {
          this.documentParentSelect.value = currentDoc.id;
        } else if (currentDoc.parentId) {
          this.documentParentSelect.value = currentDoc.parentId;
        }
      }
    }
  }

  handleDocumentNameSave() {
    const name = this.documentNameInput.value.trim();
    if (!name) {
      this.showToast('Name cannot be empty.', 'warning');
      return;
    }
    
    const parentId = this.documentParentSelect.value || null;
    
    if (this.pendingDocumentType === 'folder') {
      this.createDocumentFolderWithParent(name, parentId);
    } else {
      this.createDocumentFileWithParent(name, parentId);
    }
    
    this.hideDocumentNameModal();
  }

  createDocumentFileWithParent(name, parentId) {
    const newDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: name,
      type: 'file',
      parentId: parentId,
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.documents.push(newDoc);
    this.saveDocuments();
    this.renderDocumentTree();
    this.selectDocument(newDoc.id);
    this.showToast('Document created.', 'success');
  }

  createDocumentFolderWithParent(name, parentId) {
    const newFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: name,
      type: 'folder',
      parentId: parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.documents.push(newFolder);
    this.saveDocuments();
    this.renderDocumentTree();
    this.selectDocument(newFolder.id);
    this.showToast('Folder created.', 'success');
  }

  async createDocumentFile() {
    const name = await dialogManager.prompt('Document name', 'New Document', 'Create Document');
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      this.showToast('Document name cannot be empty.', 'warning');
      return;
    }
    const parentId = this.getTargetFolderId();
    const newDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: trimmed,
      type: 'file',
      parentId: parentId,
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.documents.push(newDoc);
    this.saveDocuments();
    this.renderDocumentTree();
    this.selectDocument(newDoc.id);
    this.showToast('Document created.', 'success');
  }

  async createDocumentFolder() {
    const name = await dialogManager.prompt('Folder name', 'New Folder', 'Create Folder');
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      this.showToast('Folder name cannot be empty.', 'warning');
      return;
    }
    const parentId = this.getTargetFolderId();
    const newFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: trimmed,
      type: 'folder',
      parentId: parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.documents.push(newFolder);
    this.saveDocuments();
    this.renderDocumentTree();
    this.selectDocument(newFolder.id);
    this.showToast('Folder created.', 'success');
  }

  async renameDocument() {
    const doc = this.getDocumentById(this.currentDocumentId);
    if (!doc) {
      this.showToast('Select a document or folder to rename.', 'info');
      return;
    }
    const name = await dialogManager.prompt('New name', doc.title || '', 'Rename');
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      this.showToast('Name cannot be empty.', 'warning');
      return;
    }
    doc.title = trimmed;
    doc.updatedAt = new Date().toISOString();
    this.saveDocuments();
    this.renderDocumentTree();
    this.updateDocumentPanelState();
    this.showToast('Name updated.', 'success');
  }

  async deleteDocument() {
    const doc = this.getDocumentById(this.currentDocumentId);
    if (!doc) {
      this.showToast('Select a document or folder to delete.', 'info');
      return;
    }
    const confirmed = await dialogManager.confirm(`Delete "${doc.title}"${doc.type === 'folder' ? ' and all of its contents' : ''}?`, 'Delete Document');
    if (!confirmed) return;
    
    await this.removeDocumentAndChildren(doc.id);
    this.collapsedFolders.delete(doc.id);
    this.currentDocumentId = null;
    this.documentEditorDirty = false;
    this.saveDocuments();
    this.renderDocumentTree();
    this.updateDocumentPanelState();
    this.showToast('Deleted successfully.', 'success');
  }

  async removeDocumentAndChildren(id) {
    // Get all children first
    const children = this.documents.filter(doc => doc.parentId === id);
    
    // Recursively delete children
    for (const child of children) {
      await this.removeDocumentAndChildren(child.id);
      this.collapsedFolders.delete(child.id);
    }
    
    // Delete Leitner cards associated with this document
    try {
      const docScope = this.getDocumentScope(id);
      const scopeKey = this.getScopeKey(docScope);
      const allCards = await this.db.getAll(this.LEITNER_STORE);
      const cardsToDelete = allCards.filter(card => card.scopeKey === scopeKey);
      
      for (const card of cardsToDelete) {
        await this.db.delete(this.LEITNER_STORE, card.id);
      }
      
      if (cardsToDelete.length > 0) {
        console.log(`Deleted ${cardsToDelete.length} Leitner cards associated with document ${id}`);
      }
    } catch (error) {
      // Silent error - cards already deleted or don't exist
    }
    
    // Finally delete the document itself
    this.documents = this.documents.filter(doc => doc.id !== id);
  }

  handleDocumentEditorInput() {
    this.documentEditorDirty = true;
    if (this.documentSaveBtn) this.documentSaveBtn.disabled = false;
  }

  openLeitnerForCurrentDocument() {
    if (!this.currentDocumentId) {
      this.showToast('Select a document or folder first.', 'info');
      return;
    }
    const scope = this.getDocumentScope();
    this.openLeitnerModal(null, scope);
  }

  saveCurrentDocument() {
    const doc = this.getDocumentById(this.currentDocumentId);
    if (!doc || doc.type !== 'file') {
      this.showToast('Select a document to save.', 'info');
      return;
    }
    if (!this.documentEditor) return;
    doc.content = this.documentEditor.value;
    doc.updatedAt = new Date().toISOString();
    this.documentEditorDirty = false;
    this.saveDocuments();
    
    // Exit edit mode and show read mode
    this.documentEditMode = false;
    this.showDocumentReadMode(doc);
    
    this.renderDocumentTree();
    this.showToast('Document saved.', 'success');
  }

  importDocumentFromFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('text') && !/\.(txt|md|json|html)$/i.test(file.name)) {
      this.showToast('Please choose a text-based file.', 'warning');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const title = file.name.replace(/\.[^/.]+$/, '') || 'Imported Document';
      const parentId = this.getTargetFolderId();
      const newDoc = {
        id: `doc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        title,
        type: 'file',
        parentId: parentId,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.documents.push(newDoc);
      this.saveDocuments();
      this.renderDocumentTree();
      this.selectDocument(newDoc.id);
      this.showToast('Document imported.', 'success');
    };
    reader.onerror = () => {
      console.error('Failed to read document file:', reader.error);
      this.showToast('Failed to import document.', 'error');
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  getDocumentIcon(type) {
    if (type === 'folder') {
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h5l2 3h9a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path></svg>';
    }
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
  }

  getChevronIcon(collapsed) {
    if (collapsed) {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
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
    const messageWrapper = this.buildMessageElement(role, content, messageId, {
      allowDelete: true,
      includeAudio: content && content.trim().length > 0,
      includeCopy: true
    });
    this.messagesDiv.appendChild(messageWrapper);
    this.scrollToBottom();
  }

  createAudioControls(content, messageId) {
    const container = document.createElement('div');
    container.className = 'audio-controls-container';
    container.dataset.messageId = messageId;
    
    // Create simple play button initially
    const audioBtn = document.createElement("button");
    audioBtn.className = "btn-message-action btn-audio";
    audioBtn.title = "Play Audio";
    audioBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon></svg>`;
    
    audioBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      
      // Check if there's already a player for this message
      if (this.activeTTSPlayers.has(messageId)) {
        // Toggle existing player
        const player = this.activeTTSPlayers.get(messageId);
        player.togglePlayPause();
      } else {
        // Stop all other active players before starting new one
        const playersToStop = [];
        this.activeTTSPlayers.forEach((player, id) => {
          if (id !== messageId) {
            playersToStop.push({ player, id });
          }
        });
        
        // Cleanup other players
        playersToStop.forEach(({ player, id }) => {
          player.cleanup();
          this.activeTTSPlayers.delete(id);
        });
        
        // Create new advanced player
        const player = new AdvancedTTSPlayer(this);
        this.activeTTSPlayers.set(messageId, player);
        
        // Start playback
        await player.playMessage(content, messageId, container);
      }
    });
    
    container.appendChild(audioBtn);
    return container;
  }

  createCopyButton(content) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-message-action btn-copy-message';
    copyBtn.title = 'Copy Text';
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const textToCopy = content || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          const success = this.copyTextFallback(textToCopy);
          if (!success) throw new Error('execCommand failed');
        }
        this.showToast('Copied to clipboard.', 'success');
      } catch (error) {
        console.error('Copy failed:', error);
        this.showToast('Failed to copy text.', 'error');
      }
    });

    return copyBtn;
  }

  copyTextFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (err) {
      success = false;
    }

    document.body.removeChild(textarea);

    if (selectedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }

    return success;
  }

  buildMessageElement(role, content, messageId, options = {}) {
    const {
      allowDelete = true,
      includeAudio = true,
      includeCopy = true
    } = options;

    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper ${role}`;
    messageWrapper.id = messageId;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = this.formatMessageContent(content, messageId);
    messageWrapper.appendChild(messageDiv);

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'message-controls';

    let audioControls = null;
    if (includeAudio && content && content.trim().length > 0) {
      audioControls = this.createAudioControls(content, messageId);
    }

    let copyBtn = null;
    if (includeCopy) {
      copyBtn = this.createCopyButton(content);
    }

    let deleteBtn = null;
    if (allowDelete) {
      deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-message-action danger btn-delete-message';
      deleteBtn.title = 'Delete Message';
      deleteBtn.dataset.messageId = messageId;
      deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    }

    if (role === 'user') {
      if (audioControls) controlsDiv.appendChild(audioControls);
      if (copyBtn) controlsDiv.appendChild(copyBtn);
      if (deleteBtn) controlsDiv.appendChild(deleteBtn);
    } else {
      if (copyBtn) controlsDiv.appendChild(copyBtn);
      if (deleteBtn) controlsDiv.appendChild(deleteBtn);
      if (audioControls) controlsDiv.appendChild(audioControls);
    }

    if (controlsDiv.children.length > 0) {
      messageWrapper.appendChild(controlsDiv);
    }

    return messageWrapper;
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
        generationConfig: { 
          responseModalities: ["AUDIO"], 
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { 
                voiceName: 'Kore' // Male voice with deep tone
              } 
            } 
          } 
        }
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
  if (content.startsWith('Error:')) return `<p>${content}</p>`;
    
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
    this.updateLeitnerHighlights();
  }

  getWordLeitnerState(word, scope = null) {
    const normalizedWord = this.normalizeWord(word);
    if (!normalizedWord) return { state: 'none' };
    const scopeToUse = scope || this.getActiveScope();
    const primaryKey = `${this.getScopeKey(scopeToUse)}:${normalizedWord}`;
    const globalKey = `global:all:${normalizedWord}`;
    return this.leitnerDueCache.get(primaryKey) || this.leitnerDueCache.get(globalKey) || { state: 'none' };
  }

  updateLeitnerHighlights() {
    const scope = this.getActiveScope();
    
    // Find ALL .ai-word elements in the entire document
    const allWords = document.querySelectorAll('.ai-word');
    
    allWords.forEach(wordEl => {
      const word = wordEl.dataset.word || wordEl.textContent;
      const stateInfo = this.getWordLeitnerState(word, scope);
      wordEl.dataset.leitnerState = stateInfo.state;
      
      // Remove all previous classes
      wordEl.classList.remove('leitner-due', 'leitner-overdue', 'leitner-new', 'leitner-scheduled');
      
      // Add appropriate class
      switch (stateInfo.state) {
        case 'overdue':
          wordEl.classList.add('leitner-overdue');
          break;
        case 'due':
          wordEl.classList.add('leitner-due');
          break;
        case 'new':
          wordEl.classList.add('leitner-new');
          break;
        case 'scheduled':
          wordEl.classList.add('leitner-scheduled');
          break;
        default:
          break;
      }
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
  this.addMessage("ai", `Error: ${error.message}`);
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
    
    const prompt = `You are an expert English-Persian dictionary. Analyze the word "${word}" comprehensively.

CRITICAL REQUIREMENTS:
1. Find ALL possible meanings (at least 3-5 common ones), ordered from MOST COMMON to LEAST COMMON usage
2. Find ALL relevant synonyms (at least 5-10), ordered from CLOSEST meaning to FURTHEST meaning
3. Find ALL relevant antonyms (at least 3-5 if applicable), ordered from STRONGEST opposite to WEAKEST opposite
4. Never return empty arrays - always find at least some results

OUTPUT FORMAT (strict JSON):
{
  "meanings": [
    {"text": "رایج‌ترین معنی فارسی", "type": "نوع کلمه به فارسی"},
    {"text": "معنی دوم", "type": "نوع کلمه"},
    ...more from common to rare...
  ],
  "synonyms": ["most_similar", "very_similar", "similar", "somewhat_similar", ...],
  "antonyms": ["strongest_opposite", "strong_opposite", "opposite", ...]
}

Type options: اسم, فعل, صفت, قید, حرف ندا, حرف ربط, حرف اضافه

Example for "happy":
{
  "meanings": [
    {"text": "خوشحال، شاد", "type": "صفت"},
    {"text": "راضی، خشنود", "type": "صفت"},
    {"text": "مناسب، موفق (در ترکیبات)", "type": "صفت"}
  ],
  "synonyms": ["joyful", "cheerful", "delighted", "pleased", "content", "glad", "merry", "jovial", "upbeat", "elated"],
  "antonyms": ["sad", "unhappy", "miserable", "depressed", "gloomy", "sorrowful"]
}

Be thorough and comprehensive.`;
    
    const returnError = (message) => ({ meanings: [{ text: message, type: "Error" }], synonyms: [], antonyms: [] });
    try {
      const response = await fetch('https://api.avalai.ir/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.AVALAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.3 })
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
    
    const prompt = `You are an expert English-Persian dictionary. Analyze the word "${word}" comprehensively.

CRITICAL REQUIREMENTS:
1. Find ALL possible meanings (at least 3-5 common ones), ordered from MOST COMMON to LEAST COMMON usage
2. Find ALL relevant synonyms (at least 5-10), ordered from CLOSEST meaning to FURTHEST meaning
3. Find ALL relevant antonyms (at least 3-5 if applicable), ordered from STRONGEST opposite to WEAKEST opposite
4. Never return empty arrays - always find at least some results

OUTPUT FORMAT (strict JSON):
{
  "meanings": [
    {"text": "رایج‌ترین معنی فارسی", "type": "نوع کلمه به فارسی"},
    {"text": "معنی دوم", "type": "نوع کلمه"},
    ...more from common to rare...
  ],
  "synonyms": ["most_similar", "very_similar", "similar", "somewhat_similar", ...],
  "antonyms": ["strongest_opposite", "strong_opposite", "opposite", ...]
}

Type options: اسم, فعل, صفت, قید, حرف ندا, حرف ربط, حرف اضافه

Example for "happy":
{
  "meanings": [
    {"text": "خوشحال، شاد", "type": "صفت"},
    {"text": "راضی، خشنود", "type": "صفت"},
    {"text": "مناسب، موفق (در ترکیبات)", "type": "صفت"}
  ],
  "synonyms": ["joyful", "cheerful", "delighted", "pleased", "content", "glad", "merry", "jovial", "upbeat", "elated"],
  "antonyms": ["sad", "unhappy", "miserable", "depressed", "gloomy", "sorrowful"]
}

Be thorough and comprehensive.`;
    
    const returnError = (message) => ({ meanings: [{ text: message, type: "Error" }], synonyms: [], antonyms: [] });
    try {
      const modelName = "gemini-2.0-flash-exp";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 } })
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
    const reviewWordBtn = newPopup.querySelector("#review-word-btn");
    const addToLeitnerBtn = newPopup.querySelector("#add-to-leitner-btn");
    
    titleEl.textContent = word;
    meaningsListEl.innerHTML = '<div class="meaning-item">Loading...</div>';
    
    // Check if word has a due/overdue card in current scope or global
    const normalizedWord = this.normalizeWord(word);
    const scope = this.getActiveScope();
    const scopeKey = this.getScopeKey(scope);
    const cardId = `${scopeKey}:${normalizedWord}`;
    const globalCardId = `global:all:${normalizedWord}`;
    
    // Check both scope-specific and global cards
    const [card, globalCard] = await Promise.all([
      this.db.get(this.LEITNER_STORE, cardId),
      scopeKey !== 'global:all' ? this.db.get(this.LEITNER_STORE, globalCardId) : Promise.resolve(null)
    ]);
    
    // Use scope-specific card if exists, otherwise use global
    const cardToReview = card || globalCard;
    
    if (cardToReview) {
      const dueState = this.evaluateCardDueState(cardToReview);
      if (dueState.state === 'due' || dueState.state === 'overdue') {
        reviewWordBtn.classList.remove('hidden');
        reviewWordBtn.addEventListener('click', () => {
          this.hidePopup(newPopup);
          newPopup.remove();
          // Start a quick review session for this specific card
          this.startQuickReview(cardToReview);
        });
      }
    }
    
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
  
  async renameChat() {
    const chat = this.chats.find(c => c.id === this.currentChatId);
    if (!chat) return;
    const newTitle = await dialogManager.prompt("Enter new chat name:", chat.title, "Rename Chat");
    if (newTitle && newTitle.trim() !== "") {
        chat.title = newTitle.trim();
        this.saveChats();
        this.renderChatList();
        this.chatTitle.textContent = chat.title;
    }
  }

  async deleteChat() {
    if (await dialogManager.confirm("Are you sure you want to delete this chat?", "Delete Chat")) {
        this.deleteChatById(this.currentChatId);
    }
  }

  async deleteChatById(chatId) {
    if (!chatId) return;
    
    // Delete associated Leitner cards first
    try {
      const chatScope = this.getChatScope(chatId);
      const scopeKey = this.getScopeKey(chatScope);
      const allCards = await this.db.getAll(this.LEITNER_STORE);
      const cardsToDelete = allCards.filter(card => card.scopeKey === scopeKey);
      
      for (const card of cardsToDelete) {
        await this.db.delete(this.LEITNER_STORE, card.id);
      }
      
      if (cardsToDelete.length > 0) {
        console.log(`Deleted ${cardsToDelete.length} Leitner cards associated with chat ${chatId}`);
      }
    } catch (error) {
      console.error('Error deleting Leitner cards for chat:', error);
    }
    
    // Delete the chat
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
  
  async deleteMessageById(messageId) {
      if (!await dialogManager.confirm("Are you sure you want to delete this message?", "Delete Message")) {
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

  async addCurrentWordToLeitner(word, scope = null) {
    const normalizedWord = this.normalizeWord(word);
    if (!normalizedWord) {
      this.showToast('Cannot add an empty word.', 'warning');
      return;
    }

    const targetScope = scope || this.getActiveScope();
    if (!targetScope) {
      this.showToast('Select a chat or document first.', 'info');
      return;
    }

    const scopeKey = this.getScopeKey(targetScope);
    const cardId = this.getLeitnerCardId(normalizedWord, targetScope);

    try {
      // Check if card exists in target scope
      const existingCard = await this.db.get(this.LEITNER_STORE, cardId);
      if (existingCard) {
        this.showToast(`"${normalizedWord}" is already in this deck.`, 'info');
        await this.playTextToSpeech(normalizedWord, null, null, null);
        return;
      }

      // Also check global scope to inform user
      if (scopeKey !== 'global:all') {
        const globalCardId = `global:all:${normalizedWord}`;
        const globalCard = await this.db.get(this.LEITNER_STORE, globalCardId);
        if (globalCard) {
          const addAnyway = await dialogManager.confirm(
            `"${normalizedWord}" already exists in Global flashcards.\n\n` +
            `Do you want to add it to this ${targetScope.type === 'chat' ? 'chat' : 'document'} as well?`,
            'Word Already Exists'
          );
          if (!addAnyway) {
            await this.playTextToSpeech(normalizedWord, null, null, null);
            return;
          }
        }
      }

      const createdAt = new Date().toISOString();
      const newCard = {
        id: cardId,
        word: normalizedWord,
        scopeType: targetScope.type,
        scopeId: targetScope.id || 'all',
        scopeKey,
        createdAt,
        dueDate: createdAt,
        repetitions: 0,
        interval: 0,
        easeFactor: 2.5,
        lastReviewed: null,
        status: 'new'
      };

      await this.db.set(this.LEITNER_STORE, newCard);
      await this.playTextToSpeech(normalizedWord, null, null, null);
      this.showToast(`"${normalizedWord}" added to flashcards!`, 'success');
      await this.refreshLeitnerDueCacheForWord(normalizedWord, targetScope);
    } catch (error) {
      console.error('Error adding card to Leitner:', error);
      this.showToast('Failed to add word to flashcards.', 'error');
    }
  }

  async openLeitnerModal(chatId = null, scopeOverride = null) {
    this.leitnerModal.classList.remove("hidden");
    this.leitnerCardContainer.classList.remove('hidden');
    this.leitnerFinishedScreen.classList.add('hidden');
    const scope = scopeOverride || (chatId ? this.getChatScope(chatId) : this.getActiveScope());
    const scopeKey = this.getScopeKey(scope);
    const includeGlobal = scopeKey !== 'global:all';
    this.currentLeitnerScope = scope;
    
    try {
      const allCards = await this.db.getAll(this.LEITNER_STORE);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let cardsToReview = allCards.filter(card => {
        // Validate card structure
        if (!card || !card.scopeKey || !card.word || !card.id) {
          console.warn('Invalid card found:', card);
          return false;
        }
        
        // Filter by scope
        if (card.scopeKey !== scopeKey) {
          if (!includeGlobal) return false;
          if (card.scopeKey !== 'global:all') return false;
        }
        
        // Validate and parse due date
        if (!card.dueDate) {
          console.warn('Card missing dueDate:', card.word);
          return false;
        }
        
        const dueDate = new Date(card.dueDate);
        if (isNaN(dueDate.getTime())) {
          console.warn('Card has invalid dueDate:', card.word, card.dueDate);
          return false;
        }
        
        dueDate.setHours(0, 0, 0, 0);
        return dueDate <= today;
      });
      
      // Sort cards by priority: overdue (oldest first) -> new -> regular due
      cardsToReview.sort((a, b) => {
        const aDue = new Date(a.dueDate);
        const bDue = new Date(b.dueDate);
        aDue.setHours(0, 0, 0, 0);
        bDue.setHours(0, 0, 0, 0);
        
        const aIsNew = (a.repetitions || 0) === 0;
        const bIsNew = (b.repetitions || 0) === 0;
        
        // Both new - random order
        if (aIsNew && bIsNew) return Math.random() - 0.5;
        
        // One is new, one is review - new cards first
        if (aIsNew) return -1;
        if (bIsNew) return 1;
        
        // Both are review cards - sort by due date (oldest first)
        return aDue - bDue;
      });
      
      this.leitnerQueue = cardsToReview;
      
      // Calculate stats
      const newCount = this.leitnerQueue.filter(c => (c.repetitions || 0) === 0).length;
      const reviewCount = this.leitnerQueue.filter(c => (c.repetitions || 0) > 0).length;
      const totalCount = this.leitnerQueue.length;
      
      this.leitnerStatsNew.textContent = `New: ${newCount}`;
      this.leitnerStatsDue.textContent = `Review: ${reviewCount} | Total: ${totalCount}`;
      
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
  
  // Quick review for a single card
  async startQuickReview(card) {
    this.leitnerModal.classList.remove("hidden");
    this.leitnerCardContainer.classList.remove('hidden');
    this.leitnerFinishedScreen.classList.add('hidden');
    
    // Set the scope based on the card
    this.currentLeitnerScope = { type: card.scopeType, id: card.scopeId };
    
    // Queue contains only this single card
    this.leitnerQueue = [card];
    
    this.leitnerStatsNew.textContent = `New: 0`;
    this.leitnerStatsDue.textContent = `Review: 1`;
    
    this.showNextCard();
  }
  
  showNextCard() {
    if (this.leitnerQueue.length === 0) {
      this.showFinishedScreen();
      return;
    }
    this.currentCard = this.leitnerQueue.shift();
    
    // Update remaining count in stats
    const remaining = this.leitnerQueue.length;
    const newCount = this.leitnerQueue.filter(c => (c.repetitions || 0) === 0).length;
    const reviewCount = this.leitnerQueue.filter(c => (c.repetitions || 0) > 0).length;
    
    this.leitnerStatsNew.textContent = `New: ${newCount}`;
    this.leitnerStatsDue.textContent = `Review: ${reviewCount} | Remaining: ${remaining}`;
    
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
     *   2: Hard (Correct with hesitation)  
     *   3: Good (Correct response)
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
    
    // Again button (quality=0) - Failed card
    if (quality === 0) {
      // Failed card - reset to learning
      newRepetitions = 0;
      // Again button shows card in same session for new cards, tomorrow for review cards
      if (repetitions === 0) {
        newInterval = 0; // Show again soon in same session
      } else {
        newInterval = 1; // Review tomorrow for lapsed cards
      }
      newEaseFactor = Math.max(1.3, easeFactor - 0.2); // Decrease ease factor
    } else {
      // Passed card (Hard, Good, or Easy)
      // Calculate new ease factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
      newEaseFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
      
      if (repetitions === 0) {
        // First successful review (Learning -> Graduated)
        if (quality === 5) {
          // Easy button on new card - graduate immediately with longer interval
          newInterval = 4; // Anki default: 4 days for easy on new cards
          newRepetitions = 2; // Skip learning phase entirely
        } else if (quality === 2) {
          // Hard button on new card - graduate but with shorter interval
          newInterval = 1;
          newRepetitions = 1; // Graduate to review stage
        } else {
          // Good button on new card - graduate to review
          newInterval = 1; // Graduate with 1 day interval
          newRepetitions = 1;
        }
      } else if (repetitions === 1) {
        // Second successful review (first review after graduating)
        if (quality === 5) {
          // Easy button - bonus multiplier
          newInterval = Math.round(interval * newEaseFactor * 1.3);
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
    
    // Ensure interval is never 0 except for same-session reviews (Again button)
    if (newInterval === 0 && quality > 0) {
      newInterval = 1;
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
    
    // Update button labels with intervals and keyboard shortcuts
    this.ratingAgainBtn.innerHTML = `Again<br><small>${this.formatInterval(againResult.interval)} (1)</small>`;
    this.ratingHardBtn.innerHTML = `Hard<br><small>${this.formatInterval(hardResult.interval)} (2)</small>`;
    this.ratingGoodBtn.innerHTML = `Good<br><small>${this.formatInterval(goodResult.interval)} (3)</small>`;
    this.ratingEasyBtn.innerHTML = `Easy<br><small>${this.formatInterval(easyResult.interval)} (4)</small>`;
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
    nextDueDate.setHours(0, 0, 0, 0); // Set to midnight today
    
    // Add interval days - if interval is 0, keep it today for same-session review
    if (sm2Result.interval > 0) {
      nextDueDate.setDate(nextDueDate.getDate() + sm2Result.interval);
    }
    
    // Determine status
    let status;
    if (sm2Result.repetitions === 0) {
      status = 'learning'; // New cards or lapsed cards
    } else {
      status = 'review'; // Graduated cards (rep >= 1)
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
    
    await this.db.set(this.LEITNER_STORE, updatedCard);
    
    // Update cache for this word
    await this.refreshLeitnerDueCacheForWord(this.currentCard.word, this.currentLeitnerScope);
    
    // If interval is 0 (Again button), re-add card to queue for same-session review
    if (sm2Result.interval === 0) {
      // Add to end of queue after 3-5 random cards (if available)
      const insertPosition = Math.min(
        this.leitnerQueue.length,
        Math.floor(Math.random() * 3) + 3
      );
      this.leitnerQueue.splice(insertPosition, 0, updatedCard);
    }
    
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

  async exportAppData() {
    try {
      // Get all data from IndexedDB first to check if there are Leitner cards
      const leitnerCardsCheck = await this.db.getAll(this.LEITNER_STORE);
      let includeLeitnerCards = true;
      
      // If there are Leitner cards, ask user if they want to include them
      if (leitnerCardsCheck && leitnerCardsCheck.length > 0) {
        const userChoice = await dialogManager.confirm(
          `You have ${leitnerCardsCheck.length} flashcard(s) with review schedules.\n\n` +
          `Do you want to INCLUDE flashcards with their scheduling in the export?\n\n` +
          `• Click "Confirm" to include flashcards (recommended for full backup)\n` +
          `• Click "Cancel" to exclude flashcards (only export chats, documents, and settings)`,
          'Export Options'
        );
        includeLeitnerCards = userChoice;
        console.log('Export - User chose to include Leitner cards:', includeLeitnerCards);
      }
      
      this.showToast('Exporting data... Please wait.', 'info');
      
      // Get all data from IndexedDB
      const [wordMeanings, audioCache, leitnerCards] = await Promise.all([
        this.db.getAll('word_meanings'),
        this.db.getAll('audio_cache'),
        includeLeitnerCards ? this.db.getAll(this.LEITNER_STORE) : Promise.resolve([])
      ]);

      console.log('Export - Word Meanings:', wordMeanings.length);
      console.log('Export - Audio Cache:', audioCache.length);
      console.log('Export - Leitner Cards:', includeLeitnerCards ? leitnerCards.length : 0);

      // Serialize audio cache (convert Blob to base64)
      const serializedAudio = [];
      for (const entry of audioCache) {
        if (!entry) continue;
        if (entry.value && entry.value instanceof Blob) {
          try {
            const base64Audio = await this.blobToBase64(entry.value);
            serializedAudio.push({ text: entry.text, audio: base64Audio });
          } catch (error) {
            console.error('Failed to serialize audio entry:', entry.text, error);
          }
        } else if (entry.text) {
          serializedAudio.push({ text: entry.text });
        }
      }

      console.log('Export - Serialized Audio:', serializedAudio.length);

      const backup = {
        version: 2,
        exportedAt: new Date().toISOString(),
        localStorage: {
          chats: this.chats || [],
          documents: this.documents || [],
          chat_provider: this.chatProvider || 'gemini',
          tts_provider: this.ttsProvider || 'gemini',
          theme: this.theme || 'light',
          gemini_api_key: this.API_KEY || '',
          avalai_api_key: this.AVALAI_API_KEY || ''
        },
        indexedDB: {
          word_meanings: wordMeanings || [],
          audio_cache: serializedAudio || [],
          leitner_cards_v2: includeLeitnerCards ? (leitnerCards || []) : []
        }
      };

      console.log('Export - Backup object created:', {
        chatsCount: backup.localStorage.chats.length,
        documentsCount: backup.localStorage.documents.length,
        wordMeaningsCount: backup.indexedDB.word_meanings.length,
        audioCacheCount: backup.indexedDB.audio_cache.length,
        leitnerCardsCount: backup.indexedDB.leitner_cards_v2.length
      });

      const jsonString = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ai_chat_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      const exportMessage = includeLeitnerCards 
        ? 'Application data exported successfully (including flashcards)!' 
        : 'Application data exported successfully (excluding flashcards)!';
      this.showToast(exportMessage, 'success');
    } catch (error) {
      console.error('Error exporting application data:', error);
      this.showToast(`Failed to export application data: ${error.message}`, 'error');
    }
  }

  importAppData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Allow JSON files even if type is not set
    if (file.type && file.type !== 'application/json' && !file.name.endsWith('.json')) {
      this.showToast('Please choose a JSON backup file.', 'warning');
      event.target.value = '';
      return;
    }

    this.showToast('Importing data... Please wait.', 'info');
    
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result;
        if (!text || typeof text !== 'string') {
          throw new Error('File is empty or unreadable.');
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          throw new Error('Invalid JSON format. Please check the file.');
        }

        if (!data || typeof data !== 'object') {
          throw new Error('Invalid backup format: Not a valid object.');
        }

        console.log('Import - Backup version:', data.version);
        console.log('Import - Exported at:', data.exportedAt);

        // Support both version 1 and version 2 formats
        const localData = data.localStorage || data || {};
        const indexedData = data.indexedDB || {};

        // Check if there are Leitner cards in the backup
        const leitnerData = indexedData.leitner_cards_v2 || indexedData.leitner_cards || [];
        let importLeitnerCards = true;
        
        if (Array.isArray(leitnerData) && leitnerData.length > 0) {
          // Ask user if they want to import Leitner cards with their scheduling
          const userChoice = await dialogManager.confirm(
            `This backup contains ${leitnerData.length} flashcard(s) with their review schedules.\n\n` +
            `Do you want to import the flashcards WITH their scheduling information?\n\n` +
            `• Click "Confirm" to import flashcards with their schedules (recommended)\n` +
            `• Click "Cancel" to skip importing flashcards (only import chats, documents, and settings)`,
            'Import Options'
          );
          importLeitnerCards = userChoice;
          console.log('Import - User chose to import Leitner cards:', importLeitnerCards);
        }

        // Import chats
        if (Array.isArray(localData.chats)) {
          console.log('Import - Chats:', localData.chats.length);
          this.chats = localData.chats.map(chat => {
            // Ensure each chat has required fields
            return {
              id: chat.id || `chat-${Date.now()}-${Math.random()}`,
              title: chat.title || 'Imported Chat',
              messages: Array.isArray(chat.messages) ? chat.messages : [],
              createdAt: chat.createdAt || new Date().toISOString()
            };
          });
          this.saveChats();
          this.renderChatList();
          if (this.chats.length > 0) {
            this.switchToChat(this.chats[0].id);
          } else {
            this.currentChatId = null;
            this.messagesDiv.innerHTML = '';
            this.chatTitle.textContent = 'New Chat';
          }
        } else {
          console.log('Import - No chats found in backup');
        }

        // Import documents
        if (Array.isArray(localData.documents)) {
          console.log('Import - Documents:', localData.documents.length);
          this.documents = this.sanitizeDocuments(localData.documents);
        } else {
          console.log('Import - No documents found in backup');
          this.documents = [];
        }
        this.collapsedFolders.clear();
        this.saveDocuments();
        this.currentDocumentId = null;
        this.documentEditorDirty = false;
        this.renderDocumentTree();
        this.updateDocumentPanelState();

        // Import settings
        if (typeof localData.chat_provider === 'string') {
          this.chatProvider = localData.chat_provider;
          localStorage.setItem('chat_provider', this.chatProvider);
          if (this.chatProviderSelect) this.chatProviderSelect.value = this.chatProvider;
        }
        if (typeof localData.tts_provider === 'string') {
          this.ttsProvider = localData.tts_provider;
          localStorage.setItem('tts_provider', this.ttsProvider);
          if (this.ttsProviderSelect) this.ttsProviderSelect.value = this.ttsProvider;
        }
        if (typeof localData.theme === 'string') {
          this.theme = localData.theme;
          localStorage.setItem('theme', this.theme);
          this.applyTheme(this.theme);
          if (this.themeSelect) this.themeSelect.value = this.theme;
        }
        if (typeof localData.gemini_api_key === 'string') {
          this.API_KEY = localData.gemini_api_key;
          localStorage.setItem('gemini_api_key', this.API_KEY || '');
          if (this.newApiKeyInput) this.newApiKeyInput.value = this.API_KEY;
        }
        if (typeof localData.avalai_api_key === 'string') {
          this.AVALAI_API_KEY = localData.avalai_api_key;
          localStorage.setItem('avalai_api_key', this.AVALAI_API_KEY || '');
          if (this.avalaiApiKeyInput) this.avalaiApiKeyInput.value = this.AVALAI_API_KEY;
        }

        // Import word meanings
        await this.db.clearStore('word_meanings');
        if (Array.isArray(indexedData.word_meanings) && indexedData.word_meanings.length > 0) {
          console.log('Import - Word Meanings:', indexedData.word_meanings.length);
          let importedMeanings = 0;
          for (const entry of indexedData.word_meanings) {
            if (entry && entry.word) {
              try {
                await this.db.set('word_meanings', entry);
                importedMeanings++;
              } catch (error) {
                console.error('Failed to import word meaning:', entry.word, error);
              }
            }
          }
          console.log('Import - Word meanings imported:', importedMeanings);
        } else {
          console.log('Import - No word meanings found in backup');
        }

        // Import leitner cards - support both old and new format
        if (importLeitnerCards) {
          await this.db.clearStore(this.LEITNER_STORE);
          if (Array.isArray(leitnerData) && leitnerData.length > 0) {
            console.log('Import - Leitner Cards:', leitnerData.length);
            let importedCards = 0;
            for (const card of leitnerData) {
              if (!card || !card.word) continue;
              
              try {
                // If it's old format, migrate it
                if (!card.scopeKey) {
                  const scopeType = card.chatId ? 'chat' : 'global';
                  const scopeId = card.chatId || 'all';
                  const scopeKey = `${scopeType}:${scopeId}`;
                  const id = `${scopeKey}:${card.word}`;
                  const migratedCard = {
                    ...card,
                    id,
                    scopeType,
                    scopeId,
                    scopeKey,
                    createdAt: card.createdAt || new Date().toISOString()
                  };
                  await this.db.set(this.LEITNER_STORE, migratedCard);
                } else {
                  await this.db.set(this.LEITNER_STORE, card);
                }
                importedCards++;
              } catch (error) {
                console.error('Failed to import leitner card:', card.word, error);
              }
            }
            console.log('Import - Leitner cards imported:', importedCards);
          } else {
            console.log('Import - No leitner cards found in backup');
          }
        } else {
          console.log('Import - User chose to skip Leitner cards import');
        }

        // Import audio cache
        await this.db.clearStore('audio_cache');
        if (Array.isArray(indexedData.audio_cache) && indexedData.audio_cache.length > 0) {
          console.log('Import - Audio Cache:', indexedData.audio_cache.length);
          let audioImported = 0;
          for (const audioEntry of indexedData.audio_cache) {
            if (!audioEntry || !audioEntry.text) continue;
            try {
              let value = null;
              if (audioEntry.audio) {
                value = await this.base64ToBlob(audioEntry.audio);
              } else if (audioEntry.value && typeof audioEntry.value === 'string' && audioEntry.value.startsWith('data:')) {
                value = await this.base64ToBlob(audioEntry.value);
              }
              if (value) {
                await this.db.set('audio_cache', { text: audioEntry.text, value });
                audioImported++;
              }
            } catch (error) {
              console.error('Failed to import audio cache entry:', audioEntry.text, error);
            }
          }
          console.log('Import - Audio imported:', audioImported);
        } else {
          console.log('Import - No audio cache found in backup');
        }

        // Reload active scope after import
        const activeScope = this.getActiveScope();
        if (activeScope) {
          await this.preloadLeitnerForScope(activeScope);
        }

        this.showToast('Application data imported successfully!', 'success');
      } catch (error) {
        console.error('Error importing application data:', error);
        this.showToast(`Failed to import: ${error.message}`, 'error');
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      console.error('Failed to read backup file:', reader.error);
      this.showToast('Failed to read backup file.', 'error');
      event.target.value = '';
    };
    reader.readAsText(file);
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
  this.messageInput.placeholder = 'Recording... Click to stop';
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      notificationManager.error('Cannot access microphone. Please check permissions.');
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
      notificationManager.warning('Please set your API key in settings to use voice input.');
      return;
    }

    // Show loading indicator
  this.messageInput.placeholder = 'Transcribing audio...';
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
      notificationManager.error(`Failed to transcribe audio: ${error.message}`);
    } finally {
      this.messageInput.placeholder = 'Type a message...';
      this.messageInput.disabled = false;
    }
  }
}

// Advanced TTS Player with Natural Reader-style controls
class AdvancedTTSPlayer {
  constructor(app) {
    this.app = app;
    this.audio = null;
    this.audioContext = null;
    this.playbackRate = 1.0;
    this.isPlaying = false;
    this.isPaused = false;
    this.messageId = null;
    this.controlsElement = null;
    this.fullText = '';
    this.sentences = [];
    this.currentSentenceIndex = 0;
    this.sentenceTimings = [];
    this.words = [];
    this.animationFrameId = null;
    this.startTime = 0;
    this.pausedTime = 0;
    this.lastHighlightedSentence = -1;
    
    // Multi-tap detection
    this.tapCount = 0;
    this.tapTimer = null;
    this.tapDelay = 300; // milliseconds between taps
    
    // Message element reference
    this.messageElement = null;
    
    // Store original HTML for restoration
    this.originalHTML = null;
    
    // Store references to UI elements for cleanup
    this.simpleAudioBtn = null;
    this.advancedControlsElement = null;
  }

  // Split text into sentences
  splitIntoSentences(text) {
    const sentences = [];
    
    // First split by newlines to handle multi-line text
    const lines = text.split('\n');
    
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      // Check if it's a bullet point - treat as one sentence
      if (/^[-*•]\s/.test(line)) {
        sentences.push(line);
        continue;
      }
      
      // Split line by sentence-ending punctuation
      // This regex matches everything up to and including .!?
      let pos = 0;
      const punctuationRegex = /[.!?]+/g;
      let match;
      
      while ((match = punctuationRegex.exec(line)) !== null) {
        const sentence = line.substring(pos, match.index + match[0].length).trim();
        if (sentence) {
          sentences.push(sentence);
        }
        pos = match.index + match[0].length;
      }
      
      // If there's remaining text after last punctuation
      const remaining = line.substring(pos).trim();
      if (remaining) {
        sentences.push(remaining);
      }
    }
    
    // If no sentences found at all, return the whole text
    if (sentences.length === 0) {
      return [text.trim()];
    }
    
    return sentences;
  }

  // Extract words with their positions for synchronization
  extractWords(text) {
    const words = [];
    let wordIndex = 0;
    
    // Split by word boundaries and keep track of positions
    const regex = /\b[a-zA-Z'-]+\b/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      words.push({
        text: match[0],
        startChar: match.index,
        endChar: match.index + match[0].length,
        index: wordIndex++
      });
    }
    
    return words;
  }

  async playMessage(text, messageId, controlsContainer) {
    this.messageId = messageId;
    this.controlsElement = controlsContainer;
    this.fullText = text;
    this.sentences = this.splitIntoSentences(text);
    this.words = this.extractWords(text);
    this.currentSentenceIndex = 0;
    
    // Store original HTML for restoration and wrap sentences
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
      const messageDiv = messageEl.querySelector('.message');
      if (messageDiv) {
        this.originalHTML = messageDiv.innerHTML;
        
        // Check if already wrapped to avoid double wrapping
        if (!messageDiv.querySelector('.tts-sentence')) {
          // Pre-wrap all sentences in the DOM for easy highlighting
          this.wrapSentencesInDOM(messageDiv);
        }
        
        // Add tap-to-pause/play functionality
        this.setupTapToPause(messageEl);
      }
    }
    
    // Create advanced controls UI
    this.createAdvancedControls();
    
    // Start playback
    await this.startPlayback();
  }
  
  setupTapToPause(messageEl) {
    // Add visual indicator class and tooltip to message
    messageEl.classList.add('tts-active');
    messageEl.title = '1× Tap: Pause/Play | 2× Tap: Previous | 3× Tap: Next';
    
    // Store message reference for this player
    this.messageElement = messageEl;
    
    // Use a global tap handler on the app level instead of per-player
    // This prevents multiple listeners from conflicting
    if (!this.app.globalTapHandler) {
      this.setupGlobalTapHandler();
    }
  }
  
  setupGlobalTapHandler() {
    // Setup once at app level - on the entire main content area
    const mainContent = document.querySelector('.main-content');
    
    const tapHandler = (e) => {
      // Find which player should handle this click
      let targetPlayer = null;
      
      // Check if click is inside a message with active TTS
      const clickedMessage = e.target.closest('.message-wrapper.tts-active');
      if (clickedMessage) {
        const messageId = clickedMessage.id;
        targetPlayer = this.app.activeTTSPlayers.get(messageId);
      } else {
        // Click in empty space - use the only active player (if any)
        if (this.app.activeTTSPlayers.size === 1) {
          targetPlayer = Array.from(this.app.activeTTSPlayers.values())[0];
        }
      }
      
      if (!targetPlayer) return;
      
      // Don't toggle if clicked on TTS controls
      const clickedControl = e.target.closest('.advanced-tts-controls, .btn-tts-control');
      if (clickedControl) return;
      
      // Don't toggle if clicked on other buttons (except tts-active which are ok)
      const clickedButton = e.target.closest('button:not(.tts-active), .btn-message-action, .message-controls');
      if (clickedButton) return;
      
      // Don't toggle if clicked on header buttons
      const clickedHeader = e.target.closest('.chat-header, .document-header, .chat-actions, .document-actions');
      if (clickedHeader) return;
      
      // Don't toggle if clicked on input area
      const clickedInput = e.target.closest('.input-area, .input-container, #message-input, #send-btn, #voice-btn');
      if (clickedInput) return;
      
      // If clicked on a word, don't toggle (let word handlers work) - CHECK THIS FIRST!
      if (e.target.classList.contains('ai-word') || e.target.classList.contains('tts-word')) {
        return; // Don't prevent default, let the word click handler work
      }
      
      // Multi-tap detection on the target player
      targetPlayer.handleTap();
    };
    
    if (mainContent) {
      mainContent.addEventListener('click', tapHandler);
    }
    
    // Store globally so we only set it up once
    this.app.globalTapHandler = tapHandler;
  }
  
  handleTap() {
    // Multi-tap detection
    this.tapCount++;
    
    // Clear existing timer
    if (this.tapTimer) {
      clearTimeout(this.tapTimer);
    }
    
    // Set timer to execute action after delay
    this.tapTimer = setTimeout(() => {
      if (this.tapCount === 1) {
        // Single tap: toggle play/pause
        this.togglePlayPause();
      } else if (this.tapCount === 2) {
        // Double tap: previous sentence
        this.previousSentence();
      } else if (this.tapCount >= 3) {
        // Triple tap: next sentence
        this.nextSentence();
      }
      
      // Reset tap count
      this.tapCount = 0;
    }, this.tapDelay);
  }
  
  wrapSentencesInDOM(messageDiv) {
    // Check if already wrapped - if so, skip entirely
    if (messageDiv.querySelector('.tts-sentence')) {
      return;
    }
    
    // Get the full text from DOM
    const domText = messageDiv.textContent;
    if (!domText || !domText.length) {
      return;
    }

    const charReplacements = {
      '\u2018': "'",
      '\u2019': "'",
      '\u201A': "'",
      '\u201B': "'",
      '\u02BC': "'",
      '\uFF07': "'",
      '\u201C': '"',
      '\u201D': '"',
      '\u201E': '"',
      '\uFF02': '"',
      '\u2013': '-',
      '\u2014': '-',
      '\u00A0': ' '
    };

    const normalizeCharForComparison = (char) => {
      if (!char) return '';
      const replaced = charReplacements[char] ?? char;
      if (/\s/.test(replaced)) {
        return '';
      }
      return replaced.toLowerCase();
    };

    const normalizeSentenceForComparison = (sentence) => {
      return Array.from(sentence)
        .map(normalizeCharForComparison)
        .filter(ch => ch.length > 0)
        .join('');
    };

    const sentenceInfos = this.sentences.map((sentence, index) => {
      const normalized = normalizeSentenceForComparison(sentence);
      return {
        originalIndex: index,
        normalized,
        normalizedLength: normalized.length,
        progress: 0
      };
    });

    if (sentenceInfos.length === 0) {
      return;
    }

    let currentSentencePtr = 0;

    const advanceSentencePointer = () => {
      while (currentSentencePtr < sentenceInfos.length) {
        const info = sentenceInfos[currentSentencePtr];
        if (info.normalizedLength === 0 || info.progress >= info.normalizedLength) {
          currentSentencePtr++;
        } else {
          break;
        }
      }
    };

    const assignCharToSentence = (char) => {
      advanceSentencePointer();

      if (currentSentencePtr >= sentenceInfos.length) {
        return sentenceInfos[sentenceInfos.length - 1].originalIndex;
      }

      const info = sentenceInfos[currentSentencePtr];
      const normalizedChar = normalizeCharForComparison(char);

      if (normalizedChar.length === 0) {
        return info.originalIndex;
      }

      if (info.normalizedLength === 0) {
        return info.originalIndex;
      }

      const expectedChar = info.normalized[info.progress];

      if (normalizedChar === expectedChar) {
        info.progress++;
        return info.originalIndex;
      }

      const nextInfo = sentenceInfos[currentSentencePtr + 1];
      if (
        nextInfo &&
        nextInfo.normalizedLength > 0 &&
        (info.normalizedLength === 0 || info.progress / Math.max(info.normalizedLength, 1) >= 0.7) &&
        normalizedChar === nextInfo.normalized[0]
      ) {
        info.progress = info.normalizedLength;
        currentSentencePtr++;
        return assignCharToSentence(char);
      }

      const remainingIndex = info.normalized.indexOf(normalizedChar, info.progress + 1);
      if (remainingIndex !== -1) {
        info.progress = remainingIndex + 1;
        return info.originalIndex;
      }

      return info.originalIndex;
    };

    const walker = document.createTreeWalker(
      messageDiv,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.length > 0) {
        textNodes.push(node);
      }
    }

    textNodes.forEach(textNode => {
      const nodeText = textNode.textContent;
      const fragments = [];
      let buffer = '';
      let bufferSentenceIndex = null;

      const flushBuffer = () => {
        if (!buffer) return;
        if (bufferSentenceIndex === null) {
          fragments.push({ type: 'text', content: buffer });
        } else {
          fragments.push({ type: 'sentence', content: buffer, index: bufferSentenceIndex });
        }
        buffer = '';
        bufferSentenceIndex = null;
      };

      for (let charIndex = 0; charIndex < nodeText.length; charIndex++) {
        const char = nodeText[charIndex];
        const sentenceIndex = assignCharToSentence(char);

        if (bufferSentenceIndex === sentenceIndex) {
          buffer += char;
        } else {
          flushBuffer();
          buffer = char;
          bufferSentenceIndex = sentenceIndex;
        }
      }

      flushBuffer();

      if (fragments.length === 0) {
        return;
      }

      const fragmentNode = document.createDocumentFragment();

      fragments.forEach(frag => {
        if (frag.type === 'text') {
          fragmentNode.appendChild(document.createTextNode(frag.content));
        } else {
          const span = document.createElement('span');
          span.className = 'tts-sentence';
          span.setAttribute('data-sentence-index', frag.index);
          span.textContent = frag.content;
          fragmentNode.appendChild(span);
        }
      });

      textNode.parentNode.replaceChild(fragmentNode, textNode);
    });
    
    // Now wrap words inside sentence spans for click functionality
    this.wrapWordsInSentences(messageDiv);
  }
  
  wrapWordsInSentences(messageDiv) {
    // Check if any sentence is already word-wrapped
    const firstSentence = messageDiv.querySelector('.tts-sentence');
    if (firstSentence && firstSentence.querySelector('.tts-word')) {
      // Already wrapped, skip
      return;
    }
    
    // Find all sentence spans and wrap words inside them
    const sentenceSpans = messageDiv.querySelectorAll('.tts-sentence');
    let globalWordCounter = 0;
    
    sentenceSpans.forEach(sentenceSpan => {
      const text = sentenceSpan.textContent;
      
      // Use regex to find words and spaces
      const regex = /([a-zA-Z'-]+)|([^a-zA-Z'-]+)/g;
      const fragment = document.createDocumentFragment();
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
          // It's a word
          const word = match[1];
          const span = document.createElement('span');
          span.className = 'ai-word tts-word';
          span.dataset.word = word.toLowerCase();
          span.id = `word-${this.messageId}-${globalWordCounter++}`;
          span.textContent = word;
          fragment.appendChild(span);
        } else if (match[2]) {
          // It's whitespace or punctuation
          fragment.appendChild(document.createTextNode(match[2]));
        }
      }
      
      // Replace sentence span content
      sentenceSpan.textContent = '';
      sentenceSpan.appendChild(fragment);
    });
  }


  createAdvancedControls() {
    if (!this.controlsElement) return;
    
    const advancedControls = document.createElement('div');
    advancedControls.className = 'advanced-tts-controls';
    
    // Playback controls
    const playPauseBtn = document.createElement('button');
    playPauseBtn.className = 'btn-tts-control btn-play-pause';
    playPauseBtn.title = 'Play/Pause (Space)';
    playPauseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    playPauseBtn.onclick = () => this.togglePlayPause();
    
    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn-tts-control btn-stop';
    stopBtn.title = 'Stop';
    stopBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg>';
    stopBtn.onclick = () => this.stop();
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-tts-control btn-prev';
    prevBtn.title = 'Previous Sentence (←)';
    prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"></line></svg>';
    prevBtn.onclick = () => this.previousSentence();
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-tts-control btn-next';
    nextBtn.title = 'Next Sentence (→)';
    nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line></svg>';
    nextBtn.onclick = () => this.nextSentence();
    
    // Speed control
    const speedControl = document.createElement('select');
    speedControl.className = 'tts-speed-control';
    speedControl.title = 'Playback Speed';
    ['0.5x', '0.75x', '1x', '1.25x', '1.5x', '1.75x', '2x'].forEach(speed => {
      const option = document.createElement('option');
      option.value = parseFloat(speed);
      option.textContent = speed;
      if (speed === '1x') option.selected = true;
      speedControl.appendChild(option);
    });
    speedControl.onchange = (e) => {
      this.playbackRate = parseFloat(e.target.value);
      if (this.audio) {
        this.audio.playbackRate = this.playbackRate;
      }
    };
    
    // Progress bar
    const progressContainer = document.createElement('div');
    progressContainer.className = 'tts-progress-container';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'tts-progress-bar';
    progressBar.title = 'Click on words to jump';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'tts-progress-fill';
    progressBar.appendChild(progressFill);
    
    const progressText = document.createElement('span');
    progressText.className = 'tts-progress-text';
    progressText.textContent = `1 / ${this.sentences.length}`;
    
    progressContainer.appendChild(progressBar);
    progressContainer.appendChild(progressText);
    
    // Assemble controls
    advancedControls.appendChild(prevBtn);
    advancedControls.appendChild(playPauseBtn);
    advancedControls.appendChild(nextBtn);
    advancedControls.appendChild(stopBtn);
    advancedControls.appendChild(speedControl);
    advancedControls.appendChild(progressContainer);
    
    // Hide simple audio button and show advanced controls
    const simpleBtn = this.controlsElement.querySelector('.btn-audio');
    if (simpleBtn) {
      simpleBtn.style.display = 'none';
      this.simpleAudioBtn = simpleBtn; // Store reference for cleanup
    }
    
    this.controlsElement.appendChild(advancedControls);
    this.advancedControlsElement = advancedControls;
    
    // Store references
    this.playPauseBtn = playPauseBtn;
    this.progressText = progressText;
    this.progressFill = progressFill;
    this.speedControl = speedControl;
  }

  async startPlayback() {
    try {
      // Generate audio for the entire text (only once!)
      const audioBlob = await this.generateFullAudio(this.fullText);
      
      if (!audioBlob) {
        this.app.showToast('Failed to generate audio', 'error');
        return;
      }
      
      // Create audio element
      const audioUrl = URL.createObjectURL(audioBlob);
      this.audio = new Audio(audioUrl);
      this.audio.playbackRate = this.playbackRate;
      
      // Set up event listeners
      this.audio.onended = () => {
        this.onPlaybackComplete();
      };
      
      this.audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        this.app.showToast('Audio playback error', 'error');
        this.cleanup();
      };
      
      // Start playing
      this.isPlaying = true;
      this.isPaused = false;
      this.startTime = Date.now();
      this.updatePlayPauseButton();
      
      await this.audio.play();
      
      // Start sentence synchronization (more reliable than word-level)
      this.startSentenceSync();
      
    } catch (error) {
      console.error('Error starting playback:', error);
      this.app.showToast('Failed to start playback', 'error');
      this.cleanup();
    }
  }

  async generateFullAudio(text) {
    try {
      // Check cache first
      const cacheKey = `full_${text}`;
      const cachedAudio = await this.app.db.get('audio_cache', cacheKey);
      if (cachedAudio && cachedAudio.value) {
        return cachedAudio.value;
      }
      
      // Generate new audio based on provider
      let audioBlob;
      if (this.app.ttsProvider === 'avalai' && this.app.AVALAI_API_KEY) {
        audioBlob = await this.generateAvalaiTTS(text);
      } else if (this.app.ttsProvider === 'gemini' && this.app.API_KEY) {
        audioBlob = await this.generateGeminiTTS(text);
      } else {
        // No API key available
        this.app.showToast('No TTS API key configured', 'error');
        return null;
      }
      
      // Cache the full audio
      if (audioBlob) {
        await this.app.db.set('audio_cache', { text: cacheKey, value: audioBlob }).catch(e => console.error(e));
      }
      
      return audioBlob;
    } catch (error) {
      console.error('TTS generation error:', error);
      return null;
    }
  }

  async generateAvalaiTTS(text) {
    const response = await fetch('https://api.avalai.ir/v1/audio/speech', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${this.app.AVALAI_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        model: 'gpt-4o-mini-tts', 
        input: text, 
        voice: 'alloy',
        response_format: 'mp3'
      })
    });
    
    if (!response.ok) throw new Error(`Avalai TTS error: ${response.status}`);
    
    return await response.blob();
  }

  async generateGeminiTTS(text) {
    const payload = {
      contents: [{ parts: [{ text: `Say it naturally: ${text}` }] }],
      generationConfig: { 
        responseModalities: ["AUDIO"], 
        speechConfig: { 
          voiceConfig: { 
            prebuiltVoiceConfig: { voiceName: 'Kore' }
          } 
        } 
      }
    };
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${this.app.API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    
    if (!response.ok) throw new Error(`Gemini TTS error: ${response.status}`);
    
    const result = await response.json();
    const part = result?.candidates?.[0]?.content?.parts?.[0];
    const audioData = part?.inlineData?.data;
    const mimeType = part?.inlineData?.mimeType;
    
    if (!audioData) throw new Error("Invalid audio data from Gemini API.");
    
    const sampleRateMatch = mimeType.match(/rate=(\d+)/);
    const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;
    const pcmDataBuffer = this.app.base64ToArrayBuffer(audioData);
    const pcm16 = new Int16Array(pcmDataBuffer);
    return this.app.pcmToWav(pcm16, sampleRate);
  }

  startSentenceSync() {
    if (!this.audio) return;
    
    const messageEl = document.getElementById(this.messageId);
    if (!messageEl) return;
    
    const messageDiv = messageEl.querySelector('.message');
    if (!messageDiv) return;
    
    // Calculate sentence timings based on audio duration
    // Distribute time proportionally based on sentence length
    const totalChars = this.sentences.reduce((sum, s) => sum + s.length, 0);
    let cumulativeTime = 0;
    
    this.sentenceTimings = this.sentences.map((sentence, index) => {
      const sentenceDuration = (sentence.length / totalChars) * (this.audio.duration || 10);
      const timing = {
        sentenceIndex: index,
        startTime: cumulativeTime,
        endTime: cumulativeTime + sentenceDuration,
        text: sentence
      };
      cumulativeTime += sentenceDuration;
      return timing;
    });
    
    // Start animation loop
    this.syncSentences();
  }

  syncSentences() {
    if (!this.audio || !this.isPlaying || this.isPaused) {
      return;
    }
    
    const currentTime = this.audio.currentTime;
    
    // Find current sentence based on time
    let currentSentenceIndex = -1;
    for (let i = 0; i < this.sentenceTimings.length; i++) {
      const timing = this.sentenceTimings[i];
      if (currentTime >= timing.startTime && currentTime < timing.endTime) {
        currentSentenceIndex = i;
        break;
      }
    }
    
    // If no exact match, find the closest sentence
    if (currentSentenceIndex === -1) {
      for (let i = 0; i < this.sentenceTimings.length; i++) {
        if (currentTime >= this.sentenceTimings[i].startTime) {
          currentSentenceIndex = i;
        } else {
          break;
        }
      }
    }
    
    // Update sentence highlight
    if (this.lastHighlightedSentence !== currentSentenceIndex) {
      this.clearSentenceHighlight();
      
      if (currentSentenceIndex >= 0 && currentSentenceIndex < this.sentences.length) {
        this.highlightSentence(currentSentenceIndex);
        this.lastHighlightedSentence = currentSentenceIndex;
        this.currentSentenceIndex = currentSentenceIndex;
        
        // Update progress display
        if (this.progressText) {
          this.progressText.textContent = `${currentSentenceIndex + 1} / ${this.sentences.length}`;
        }
      }
    }
    
    // Update progress bar
    if (this.progressFill && this.audio.duration) {
      const progress = (currentTime / this.audio.duration) * 100;
      this.progressFill.style.width = `${progress}%`;
    }
    
    // Continue loop
    this.animationFrameId = requestAnimationFrame(() => this.syncSentences());
  }

  highlightSentence(index) {
    const messageEl = document.getElementById(this.messageId);
    if (!messageEl) return;
    
    const messageDiv = messageEl.querySelector('.message');
    if (!messageDiv) return;
    
    // Find all sentence spans with this index and add active class
    const sentenceSpans = messageDiv.querySelectorAll(`[data-sentence-index="${index}"]`);
    
    if (sentenceSpans.length === 0) {
      return;
    }
    
    sentenceSpans.forEach(span => {
      span.classList.add('tts-sentence-active');
    });
  }

  clearSentenceHighlight() {
    const messageEl = document.getElementById(this.messageId);
    if (!messageEl) return;
    
    const messageDiv = messageEl.querySelector('.message');
    if (!messageDiv) return;
    
    // Remove active class from all sentence spans
    const activeSpans = messageDiv.querySelectorAll('.tts-sentence-active');
    activeSpans.forEach(span => {
      span.classList.remove('tts-sentence-active');
    });
  }


  togglePlayPause() {
    if (!this.audio) return;
    
    if (this.isPaused) {
      // Resume
      this.audio.play();
      this.isPaused = false;
      this.isPlaying = true;
      this.syncSentences();
    } else if (this.isPlaying) {
      // Pause
      this.audio.pause();
      this.isPaused = true;
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
    } else {
      // Start from beginning or current position
      this.startPlayback();
    }
    
    this.updatePlayPauseButton();
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    
    this.isPlaying = false;
    this.isPaused = false;
    this.currentSentenceIndex = 0;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.clearAllHighlights();
    this.updatePlayPauseButton();
    this.updateProgressDisplay();
  }

  async previousSentence() {
    if (!this.audio || this.currentSentenceIndex <= 0) return;
    
    this.currentSentenceIndex = Math.max(0, this.currentSentenceIndex - 1);
    
    // Calculate time position for the sentence
    if (this.sentenceTimings && this.sentenceTimings[this.currentSentenceIndex]) {
      const targetTime = this.sentenceTimings[this.currentSentenceIndex].startTime;
      this.audio.currentTime = targetTime;
    }
    
    this.updateProgressDisplay();
    
    if (!this.isPlaying && !this.isPaused) {
      await this.audio.play();
      this.isPlaying = true;
      this.syncSentences();
      this.updatePlayPauseButton();
    }
  }

  async nextSentence() {
    if (!this.audio || this.currentSentenceIndex >= this.sentences.length - 1) return;
    
    this.currentSentenceIndex = Math.min(this.sentences.length - 1, this.currentSentenceIndex + 1);
    
    // Calculate time position for the sentence
    if (this.sentenceTimings && this.sentenceTimings[this.currentSentenceIndex]) {
      const targetTime = this.sentenceTimings[this.currentSentenceIndex].startTime;
      this.audio.currentTime = targetTime;
    }
    
    this.updateProgressDisplay();
    
    if (!this.isPlaying && !this.isPaused) {
      await this.audio.play();
      this.isPlaying = true;
      this.syncSentences();
      this.updatePlayPauseButton();
    }
  }

  updatePlayPauseButton() {
    if (!this.playPauseBtn) return;
    
    if (this.isPlaying && !this.isPaused) {
      // Show pause icon
      this.playPauseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      this.playPauseBtn.title = 'Pause';
    } else {
      // Show play icon
      this.playPauseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      this.playPauseBtn.title = 'Play';
    }
  }

  updateProgressDisplay() {
    if (!this.progressText) return;
    this.progressText.textContent = `${this.currentSentenceIndex + 1} / ${this.sentences.length}`;
    
    if (!this.progressFill) return;
    const progress = this.currentSentenceIndex / Math.max(1, this.sentences.length);
    this.progressFill.style.width = `${progress * 100}%`;
  }

  clearAllHighlights() {
    const messageEl = document.getElementById(this.messageId);
    if (!messageEl) return;
    
    const messageDiv = messageEl.querySelector('.message');
    if (!messageDiv) return;
    
    // Remove blur effect
    messageDiv.classList.remove('tts-blur-inactive');
    
    const highlighted = messageDiv.querySelectorAll('.tts-sentence-active');
    highlighted.forEach(el => el.classList.remove('tts-sentence-active'));
    
    this.lastHighlightedSentence = -1;
  }

  jumpToWord(wordIndex) {
    if (!this.audio || wordIndex < 0 || wordIndex >= this.words.length) return;
    
    // Find which sentence contains this word
    const word = this.words[wordIndex];
    let targetSentenceIndex = -1;
    let charCount = 0;
    
    for (let i = 0; i < this.sentences.length; i++) {
      const sentenceLength = this.sentences[i].length;
      if (word.startChar >= charCount && word.startChar < charCount + sentenceLength) {
        targetSentenceIndex = i;
        break;
      }
      charCount += sentenceLength;
    }
    
    if (targetSentenceIndex >= 0 && this.sentenceTimings[targetSentenceIndex]) {
      const timing = this.sentenceTimings[targetSentenceIndex];
      this.audio.currentTime = timing.startTime;
      
      // If paused, resume playback
      if (this.isPaused) {
        this.audio.play();
        this.isPaused = false;
        this.isPlaying = true;
        this.updatePlayPauseButton();
        this.syncSentences();
      }
    }
  }

  onPlaybackComplete() {
    this.isPlaying = false;
    this.isPaused = false;
    this.clearAllHighlights();
    this.updatePlayPauseButton();
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  cleanup() {
    this.stop();
    
    // Clear multi-tap timer
    if (this.tapTimer) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
    }
    
    // Restore original HTML if it was modified
    if (this.originalHTML && this.messageId) {
      const messageEl = document.getElementById(this.messageId);
      if (messageEl) {
        const messageDiv = messageEl.querySelector('.message');
        if (messageDiv) {
          messageDiv.innerHTML = this.originalHTML;
        }
      }
      this.originalHTML = null;
    }
    
    // Remove visual indicator from message
    if (this.messageElement) {
      this.messageElement.classList.remove('tts-active');
      this.messageElement.removeAttribute('title');
      this.messageElement = null;
    }
    
    // Reset UI - remove advanced controls and restore simple button
    if (this.controlsElement && this.messageId) {
      // Remove advanced controls
      if (this.advancedControlsElement) {
        this.advancedControlsElement.remove();
        this.advancedControlsElement = null;
      }
      
      // Show simple audio button again
      if (this.simpleAudioBtn) {
        this.simpleAudioBtn.style.display = '';
        this.simpleAudioBtn = null;
      }
      
      this.controlsElement = null;
    }
    
    if (this.audio) {
      this.audio.src = '';
      this.audio = null;
    }
    
    this.clearAllHighlights();
    
    // DON'T remove from activeTTSPlayers here - let the caller handle it
    // This prevents issues when switching between players
  }
}

// Instantiate the app
document.addEventListener('DOMContentLoaded', () => {
    new AIChatApp();
});
