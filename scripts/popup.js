// popup.js — 2025 обновлённая версия

const uiTexts = {
  en: {
    popupTitle: "Settings",
    autoTranslateLabel: "Auto translate selection",
    autoTranslateDesc: "Automatically translate highlighted text.",
    clickTranslateLabel: "Click to translate",
    clickTranslateDesc: "Click on any word to translate it.",
    langLabel: "Interface Language",
    themeLabel: "Theme",
    exportLabel: "Export",
    exportButton: "Export to Anki",
  },
  ru: {
    popupTitle: "Настройки",
    autoTranslateLabel: "Автоматический перевод выделенного",
    autoTranslateDesc: "Автоматически переводить выделенный текст.",
    clickTranslateLabel: "Перевод по клику",
    clickTranslateDesc: "Переводить слово по клику.",
    langLabel: "Язык интерфейса",
    themeLabel: "Тема",
    exportLabel: "Экспорт",
    exportButton: "Экспортировать в Anki",
  },
  kk: {
    popupTitle: "Баптаулар",
    autoTranslateLabel: "Мәтінді автоматты аудару",
    autoTranslateDesc: "Бөлектелген мәтінді автоматты түрде аударады.",
    clickTranslateLabel: "Басқанда аудару",
    clickTranslateDesc: "Сөзді басқанда аударады.",
    langLabel: "Тіл",
    themeLabel: "Тақырып",
    exportLabel: "Экспорт",
    exportButton: "Anki-ға экспорттау",
  },
  es: {
    popupTitle: "Configuración",
    autoTranslateLabel: "Traducción automática",
    autoTranslateDesc: "Traduce automáticamente el texto seleccionado.",
    clickTranslateLabel: "Traducir al hacer clic",
    clickTranslateDesc: "Traduce una palabra al hacer clic en ella.",
    langLabel: "Idioma de la interfaz",
    themeLabel: "Tema",
    exportLabel: "Exportar",
    exportButton: "Exportar a Anki",
  },
  fr: {
    popupTitle: "Paramètres",
    autoTranslateLabel: "Traduction automatique",
    autoTranslateDesc: "Traduit automatiquement le texto seleccionado.",
    clickTranslateLabel: "Traduire au clic",
    clickTranslateDesc: "Traduit un mot en cliquant dessus.",
    langLabel: "Langue de l'interface",
    themeLabel: "Thème",
    exportLabel: "Exporter",
    exportButton: "Exporter vers Anki",
  },
  de: {
    popupTitle: "Einstellungen",
    autoTranslateLabel: "Automatische Übersetzung",
    autoTranslateDesc: "Übersetzt automatisch markierten Text.",
    clickTranslateLabel: "Klick zum Übersetzen",
    clickTranslateDesc: "Übersetzt ein Wort per Klick.",
    langLabel: "Sprache der Oberfläche",
    themeLabel: "Thema",
    exportLabel: "Export",
    exportButton: "In Anki exportieren",
  },
  ja: {
    popupTitle: "設定",
    autoTranslateLabel: "自動翻訳",
    autoTranslateDesc: "選択したテキストを自動的に翻訳します。",
    clickTranslateLabel: "クリックで翻訳",
    clickTranslateDesc: "単語をクリックして翻訳します。",
    langLabel: "インターフェースの言語",
    themeLabel: "テーマ",
    exportLabel: "エクспорт",
    exportButton: "Ankiにエクスポート",
  },
};

// === helpers ===
function storageSyncGet(keys) { return new Promise(r => chrome.storage.sync.get(keys, r)); }
function storageSyncSet(obj) { return new Promise(r => chrome.storage.sync.set(obj, r)); }
function storageLocalGet(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function storageLocalSet(obj) { return new Promise(r => chrome.storage.local.set(obj, r)); }

function applyUiTexts(lang) {
  const t = uiTexts[lang] || uiTexts.en;
  for (const [id, text] of Object.entries(t)) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  const btn = document.getElementById("export-anki");
  if (btn) btn.textContent = t.exportButton;
}

function applyTheme(theme) {
  const link = document.getElementById("theme-style");
  link.href = theme === "light" ? "styles/popup-light.css" : "styles/popup-dark.css";
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { action: "themeChanged", theme });
  });
}

// === Перевод слов через Google API ===
async function getTranslation(word, sourceLang = "auto", targetLang = "ru") {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(word)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (Array.isArray(data[0])) {
      return data[0].map(segment => Array.isArray(segment) ? segment[0] : "").join("");
    }
    return "—";
  } catch (e) {
    console.error("Ошибка перевода:", e);
    return "—";
  }
}

// === Определяем язык для перевода ===
function getTargetLang(uiLang) {
  switch (uiLang) {
    case "ru": return "ru";
    case "kk": return "kk";
    case "es": return "es";
    case "fr": return "fr";
    case "de": return "de";
    case "ja": return "ja";
    default: return "ru";
  }
}

// === Генерация примеров ===
function generateExample(word) {
  const examples = [
    `I often use the word "${word}" in my daily speech.`,
    `Let's remember how to use "${word}" correctly.`,
    `The word "${word}" is very useful to know.`,
    `Try to make a sentence with "${word}".`
  ];
  return examples[Math.floor(Math.random() * examples.length)];
}

// === Экспорт в CSV ===
async function exportToCSV(words, uiLang) {
  const targetLang = getTargetLang(uiLang);
  const rows = [["Слово", "Перевод", "Пример"]];
  for (const item of words) {
    const word = item.word;
    const translation = await getTranslation(word, "en", targetLang);
    const example = generateExample(word);
    rows.push([word, translation, example]);
  }

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "anki_export.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert("✅ The file anki_export.csv has been saved.");
}

// === Экспорт в Anki ===
async function sendToAnki(words, uiLang) {
  const targetLang = getTargetLang(uiLang);

  for (const item of words) {
    const word = item.word;
    const translation = await getTranslation(word, "en", targetLang);
    const example = generateExample(word);

    try {
      const res = await fetch("http://127.0.0.1:8765", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addNote",
          version: 6,
          params: {
            note: {
              deckName: "Default",
              modelName: "Basic",
              fields: {
                Front: word,
                Back: `${translation}<br><br><i>${example}</i>`
              },
              options: { allowDuplicate: false },
              tags: ["chrome-dictionary"]
            }
          }
        })
      });

      const data = await res.json();
      if (data.error) {
        console.warn("Error adding to Anki:", data.error);
      }
    } catch (err) {
      console.error("❌ Error connecting to Anki:", err);
      alert("⚠ Unable to connect to Anki. Please verify that Anki is open and the AnkiConnect plugin is installed..");
      return;
    }
  }

  alert("✅ All words successfully sent to Anki!");
}

function showExportModal(words, uiLang) {
  const modal = document.createElement("div");
  modal.className = "export-modal";
  modal.innerHTML = `
    <div class="export-card">
      <h3>📤 Exporting a dictionary</h3>
      <p>Select the method for transferring words:</p>
      <div class="export-buttons">
        <button id="exportCSV">Save to CSV</button>
        <button id="exportAnki">Send to Anki</button>
      </div>
      <button id="closeExport" class="close-btn">Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);

  const style = document.createElement("style");
  style.textContent = `
    .export-modal {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.6);
      display: flex; justify-content: center; align-items: center;
      z-index: 9999;
      backdrop-filter: blur(4px);
    }
    .export-card {
      background: #2a2b3e;
      color: white;
      border-radius: 16px;
      padding: 20px 24px;
      width: 270px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      animation: popIn 0.25s ease;
    }
    @keyframes popIn {
      from { transform: scale(0.8); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .export-buttons {
      display: flex;
      justify-content: space-between;
      margin: 15px 0;
      gap: 10px;
    }
    .export-buttons button {
      flex: 1;
      background: var(--accent-color, #6366f1);
      color: white;
      border: none;
      border-radius: 10px;
      padding: 8px 0;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .export-buttons button:hover { background: #7c80ff; }
    .close-btn {
      background: transparent;
      color: #ccc;
      border: none;
      font-size: 12px;
      cursor: pointer;
      margin-top: 6px;
    }
  `;
  document.head.appendChild(style);

  document.getElementById("exportCSV").onclick = async () => {
    await exportToCSV(words, uiLang);
    modal.remove();
  };
  document.getElementById("exportAnki").onclick = async () => {
    await sendToAnki(words, uiLang);
    modal.remove();
  };
  document.getElementById("closeExport").onclick = () => modal.remove();
}

// === main init ===
document.addEventListener("DOMContentLoaded", async () => {
  const autoT = document.getElementById("toggleAutoTranslate");
  const clickT = document.getElementById("toggleClickTranslate");
  const langSel = document.getElementById("langSelect");
  const darkBtn = document.getElementById("darkThemeBtn");
  const lightBtn = document.getElementById("lightThemeBtn");
  const exportBtn = document.getElementById("export-anki");

  const { language = "en", autoTranslate = false, clickTranslate = false, theme = "dark" } = await storageSyncGet({
    language: "en", autoTranslate: false, clickTranslate: false, theme: "dark"
  });

  applyUiTexts(language);
  applyTheme(theme);
  autoT.checked = autoTranslate;
  clickT.checked = clickTranslate;
  langSel.value = language;

  if (theme === "dark") { darkBtn.classList.add("active"); lightBtn.classList.remove("active"); }
  else { lightBtn.classList.add("active"); darkBtn.classList.remove("active"); }

  autoT.addEventListener("change", () => {
    storageSyncSet({ autoTranslate: autoT.checked });
    chrome.tabs.query({}, t => t.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: "settingsChanged" })));
  });
  clickT.addEventListener("change", () => {
    storageSyncSet({ clickTranslate: clickT.checked });
    chrome.tabs.query({}, t => t.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: "settingsChanged" })));
  });

  langSel.addEventListener("change", async () => {
    const lang = langSel.value;
    await storageSyncSet({ language: lang });
    applyUiTexts(lang);
    chrome.tabs.query({}, tabs => {
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { action: "languageChanged", language: lang });
    });
  });

  darkBtn.addEventListener("click", async () => {
    darkBtn.classList.add("active"); lightBtn.classList.remove("active");
    await storageSyncSet({ theme: "dark" }); 
    applyTheme("dark");
    // Отправляем сообщение всем вкладкам об изменении темы
    chrome.tabs.query({}, tabs => {
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { action: "updateDictionaryTheme", theme: "dark" });
    });
  });
  lightBtn.addEventListener("click", async () => {
    lightBtn.classList.add("active"); darkBtn.classList.remove("active");
    await storageSyncSet({ theme: "light" }); 
    applyTheme("light");
    // Отправляем сообщение всем вкладкам об изменении темы
    chrome.tabs.query({}, tabs => {
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { action: "updateDictionaryTheme", theme: "light" });
    });
  });

  // === Close dictionary when click outside ===
  document.addEventListener("click", (e) => {
    chrome.tabs.query({}, tabs => {
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { action: "closeDictionaryPopup", clickX: e.clientX, clickY: e.clientY });
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "themeChanged") {
      const theme = message.theme;
      const popup = document.querySelector(".dictionary-popup");
      if (popup) {
        popup.className = 'dictionary-popup ' + (theme === 'dark' ? 'dark-theme' : 'light-theme');
      }
    }

    if (message.action === "languageChanged") {
      chrome.storage.sync.get("language", ({ language }) => {
        // currentLang = language;
      });
    }

    if (message.action === "closeDictionaryPopup") {
      const popup = document.querySelector(".dictionary-popup");
      if (popup && !popup.contains(document.elementFromPoint(message.clickX, message.clickY))) {
        popup.remove();
      }
    }
  });

  // === Экспорт в Anki / CSV с автоматическим переводом ===
  exportBtn.addEventListener("click", async () => {
    const [storage, settings] = await Promise.all([
      new Promise(resolve =>
        chrome.storage.local.get(["dictionary"], res => resolve(res.dictionary || []))
      ),
      new Promise(resolve =>
        chrome.storage.sync.get(["language"], res => resolve(res.language || "en"))
      )
    ]);

    const words = storage;
    const lang = settings;

    if (!words.length) {
      alert("The dictionary is empty. 😕");
      return;
    }

    showExportModal(words, lang);
  });
});
