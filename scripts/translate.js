    // Global variables
    let selectedText = '';
    let currentMode = 'translate';

    // DOM elements
    const modeTitleElement = document.getElementById('modeTitle');
    const originalTextElement = document.getElementById('originalText');
    const resultTextarea = document.getElementById('resultTextarea');
    const copyBtn = document.getElementById('copyBtn');
    const speakBtn = document.getElementById('speakBtn');
    const saveBtn = document.getElementById('saveBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const closeBtn = document.getElementById('closeBtn');
    const loadingElement = document.getElementById('loading');

    // Initialize the popup
    document.addEventListener('DOMContentLoaded', function() {
        initializePopup();
        setupEventListeners();
    });

    function initializePopup() {
        // Get the selected text and mode from Chrome storage
        chrome.storage.local.get(['selectedText', 'actionMode'], function(result) {
            if (result.selectedText) {
                selectedText = result.selectedText;
                currentMode = result.actionMode || 'translate';

                // Update UI based on mode
                updateModeUI();

                originalTextElement.textContent = selectedText;

                // Use Chrome Writer API if available
                if ('writer' in window) {
                    processWithWriterAPI(selectedText, currentMode);
                } else {
                    // Fallback to simulation
                    processText(selectedText, currentMode);
                }
            } else {
                originalTextElement.textContent = 'No text selected';
                resultTextarea.placeholder = 'Please select text on the page and use the context menu';
            }
        });
    }

    function updateModeUI() {
        const modeTitles = {
            'translate': 'Translate',
            'explain': 'Explanation',
            'retell': 'Retelling'
        };

        const modePlaceholders = {
            'translate': 'Translation will appear here...',
            'explain': 'Explanation will appear here...',
            'retell': 'Retelling will appear here...'
        };

        modeTitleElement.textContent = modeTitles[currentMode] || 'Translate';
        resultTextarea.placeholder = modePlaceholders[currentMode] || 'Result will appear here...';
    }

    function setupEventListeners() {
        // Copy button
        copyBtn.addEventListener('click', function() {
            const textToCopy = resultTextarea.value;
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showTemporaryMessage('Copied to clipboard!');
                });
            }
        });

        // Speak button
        speakBtn.addEventListener('click', function() {
            const textToSpeak = resultTextarea.value;
            if (textToSpeak && 'speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                utterance.lang = 'en-US';
                utterance.rate = 0.8;
                speechSynthesis.speak(utterance);
            }
        });

        // Save to dictionary button
        saveBtn.addEventListener('click', function() {
            const word = selectedText.trim();
            const translation = resultTextarea.value || '';

            if (word) {
                chrome.storage.local.get(['dictionary'], function(result) {
                    const dictionary = result.dictionary || [];
                    // Check if word already exists
                    const existingIndex = dictionary.findIndex(item => item.word === word);

                    if (existingIndex === -1) {
                        // Add new word
                        dictionary.push({
                            word: word,
                            translation: translation,
                            mode: currentMode,
                            date: new Date().toISOString()
                        });
                    } else {
                        // Update existing word
                        dictionary[existingIndex].translation = translation;
                        dictionary[existingIndex].mode = currentMode;
                        dictionary[existingIndex].date = new Date().toISOString();
                    }

                    // Save back to storage
                    chrome.storage.local.set({ dictionary: dictionary }, function() {
                        showTemporaryMessage('Saved to dictionary!');
                    });
                });
            }
        });

        // Settings button
        settingsBtn.addEventListener('click', function() {
            chrome.runtime.openOptionsPage();
        });

        // Close button
        closeBtn.addEventListener('click', function() {
            window.close();
        });
    }

    function processWithWriterAPI(text, mode) {
        if (!text.trim()) return;

        showLoading(true);

        // Map our modes to Writer API prompts
        const writerPrompts = {
            'translate': `Translate the following text to Russian. Keep the meaning accurate and natural:\n\n"${text}"`,
            'explain': `Explain the following text in simple terms. Break down the meaning and context:\n\n"${text}"`,
            'retell': `Retell the following text in your own words. Keep the main ideas but simplify the language:\n\n"${text}"`
        };

        const prompt = writerPrompts[mode] || writerPrompts.translate;

        if ('writer' in window) {
            // Use Chrome Writer API
            writer.rewrite(
                prompt, {
                    format: 'plainText',
                    tone: 'professional'
                }
            ).then(response => {
                resultTextarea.value = response;
                showLoading(false);
            }).catch(error => {
                console.error('Writer API error:', error);
                // Fallback to simulation
                processText(text, mode);
            });
        } else {
            // Fallback
            processText(text, mode);
        }
    }

    function processText(text, mode) {
        if (!text.trim()) return;

        showLoading(true);

        // Fallback simulation - replace with actual API calls
        setTimeout(() => {
            let result = '';

            switch (mode) {
                case 'translate':
                    result = simulateTranslation(text);
                    break;
                case 'explain':
                    result = simulateExplanation(text);
                    break;
                case 'retell':
                    result = simulateRetelling(text);
                    break;
            }

            resultTextarea.value = result;
            showLoading(false);
        }, 1000);
    }

    function simulateTranslation(text) {
        const mockTranslations = {
            'hello': 'Привет',
            'world': 'мир',
            'good morning': 'Доброе утро',
            'thank you': 'Спасибо',
            'how are you': 'Как дела',
            'this is a sample text': 'Это пример текста',
            'artificial intelligence': 'искусственный интеллект',
            'browser extension': 'расширение для браузера'
        };

        const lowerText = text.toLowerCase();
        return mockTranslations[lowerText] || `[Translation]: "${text}" → Здесь будет перевод через Writer API`;
    }

    function simulateExplanation(text) {
        return `Explanation of: "${text}"\n\n• Length: ${text.length} characters, ${text.split(' ').length} words\n• Type: ${text.length > 50 ? 'Complex passage' : 'Simple phrase'}\n• Context: This appears to be standard text requiring explanation\n• Key elements: Language structure, meaning, usage context`;
    }

    function simulateRetelling(text) {
        return `Retelling: "${text}"\n\nSimplified version:\n"${text.toLowerCase()}"\n\nThis retelling maintains the core meaning while using simpler language and structure for better comprehension.`;
    }

    function showLoading(show) {
        if (show) {
            loadingElement.classList.add('active');
            resultTextarea.style.opacity = '0.5';
        } else {
            loadingElement.classList.remove('active');
            resultTextarea.style.opacity = '1';
        }
    }

    function showTemporaryMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        z-index: 1000;
        pointer-events: none;
    `;

        document.body.appendChild(messageElement);

        setTimeout(() => {
            document.body.removeChild(messageElement);
        }, 1500);
    }

    // Check for Writer API availability
    function checkWriterAPI() {
        if ('writer' in window) {
            console.log('Chrome Writer API is available');
            return true;
        } else {
            console.log('Chrome Writer API is not available, using fallback');
            return false;
        }
    }

    // Initialize Writer API check
    document.addEventListener('DOMContentLoaded', function() {
        const isWriterAvailable = checkWriterAPI();

        // Update UI based on API availability
        if (!isWriterAvailable) {
            const header = document.querySelector('.popup-header h3');
            if (header) {
                header.textContent += ' (Fallback Mode)';
            }
        }
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'c') {
                e.preventDefault();
                copyBtn.click();
            }
        }

        if (e.key === 'Escape') {
            window.close();
        }
    });