// content.js
let currentLanguage = "en";
let currentTheme = "dark";
let translationCache = {};
let currentThemeColor = "#6366f1";

// Load initial settings
chrome.storage.sync.get({ language: "en", theme: "dark", themeColor: "#6366f1" }, (res) => {
  currentLanguage = res.language || "en";
  currentTheme = res.theme || "dark";
  currentThemeColor = res.themeColor || "#6366f1";
});

// === APPLY SAVED THEME IMMEDIATELY ===
chrome.storage.sync.get({ theme: "dark" }, (res) => {
  const theme = res.theme;
  document.documentElement.dataset.theme = theme;
  applyImmediateDictionaryStyle(theme);
});

function applyImmediateDictionaryStyle(theme) {
  // Удаляем предыдущие стили, чтобы не дублировались
  const oldStyle = document.getElementById("theme-style-dict");
  if (oldStyle) oldStyle.remove();

  const style = document.createElement("style");
  style.id = "theme-style-dict";

  style.textContent = `
    /* Общие стили */
    .dictionary-popup, .translate-popup {
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      transition: background-color 0.3s ease, color 0.3s ease;
      font-family: 'Segoe UI', sans-serif;
    }

    /* Светлая тема */
    .dictionary-popup.light, .translate-popup.light,
    [data-theme='light'] .dictionary-popup, [data-theme='light'] .translate-popup {
      background-color: #ffffff !important;
      color: #1a1a1a !important;
      border: 1px solid #d0d0d0 !important;
    }

    .translate-popup.light #translate-title,
    .translate-popup.light .translate-body {
      color: #1a1a1a !important;
    }

    /* Тёмная тема */
    .dictionary-popup.dark, .translate-popup.dark,
    [data-theme='dark'] .dictionary-popup, [data-theme='dark'] .translate-popup {
      background-color: #1b1b26 !important;
      color: #f5f5f5 !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
    }

    .translate-popup.dark #translate-title,
    .translate-popup.dark .translate-body {
      color: #f5f5f5 !important;
    }

    /* Заголовок перевода */
    .translate-header {
      font-weight: 600;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 8px;
      padding-bottom: 4px;
    }

    /* Светлая граница у header в светлой теме */
    [data-theme='light'] .translate-header {
      border-bottom: 1px solid rgba(0,0,0,0.1);
    }
  `;

  document.head.appendChild(style);
}



function updatePopupTheme(theme) {
  const popups = document.querySelectorAll(".dictionary-popup, .translate-popup");
  popups.forEach(p => {
    if (theme === "light") {
      p.style.background = "#ffffff";
      p.style.color = "#222";
      p.style.border = "1px solid #ddd";
      p.style.boxShadow = "0 4px 14px rgba(0,0,0,0.15)";
    } else {
      p.style.background = "#1b1b26";
      p.style.color = "#eee";
      p.style.border = "1px solid rgba(255,255,255,0.08)";
      p.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "themeChanged") {
    document.documentElement.setAttribute("data-theme", msg.theme);
    updatePopupTheme(msg.theme);
  }
});

chrome.storage.sync.get(["theme"], (res) => {
  const theme = res.theme || "dark";
  updatePopupTheme(theme);
});

// React to storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.language) {
    currentLanguage = changes.language.newValue;
    // If dictionary overlay open, reload translations
    const overlay = document.getElementById("dictionary-overlay");
    if (overlay) loadDictionary();
  }
  if (changes.theme) {
    currentTheme = changes.theme.newValue;
    // update translate popup style if present
    const tp = document.getElementById("translate-popup");
    if (tp) {
      tp.className = `translate-popup ${currentTheme}`;
    }
  }
  if (changes.themeColor) {
    currentThemeColor = changes.themeColor.newValue;
  }
  if (changes.autoTranslate || changes.clickTranslate) {
    // Will be handled by settingsChanged listener below
  }
});

// Handle messages from background/popup
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  if (msg && msg.action === "openDictionary") {
    showDictionary();
  }
  if (msg && msg.action === "translateSelection" && msg.text) {
    const rect = {
      left: window.innerWidth / 2 - 100,
      top: window.innerHeight / 2 - 60,
      bottom: window.innerHeight / 2 + 40
    };
    showTranslationPopup(msg.text, rect);
  }
  if (msg && msg.action === "themeChanged") {
    if (msg.theme) {
      currentTheme = msg.theme;
    }
  }
  if (msg && msg.action === "languageChanged") {
    if (msg.language) {
      currentLanguage = msg.language;
    }
  }
  if (msg && msg.action === "settingsChanged") {
    // refresh event handlers based on storage
    rebindHandlersFromStorage();
  }
});

// Helper: rebind handlers based on storage config
async function rebindHandlersFromStorage() {
  const s = await new Promise(resolve => chrome.storage.sync.get({ autoTranslate: false, clickTranslate: false }, resolve));
  document.removeEventListener('mouseup', autoTranslateHandler, true);
  document.removeEventListener('click', clickTranslateHandler, true);
  if (s.autoTranslate) document.addEventListener('mouseup', autoTranslateHandler, true);
  if (s.clickTranslate) document.addEventListener('click', clickTranslateHandler, true);
}

// ==== Dictionary (overlay) & translations cache ====

async function loadTranslationCache() {
  const res = await new Promise(resolve => chrome.storage.local.get({ translationCache: {} }, resolve));
  translationCache = res.translationCache || {};
}

// Batch translate helper (used for missing translations)
async function batchTranslate(words, sourceLang = "auto", targetLang = "ru") {
  const results = [];
  for (const w of words) {
    try {
      const resp = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(w)}`);
      const data = await resp.json();
      results.push(data[0][0][0]);
    } catch (e) {
      console.error("batchTranslate error", e);
      results.push("—");
    }
  }
  return results;
}

async function showDictionary() {
  if (document.getElementById("dictionary-overlay")) return;

  await loadTranslationCache();

  const cssURL = chrome.runtime.getURL("dictionary.css");
  const html = `
    <div id="dictionary-overlay">
      <div id="dictionary-container" class="${currentTheme}">
        <div id="dictionary-header">
          <div id="logo-area"><img id="logo"></div>
          <div id="header-buttons">
            <button id="settings-icon" class="icon-button" title="Настройки"><img id="settings-img"></button>
            <button id="close-icon" class="icon-button" title="Закрыть"><img id="close-img"></button>
          </div>
        </div>
        <div id="dictionary-content">
          <div id="table-header">
            <div id="th-word">Word</div>
            <div id="th-translation">Translation</div>
          </div>
          <div id="dictionary-list"></div>
        </div>
      </div>
    </div>
  `;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  // add CSS link once
  if (!document.querySelector("#dict-style")) {
    const style = document.createElement("link");
    style.id = "dict-style";
    style.rel = "stylesheet";
    style.href = cssURL;
    document.head.appendChild(style);
  }

  document.getElementById("logo").src = chrome.runtime.getURL("images/logo.png");
  document.getElementById("settings-img").src = chrome.runtime.getURL("images/settings.png");
  document.getElementById("close-img").src = chrome.runtime.getURL("images/close.png");

  // close button
  document.getElementById("close-icon").addEventListener("click", () => {
    const overlay = document.getElementById("dictionary-overlay");
    overlay.classList.add("fade-out");
    setTimeout(() => overlay?.remove(), 200);
  });

  // settings button opens popup
  document.getElementById("settings-icon").addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ action: "openPopupMenu" });
    } catch {
      chrome.runtime.openOptionsPage?.();
    }
  });

  // Close when clicking outside overlay
  function outsideHandler(e) {
    const container = document.getElementById("dictionary-container");
    if (container && !container.contains(e.target)) {
      const overlay = document.getElementById("dictionary-overlay");
      overlay?.remove();
      document.removeEventListener("mousedown", outsideHandler, true);
    }
  }
  document.addEventListener("mousedown", outsideHandler, true);

  // Close on Escape
  function escHandler(e) {
    if (e.key === "Escape") {
      const overlay = document.getElementById("dictionary-overlay");
      overlay?.remove();
      document.removeEventListener("keydown", escHandler, true);
    }
  }
  document.addEventListener("keydown", escHandler, true);

  // Load content
  loadDictionary();
}

async function loadDictionary() {
  const { dictionary = [], translationCache: cache = {} } = await new Promise(resolve => chrome.storage.local.get({ dictionary: [], translationCache: {} }, resolve));
  translationCache = cache || {};
  const list = document.getElementById("dictionary-list");
  const thWord = document.getElementById("th-word");
  const thTrans = document.getElementById("th-translation");
  if (!list || !thWord || !thTrans) return;

  // Use prepared UI texts for column names from popup side (fallbacks)
  const uiLang = (await new Promise(resolve => chrome.storage.sync.get({ language: "en" }, resolve))).language || "en";
  const colWord = (uiLang === "ru" ? "Слово" : uiLang === "kk" ? "Сөз" : uiLang === "es" ? "Palabra" : uiLang === "fr" ? "Mot" : uiLang === "de" ? "Wort" : uiLang === "ja" ? "単語" : "Word");
  const colTrans = (uiLang === "ru" ? "Перевод" : uiLang === "kk" ? "Аударма" : uiLang === "es" ? "Traducción" : uiLang === "fr" ? "Traduction" : uiLang === "de" ? "Übersetzung" : uiLang === "ja" ? "翻訳" : "Translation");

  thWord.textContent = colWord;
  thTrans.textContent = colTrans;

  list.innerHTML = "";

  if (!dictionary.length) {
    list.innerHTML = `<p class="empty">${uiLang === "ru" ? "Словарь пуст" : uiLang === "kk" ? "Сөздік бос" : uiLang === "es" ? "El diccionario está vacío" : uiLang === "fr" ? "Le dictionnaire est vide" : uiLang === "de" ? "Wörterbuch ist leer" : uiLang === "ja" ? "辞書は空です" : "The dictionary is empty"}</p>`;
    return;
  }

  // Determine missing translations for currentLanguage
  const missing = dictionary
    .map(d => d.word)
    .filter(w => !translationCache[`${w}|${currentLanguage}`]);

  if (missing.length) {
    const translations = await batchTranslate(missing, "auto", currentLanguage);
    missing.forEach((w, i) => {
      const pretty = translations[i] || "—";
      translationCache[`${w}|${currentLanguage}`] = pretty;
    });
    await new Promise(resolve => chrome.storage.local.set({ translationCache }, resolve));
  }

  dictionary.forEach(({ word }) => {
    const translation = translationCache[`${word}|${currentLanguage}`] || "—";
    const prettyWord = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    const prettyTranslation = typeof translation === "string" ? (translation.charAt(0).toUpperCase() + translation.slice(1)) : translation;

    const row = document.createElement("div");
    row.className = "word-row";
    row.innerHTML = `
      <div class="word-cell">${prettyWord}</div>
      <div class="translation-cell">
        ${prettyTranslation}
        <img src="${chrome.runtime.getURL("images/close.png")}" class="delete-icon" title="Delete">
      </div>
    `;
    const deleteIcon = row.querySelector(".delete-icon");
    deleteIcon.addEventListener("click", async (e) => {
      e.stopPropagation();
      row.classList.add("fade-out");
      setTimeout(async () => {
        const updated = dictionary.filter(item => item.word !== word);
        await new Promise(resolve => chrome.storage.local.set({ dictionary: updated }, resolve));
        delete translationCache[`${word}|${currentLanguage}`];
        await new Promise(resolve => chrome.storage.local.set({ translationCache }, resolve));
        row.remove();
        if (updated.length === 0) {
          list.innerHTML = `<p class="empty">${uiLang === "ru" ? "Словарь пуст" : "Empty"}</p>`;
        }
      }, 180);
    });
    list.appendChild(row);
  });
}

// === Translate popup for selection / click ===
async function showTranslationPopup(text, rect) {
  const old = document.getElementById("translate-popup");
  if (old) old.remove();

  // container
  const popup = document.createElement("div");
  popup.id = "translate-popup";
  popup.className = `translate-popup ${currentTheme}`;
  popup.innerHTML = `
    <div class="translate-header"><span id="translate-title">Translation</span><button id="close-translate">×</button></div>
    <div class="translate-body">Translating...</div>
  `;
  document.body.appendChild(popup);

  // style (component-level)
  const style = document.createElement("style");
  style.textContent = `
    #translate-popup.translate-popup.dark {
      background: linear-gradient(145deg, #1c1c1c, #2a2a2a);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.06);
    }
    #translate-popup.translate-popup.light {
      background: linear-gradient(145deg, #ffffff, #f5f6fa);
      color: #111;
      border: 1px solid rgba(0,0,0,0.06);
    }
    #translate-popup { position:absolute; z-index:999999; max-width:380px; min-width:220px; border-radius:12px; padding:12px; box-shadow:0 4px 16px rgba(0,0,0,0.25); font-family: 'Segoe UI', sans-serif; }
    .translate-header { display:flex; justify-content:space-between; align-items:center; font-weight:600; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:6px; }
    #close-translate { background:none; border:none; font-size:18px; cursor:pointer; color:inherit; }
    .translate-body { line-height:1.5; word-break:break-word; }
  `;
  document.head.appendChild(style);

  // position
  popup.style.left = `${Math.max(10, rect.left + window.scrollX)}px`;
  popup.style.top = `${Math.max(10, rect.top + window.scrollY - 60)}px`;
  if ((rect.left + popup.offsetWidth) > window.innerWidth) {
    popup.style.left = `${window.innerWidth - popup.offsetWidth - 10}px`;
  }

  // fetch translation
  try {
    const resp = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${currentLanguage}&dt=t&q=${encodeURIComponent(text)}`);
    const data = await resp.json();
    const translated = data[0]?.map(p => p[0]).join(" ") || "—";
    popup.querySelector(".translate-body").textContent = translated;
  } catch (e) {
    popup.querySelector(".translate-body").textContent = "Ошибка перевода";
  }

  // close handlers
  document.getElementById("close-translate").addEventListener("click", () => popup.remove());
  function outside(e) {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener("mousedown", outside, true);
    }
  }
  document.addEventListener("mousedown", outside, true);
}

// === selection/click handlers ===
function autoTranslateHandler(e) {
  try {
    const text = window.getSelection().toString().trim();
    if (!text) return;
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    showTranslationPopup(text, rect);
  } catch (err) { /* ignore */ }
}

function clickTranslateHandler(e) {
  const selection = window.getSelection();
  if (!selection.isCollapsed) return;
  let range;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(e.clientX, e.clientY);
  } else if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(e.clientX, e.clientY);
    range = document.createRange();
    range.setStart(p.offsetNode, p.offset);
    range.setEnd(p.offsetNode, p.offset);
  }
  if (!range || !range.startContainer || range.startContainer.nodeType !== 3) return;
  const textNode = range.startContainer;
  const text = textNode.textContent || "";
  const offset = range.startOffset;
  // define word boundaries
  const leftMatch = text.slice(0, offset).match(/\b[\p{L}\p{N}’'-]+$/u);
  const rightMatch = text.slice(offset).match(/^[\p{L}\p{N}’'-]+\b/u);
  const left = leftMatch ? offset - leftMatch[0].length : offset;
  const right = rightMatch ? offset + rightMatch[0].length : offset;
  const word = text.slice(left, right).trim();
  if (!word || word.length < 2) return;
  const selRange = document.createRange();
  selRange.setStart(textNode, left);
  selRange.setEnd(textNode, right);
  selection.removeAllRanges();
  selection.addRange(selRange);
  const rect = selRange.getBoundingClientRect();
  const inX = e.clientX >= rect.left && e.clientX <= rect.right;
  const inY = e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (!rect.width || !rect.height || !inX || !inY) return;
  showTranslationPopup(word, rect);
}

// initial binding based on settings
(async function initBindings() {
  const s = await new Promise(resolve => chrome.storage.sync.get({ autoTranslate: false, clickTranslate: false }, resolve));
  if (s.autoTranslate) document.addEventListener('mouseup', autoTranslateHandler, true);
  if (s.clickTranslate) document.addEventListener('click', clickTranslateHandler, true);
})();

// listen for storage changes to rebind
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.autoTranslate || changes.clickTranslate) {
    // unbind and rebind
    document.removeEventListener('mouseup', autoTranslateHandler, true);
    document.removeEventListener('click', clickTranslateHandler, true);
    (async () => {
      const s = await new Promise(resolve => chrome.storage.sync.get({ autoTranslate: false, clickTranslate: false }, resolve));
      if (s.autoTranslate) document.addEventListener('mouseup', autoTranslateHandler, true);
      if (s.clickTranslate) document.addEventListener('click', clickTranslateHandler, true);
    })();
  }
});
// === Стили для словарного окна ===
function injectDictionaryStyles() {
  if (document.getElementById('dictionary-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'dictionary-styles';
  style.textContent = `
    .dictionary-popup {
      position: fixed;
      z-index: 10000;
      max-width: 320px;
      padding: 16px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      animation: fadeIn 0.2s ease;
      backdrop-filter: blur(10px);
    }
    
    .dictionary-popup.light-theme {
      background: rgba(255, 255, 255, 0.95);
      color: #1a1a1a;
      border: 1px solid #e1e5e9;
    }
    
    .dictionary-popup.dark-theme {
      background: rgba(45, 45, 45, 0.95);
      color: #ffffff;
      border: 1px solid #555555;
    }
    
    .dictionary-word {
      font-weight: 700;
      margin-bottom: 8px;
      font-size: 18px;
      color: inherit;
    }
    
    .dictionary-translation {
      margin-bottom: 12px;
      color: inherit;
      opacity: 0.9;
      font-size: 15px;
    }
    
    .dictionary-buttons {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    
    .dictionary-btn {
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      flex: 1;
      font-weight: 600;
    }
    
    .dictionary-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    
    /* Светлая тема - кнопки */
    .light-theme .dictionary-btn {
      background: #f8f9fa;
      color: #1a1a1a;
      border: 1px solid #d1d9e0;
    }
    
    .light-theme .dictionary-btn:hover {
      background: #e9ecef;
    }
    
    /* Темная тема - кнопки */
    .dark-theme .dictionary-btn {
      background: #404040;
      color: #ffffff;
      border: 1px solid #666666;
    }
    
    .dark-theme .dictionary-btn:hover {
      background: #505050;
    }
    
    /* Специальные кнопки */
    .dictionary-btn-add {
      background: #10b981 !important;
      color: white !important;
      border: none !important;
    }
    
    .dictionary-btn-add:hover {
      background: #059669 !important;
    }
    
    .dictionary-btn-close {
      background: #ef4444 !important;
      color: white !important;
      border: none !important;
    }
    
    .dictionary-btn-close:hover {
      background: #dc2626 !important;
    }
    
    .dictionary-btn-speak {
      background: #3b82f6 !important;
      color: white !important;
      border: none !important;
    }
    
    .dictionary-btn-speak:hover {
      background: #2563eb !important;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-8px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    
    /* Адаптивность для мобильных */
    @media (max-width: 480px) {
      .dictionary-popup {
        max-width: 280px;
        padding: 12px;
      }
      
      .dictionary-buttons {
        flex-direction: column;
        gap: 6px;
      }
    }
  `;
  document.head.appendChild(style);
}

// === Функция создания словарного окна ===
function createDictionaryPopup(word, translation, x, y) {
  // Удаляем существующее окно
  const existingPopup = document.querySelector('.dictionary-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  // Внедряем стили если их нет
  injectDictionaryStyles();

  // Получаем текущую тему
  chrome.storage.sync.get(['theme'], function(result) {
    const theme = result.theme || 'dark';
    
    const popup = document.createElement('div');
    popup.className = `dictionary-popup ${theme}-theme`;
    
    popup.innerHTML = `
      <div class="dictionary-word">${word}</div>
      <div class="dictionary-translation">${translation}</div>
      <div class="dictionary-buttons">
        <button class="dictionary-btn dictionary-btn-add" onclick="addToDictionary('${word}', '${translation}')">
          📚 Добавить
        </button>
        <button class="dictionary-btn dictionary-btn-speak" onclick="speakWord('${word}')">
          🔊 Произнести
        </button>
        <button class="dictionary-btn dictionary-btn-close" onclick="this.closest('.dictionary-popup').remove()">
          ✕ Закрыть
        </button>
      </div>
    `;

    // Позиционируем окно
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    
    // Корректируем позицию если окно выходит за границы
    const rect = popup.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      popup.style.left = (x - (rect.right - window.innerWidth) - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      popup.style.top = (y - rect.height - 10) + 'px';
    }

    document.body.appendChild(popup);

    // Закрытие при клике вне окна
    setTimeout(() => {
      document.addEventListener('click', function closePopup(e) {
        if (!popup.contains(e.target)) {
          popup.remove();
          document.removeEventListener('click', closePopup);
        }
      });
    }, 100);
  });
}

// === Функция добавления в словарь ===
function addToDictionary(word, translation) {
  chrome.storage.local.get(['dictionary'], function(result) {
    const dictionary = result.dictionary || [];
    
    // Проверяем, нет ли уже такого слова
    if (!dictionary.some(item => item.word === word)) {
      dictionary.push({
        word: word,
        translation: translation,
        date: new Date().toISOString()
      });
      
      chrome.storage.local.set({ dictionary: dictionary }, function() {
        const popup = document.querySelector('.dictionary-popup');
        if (popup) {
          const addBtn = popup.querySelector('.dictionary-btn-add');
          addBtn.textContent = '✅ Добавлено';
          addBtn.disabled = true;
          addBtn.style.background = '#6b7280';
          setTimeout(() => {
            popup.remove();
          }, 1000);
        }
      });
    } else {
      const popup = document.querySelector('.dictionary-popup');
      if (popup) {
        const addBtn = popup.querySelector('.dictionary-btn-add');
        addBtn.textContent = '⚠️ Уже в словаре';
        addBtn.disabled = true;
        addBtn.style.background = '#6b7280';
        setTimeout(() => {
          popup.remove();
        }, 1000);
      }
    }
  });
}

// === Функция произношения ===
function speakWord(word) {
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.8;
  speechSynthesis.speak(utterance);
}

// === Обработчик сообщений от popup ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateDictionaryTheme") {
    const popup = document.querySelector('.dictionary-popup');
    if (popup) {
      popup.className = `dictionary-popup ${message.theme}-theme`;
    }
  }
  
  if (message.action === "closeDictionaryPopup") {
    const popup = document.querySelector('.dictionary-popup');
    if (popup && !popup.contains(document.elementFromPoint(message.clickX, message.clickY))) {
      popup.remove();
    }
  }
});

// === Сделаем функции глобальными для использования в onclick ===
window.addToDictionary = addToDictionary;
window.speakWord = speakWord;

