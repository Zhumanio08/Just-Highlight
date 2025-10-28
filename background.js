chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "addToDictionary",
    title: "Добавить в словарь",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "openDictionary",
    title: "Открыть словарь",
    contexts: ["page", "selection"]
  });

  chrome.contextMenus.create({
    id: "translate-selection",
    title: "JHI — Translate",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === "openDictionary") {
    chrome.tabs.sendMessage(tab.id, { action: "openDictionary" });
    return;
  }

  if (info.menuItemId === "translate-selection") {
    chrome.tabs.sendMessage(tab.id, { action: "translateSelection", text: info.selectionText });
    return;
  }

  if (info.menuItemId === "addToDictionary") {
    const raw = (info.selectionText || "").trim();
    if (!raw) return;

    chrome.storage.sync.get({ language: 'en' }, async (res) => {
      const lang = res.language || 'en';
      try {
        const resp = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(raw)}`);
        const data = await resp.json();
        const translation = data?.[0]?.[0]?.[0] || "(перевод недоступен)";

        const prettyWord = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        const prettyTranslation = translation.charAt(0).toUpperCase() + translation.slice(1).toLowerCase();

        chrome.storage.local.get({ dictionary: [], translationCache: {} }, (store) => {
          const dict = store.dictionary || [];
          const cache = store.translationCache || {};
          if (!dict.find(item => item.word === prettyWord)) {
            dict.push({ word: prettyWord });
            cache[`${prettyWord}|${lang}`] = prettyTranslation;
            chrome.storage.local.set({ dictionary: dict, translationCache: cache }, () => {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (w, t) => alert(`"${w}" → "${t}" добавлено в словарь ✅`),
                args: [prettyWord, prettyTranslation]
              });
            });
          }
        });
      } catch (e) {
        console.error("Translate API error:", e);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === "openPopupMenu") {
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {
        chrome.runtime.openOptionsPage?.();
      });
    } else {
      chrome.runtime.openOptionsPage?.();
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-popup") {
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {
        chrome.runtime.openOptionsPage?.();
      });
    } else {
      chrome.runtime.openOptionsPage?.();
    }
  }

  if (command === "open-dictionary") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "openDictionary" });
      }
    });
  }
});

