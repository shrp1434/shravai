// ==================== WebLLM Import ====================
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// ==================== State ====================
const state = {
    engine: null,
    status: 'unloaded', // unloaded | loading | ready | generating | error
    chatHistory: [],
    settings: {
        model: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
        customModel: '',
        systemPrompt: 'You are a helpful assistant. Be concise.',
        temperature: 0.7,
        maxTokens: 512,
        conciseMode: false,
        theme: 'dark'
    },
    cancelRequested: false,
    isGenerating: false,
    lastUserMessageIndex: -1
};

// ==================== DOM References ====================
const $ = (id) => document.getElementById(id);
const dom = {
    statusPill: $('statusPill'),
    statusText: $('statusPill').querySelector('.status-text'),
    themeToggle: $('themeToggle'),
    themeIcon: $('themeToggle').querySelector('.theme-icon'),
    mobileMenuToggle: $('mobileMenuToggle'),
    sidebar: $('sidebar'),
    
    modelSelect: $('modelSelect'),
    customModelInput: $('customModelInput'),
    systemPrompt: $('systemPrompt'),
    conciseMode: $('conciseMode'),
    temperature: $('temperature'),
    temperatureValue: $('temperatureValue'),
    maxTokens: $('maxTokens'),
    
    loadModelBtn: $('loadModelBtn'),
    clearChatBtn: $('clearChatBtn'),
    regenerateBtn: $('regenerateBtn'),
    exportBtn: $('exportBtn'),
    importBtn: $('importBtn'),
    resetDataBtn: $('resetDataBtn'),
    
    errorBanner: $('errorBanner'),
    errorText: $('errorText'),
    errorClose: $('errorClose'),
    
    progressContainer: $('progressContainer'),
    progressFill: $('progressFill'),
    progressText: $('progressText'),
    
    chatMessages: $('chatMessages'),
    emptyState: $('emptyState'),
    jumpToBottom: $('jumpToBottom'),
    
    userInput: $('userInput'),
    sendBtn: $('sendBtn'),
    stopBtn: $('stopBtn'),
    
    fileInput: $('fileInput')
};

// ==================== Initialization ====================
function init() {
    loadSettings();
    applyTheme();
    attachEventListeners();
    renderMessages();
    updateStatus('unloaded');
}

// ==================== Settings Persistence ====================
function loadSettings() {
    const saved = localStorage.getItem('localai_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(state.settings, parsed);
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
    
    const savedHistory = localStorage.getItem('localai_chatHistory');
    if (savedHistory) {
        try {
            state.chatHistory = JSON.parse(savedHistory);
        } catch (e) {
            console.error('Failed to load chat history:', e);
        }
    }
    
    applySavedSettings();
}

function saveSettings() {
    localStorage.setItem('localai_settings', JSON.stringify(state.settings));
    localStorage.setItem('localai_chatHistory', JSON.stringify(state.chatHistory));
}

function applySavedSettings() {
    dom.modelSelect.value = state.settings.model === 'custom' || !['Llama-3.2-3B-Instruct-q4f32_1-MLC', 'Llama-3.2-1B-Instruct-q4f32_1-MLC'].includes(state.settings.model) ? 'custom' : state.settings.model;
    dom.customModelInput.value = state.settings.customModel;
    dom.customModelInput.style.display = dom.modelSelect.value === 'custom' ? 'block' : 'none';
    dom.systemPrompt.value = state.settings.systemPrompt;
    dom.temperature.value = state.settings.temperature;
    dom.temperatureValue.textContent = state.settings.temperature;
    dom.maxTokens.value = state.settings.maxTokens;
    dom.conciseMode.checked = state.settings.conciseMode;
}

// ==================== Theme ====================
function applyTheme() {
    document.body.setAttribute('data-theme', state.settings.theme);
    dom.themeIcon.textContent = state.settings.theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    saveSettings();
}

// ==================== Event Listeners ====================
function attachEventListeners() {
    dom.themeToggle.addEventListener('click', toggleTheme);
    dom.mobileMenuToggle.addEventListener('click', () => {
        dom.sidebar.classList.toggle('open');
    });
    
    dom.modelSelect.addEventListener('change', (e) => {
        const isCustom = e.target.value === 'custom';
        dom.customModelInput.style.display = isCustom ? 'block' : 'none';
        if (isCustom) {
            state.settings.model = 'custom';
        } else {
            state.settings.model = e.target.value;
        }
        saveSettings();
    });
    
    dom.customModelInput.addEventListener('input', (e) => {
        state.settings.customModel = e.target.value.trim();
        saveSettings();
    });
    
    dom.systemPrompt.addEventListener('input', (e) => {
        state.settings.systemPrompt = e.target.value;
        saveSettings();
    });
    
    dom.conciseMode.addEventListener('change', (e) => {
        state.settings.conciseMode = e.target.checked;
        saveSettings();
    });
    
    dom.temperature.addEventListener('input', (e) => {
        state.settings.temperature = parseFloat(e.target.value);
        dom.temperatureValue.textContent = state.settings.temperature;
        saveSettings();
    });
    
    dom.maxTokens.addEventListener('input', (e) => {
        state.settings.maxTokens = parseInt(e.target.value);
        saveSettings();
    });
    
    dom.loadModelBtn.addEventListener('click', loadModel);
    dom.clearChatBtn.addEventListener('click', clearChat);
    dom.regenerateBtn.addEventListener('click', regenerateLastResponse);
    dom.exportBtn.addEventListener('click', exportChat);
    dom.importBtn.addEventListener('click', () => dom.fileInput.click());
    dom.resetDataBtn.addEventListener('click', resetAppData);
    
    dom.errorClose.addEventListener('click', hideError);
    
    dom.sendBtn.addEventListener('click', sendMessage);
    dom.stopBtn.addEventListener('click', stopGeneration);
    
    dom.userInput.addEventListener('input', autoResizeTextarea);
    dom.userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.isGenerating) {
            stopGeneration();
        }
    });
    
    dom.jumpToBottom.addEventListener('click', () => {
        scrollToBottom(true);
    });
    
    dom.chatMessages.addEventListener('scroll', handleScroll);
    
    dom.fileInput.addEventListener('change', handleFileImport);
}

// ==================== Status Management ====================
function updateStatus(status, text = null) {
    state.status = status;
    dom.statusPill.setAttribute('data-status', status);
    
    const statusTexts = {
        unloaded: 'Not Loaded',
        loading: 'Loading Model',
        ready: 'Ready',
        generating: 'Generating',
        error: 'Error'
    };
    
    dom.statusText.textContent = text || statusTexts[status] || status;
    
    dom.sendBtn.disabled = status !== 'ready';
    dom.loadModelBtn.disabled = status === 'loading' || status === 'generating';
}

// ==================== Error Handling ====================
function showError(message) {
    dom.errorText.textContent = message;
    dom.errorBanner.style.display = 'block';
}

function hideError() {
    dom.errorBanner.style.display = 'none';
}

// ==================== Progress Bar ====================
function showProgress(progress) {
    dom.progressContainer.style.display = 'block';
    const percent = Math.round(progress * 100);
    dom.progressFill.style.width = `${percent}%`;
    dom.progressText.textContent = `${percent}%`;
}

function hideProgress() {
    dom.progressContainer.style.display = 'none';
}

// ==================== Model Loading ====================
async function loadModel() {
    hideError();
    updateStatus('loading');
    showProgress(0);
    
    try {
        const selectedModel = getSelectedModel();
        if (!selectedModel) {
            throw new Error('Please enter a custom model ID');
        }
        
        const initProgressCallback = (progress) => {
            if (typeof progress === 'object' && progress.progress !== undefined) {
                showProgress(progress.progress);
            } else if (typeof progress === 'number') {
                showProgress(progress);
            }
        };
        
        state.engine = await webllm.CreateMLCEngine(selectedModel, {
            initProgressCallback: initProgressCallback
        });
        
        hideProgress();
        updateStatus('ready');
    } catch (error) {
        console.error('Model loading failed:', error);
        hideProgress();
        updateStatus('error');
        showError(`Failed to load model: ${error.message}. Try a smaller model, check your browser supports WebGPU, or clear site data and reload.`);
    }
}

function getSelectedModel() {
    if (state.settings.model === 'custom') {
        return state.settings.customModel || null;
    }
    return state.settings.model;
}

// ==================== Chat Management ====================
function sendMessage() {
    const input = dom.userInput.value.trim();
    if (!input || !state.engine || state.isGenerating) return;
    
    hideError();
    
    const userMessage = {
        role: 'user',
        content: input,
        timestamp: new Date().toISOString()
    };
    
    state.chatHistory.push(userMessage);
    state.lastUserMessageIndex = state.chatHistory.length - 1;
    
    dom.userInput.value = '';
    autoResizeTextarea();
    
    renderMessages();
    generateAssistantReply();
    saveSettings();
}

async function generateAssistantReply() {
    state.isGenerating = true;
    state.cancelRequested = false;
    updateStatus('generating');
    dom.stopBtn.style.display = 'flex';
    dom.sendBtn.style.display = 'none';
    dom.regenerateBtn.disabled = true;
    
    const assistantPlaceholder = {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true
    };
    
    state.chatHistory.push(assistantPlaceholder);
    const assistantIndex = state.chatHistory.length - 1;
    renderMessages();
    scrollToBottom();
    
    try {
        const messages = buildMessagesArray();
        let fullReply = '';
        
        const chunks = await state.engine.chat.completions.create({
            messages: messages,
            stream: true,
            temperature: state.settings.temperature,
            max_tokens: state.settings.maxTokens
        });
        
        for await (const chunk of chunks) {
            if (state.cancelRequested) {
                fullReply += ' (stopped)';
                break;
            }
            
            const delta = chunk.choices[0]?.delta?.content || '';
            fullReply += delta;
            state.chatHistory[assistantIndex].content = fullReply;
            renderMessages();
            scrollToBottom();
        }
        
        state.chatHistory[assistantIndex].isStreaming = false;
        renderMessages();
        
    } catch (error) {
        console.error('Generation failed:', error);
        state.chatHistory[assistantIndex].content = `Error: ${error.message}`;
        state.chatHistory[assistantIndex].isStreaming = false;
        renderMessages();
        showError(`Generation failed: ${error.message}`);
    } finally {
        state.isGenerating = false;
        updateStatus('ready');
        dom.stopBtn.style.display = 'none';
        dom.sendBtn.style.display = 'flex';
        dom.regenerateBtn.disabled = false;
        saveSettings();
    }
}

function buildMessagesArray() {
    let systemPrompt = state.settings.systemPrompt;
    if (state.settings.conciseMode) {
        systemPrompt += ' Answer in under 8 sentences unless asked.';
    }
    
    const messages = [
        { role: 'system', content: systemPrompt }
    ];
    
    for (const msg of state.chatHistory) {
        if (msg.role !== 'system' && !msg.isStreaming) {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }
    }
    
    return messages;
}

function stopGeneration() {
    state.cancelRequested = true;
}

async function regenerateLastResponse() {
    if (state.chatHistory.length < 2 || state.isGenerating) return;
    
    if (state.chatHistory[state.chatHistory.length - 1].role === 'assistant') {
        state.chatHistory.pop();
    }
    
    renderMessages();
    await generateAssistantReply();
}

function clearChat() {
    if (state.isGenerating) return;
    if (!confirm('Clear all messages?')) return;
    
    state.chatHistory = [];
    state.lastUserMessageIndex = -1;
    renderMessages();
    saveSettings();
}

// ==================== Message Rendering ====================
function renderMessages() {
    if (state.chatHistory.length === 0) {
        dom.emptyState.style.display = 'flex';
        dom.regenerateBtn.disabled = true;
        return;
    }
    
    dom.emptyState.style.display = 'none';
    
    const messagesHTML = state.chatHistory.map((msg, index) => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const isUser = msg.role === 'user';
        const isStreaming = msg.isStreaming;
        
        return `
            <div class="message ${msg.role}" data-index="${index}">
                <div class="message-header">
                    <span class="message-role">${isUser ? 'You' : 'Assistant'}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-bubble">
                    <div class="message-content">${escapeHtml(msg.content)}</div>
                    ${isStreaming ? '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>' : ''}
                    ${!isUser && !isStreaming ? `
                        <div class="message-actions">
                            <button class="message-action-btn copy-btn" data-index="${index}">📋 Copy</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    dom.chatMessages.innerHTML = messagesHTML;
    
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            copyToClipboard(state.chatHistory[index].content);
        });
    });
    
    const hasMessages = state.chatHistory.length > 0;
    const lastIsAssistant = hasMessages && state.chatHistory[state.chatHistory.length - 1].role === 'assistant';
    dom.regenerateBtn.disabled = !hasMessages || !lastIsAssistant || state.isGenerating;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== Scroll Management ====================
function scrollToBottom(force = false) {
    const container = dom.chatMessages;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    
    if (force || isNearBottom) {
        container.scrollTop = container.scrollHeight;
        dom.jumpToBottom.style.display = 'none';
    }
}

function handleScroll() {
    const container = dom.chatMessages;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    
    if (!isNearBottom && state.chatHistory.length > 0) {
        dom.jumpToBottom.style.display = 'block';
    } else {
        dom.jumpToBottom.style.display = 'none';
    }
}

// ==================== Utility Functions ====================
function autoResizeTextarea() {
    const textarea = dom.userInput;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

// ==================== Export/Import ====================
function exportChat() {
    const exportData = {
        version: 1,
        model: getSelectedModel(),
        systemPrompt: state.settings.systemPrompt,
        messages: state.chatHistory.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
        })),
        settings: {
            temperature: state.settings.temperature,
            maxTokens: state.settings.maxTokens,
            conciseMode: state.settings.conciseMode
        }
    };
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importData = JSON.parse(event.target.result);
            
            if (!importData.version || !importData.messages) {
                throw new Error('Invalid export format');
            }
            
            state.chatHistory = importData.messages.map(msg => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp || new Date().toISOString()
            }));
            
            if (importData.settings) {
                state.settings.temperature = importData.settings.temperature || 0.7;
                state.settings.maxTokens = importData.settings.maxTokens || 512;
                state.settings.conciseMode = importData.settings.conciseMode || false;
            }
            
            if (importData.systemPrompt) {
                state.settings.systemPrompt = importData.systemPrompt;
            }
            
            applySavedSettings();
            renderMessages();
            saveSettings();
            scrollToBottom(true);
            
        } catch (error) {
            console.error('Import failed:', error);
            showError(`Import failed: ${error.message}`);
        }
    };
    
    reader.readAsText(file);
    e.target.value = '';
}

function resetAppData() {
    if (!confirm('Reset all app data including settings and chat history? (Model cache must be cleared separately in browser settings)')) {
        return;
    }
    
    localStorage.clear();
    state.chatHistory = [];
    state.settings = {
        model: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
        customModel: '',
        systemPrompt: 'You are a helpful assistant. Be concise.',
        temperature: 0.7,
        maxTokens: 512,
        conciseMode: false,
        theme: 'dark'
    };
    
    applySavedSettings();
    applyTheme();
    renderMessages();
    
    alert('App data reset. To clear cached models, go to browser settings > Privacy > Site data and clear data for this site, then reload.');
}

// ==================== Start ====================
init();
