// ==================== WebLLM Import ====================
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// ==================== State ====================
const state = {
    engine: null,
    status: 'unloaded',
    chatHistory: [],
    settings: {
        model: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
        customModel: '',
        systemPrompt: 'You are a helpful AI assistant. When asked to generate images, describe what you would create.',
        temperature: 0.7,
        maxTokens: 512,
        theme: 'dark'
    },
    isGenerating: false
};

// ==================== DOM References ====================
const $ = id => document.getElementById(id);
const dom = {
    newChatBtn: $('newChatBtn'),
    modelsBtn: $('modelsBtn'),
    settingsBtn: $('settingsBtn'),
    exportBtn: $('exportBtn'),
    importBtn: $('importBtn'),
    themeToggle: $('themeToggle'),
    
    statusDot: $('statusDot'),
    modelSelect: $('modelSelect'),
    progressBar: $('progressBar'),
    progressFill: $('progressFill'),
    
    emptyState: $('emptyState'),
    chatArea: $('chatArea'),
    messages: $('messages'),
    messageInput: $('messageInput'),
    sendBtn: $('sendBtn'),
    
    settingsModal: $('settingsModal'),
    closeSettings: $('closeSettings'),
    customModelInput: $('customModelInput'),
    systemPrompt: $('systemPrompt'),
    temperature: $('temperature'),
    tempValue: $('tempValue'),
    maxTokens: $('maxTokens'),
    loadModelBtn: $('loadModelBtn'),
    clearChatBtn: $('clearChatBtn'),
    
    fileInput: $('fileInput')
};

// ==================== Init ====================
function init() {
    loadSettings();
    applySettings();
    attachEvents();
    updateStatus('unloaded');
}

// ==================== Settings ====================
function loadSettings() {
    const saved = localStorage.getItem('localai_settings');
    if (saved) {
        try {
            Object.assign(state.settings, JSON.parse(saved));
        } catch (e) {}
    }
    
    const savedHistory = localStorage.getItem('localai_history');
    if (savedHistory) {
        try {
            state.chatHistory = JSON.parse(savedHistory);
        } catch (e) {}
    }
}

function saveSettings() {
    localStorage.setItem('localai_settings', JSON.stringify(state.settings));
    localStorage.setItem('localai_history', JSON.stringify(state.chatHistory));
}

function applySettings() {
    document.body.setAttribute('data-theme', state.settings.theme);
    dom.themeToggle.querySelector('.theme-icon').textContent = state.settings.theme === 'dark' ? '🌙' : '☀️';
    dom.modelSelect.value = state.settings.model !== 'custom' ? state.settings.model : 'custom';
    dom.customModelInput.value = state.settings.customModel;
    dom.systemPrompt.value = state.settings.systemPrompt;
    dom.temperature.value = state.settings.temperature;
    dom.tempValue.textContent = state.settings.temperature;
    dom.maxTokens.value = state.settings.maxTokens;
    
    renderMessages();
}

// ==================== Events ====================
function attachEvents() {
    dom.newChatBtn.addEventListener('click', () => {
        state.chatHistory = [];
        renderMessages();
        saveSettings();
    });
    
    dom.settingsBtn.addEventListener('click', () => {
        dom.settingsModal.style.display = 'flex';
    });
    
    dom.closeSettings.addEventListener('click', () => {
        dom.settingsModal.style.display = 'none';
    });
    
    dom.themeToggle.addEventListener('click', () => {
        state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
        applySettings();
        saveSettings();
    });
    
    dom.modelSelect.addEventListener('change', e => {
        state.settings.model = e.target.value;
        saveSettings();
    });
    
    dom.temperature.addEventListener('input', e => {
        state.settings.temperature = parseFloat(e.target.value);
        dom.tempValue.textContent = state.settings.temperature;
        saveSettings();
    });
    
    dom.maxTokens.addEventListener('input', e => {
        state.settings.maxTokens = parseInt(e.target.value);
        saveSettings();
    });
    
    dom.systemPrompt.addEventListener('input', e => {
        state.settings.systemPrompt = e.target.value;
        saveSettings();
    });
    
    dom.customModelInput.addEventListener('input', e => {
        state.settings.customModel = e.target.value;
        saveSettings();
    });
    
    dom.loadModelBtn.addEventListener('click', loadModel);
    dom.clearChatBtn.addEventListener('click', () => {
        state.chatHistory = [];
        renderMessages();
        saveSettings();
    });
    
    dom.exportBtn.addEventListener('click', exportChat);
    dom.importBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', importChat);
    
    dom.sendBtn.addEventListener('click', sendMessage);
    
    dom.messageInput.addEventListener('input', () => {
        dom.messageInput.style.height = 'auto';
        dom.messageInput.style.height = dom.messageInput.scrollHeight + 'px';
    });
    
    dom.messageInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    document.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.getAttribute('data-prompt');
            dom.messageInput.value = prompt;
            dom.messageInput.focus();
        });
    });
}

// ==================== Status ====================
function updateStatus(status) {
    state.status = status;
    dom.statusDot.className = `status-dot ${status}`;
    dom.sendBtn.disabled = status !== 'ready';
}

// ==================== Model Loading ====================
async function loadModel() {
    updateStatus('loading');
    dom.progressBar.style.display = 'block';
    
    try {
        const model = dom.modelSelect.value === 'custom' ? state.settings.customModel : dom.modelSelect.value;
        
        state.engine = await webllm.CreateMLCEngine(model, {
            initProgressCallback: progress => {
                const percent = typeof progress === 'number' ? progress : progress.progress || 0;
                dom.progressFill.style.width = `${percent * 100}%`;
            }
        });
        
        dom.progressBar.style.display = 'none';
        updateStatus('ready');
    } catch (error) {
        console.error('Model load failed:', error);
        dom.progressBar.style.display = 'none';
        updateStatus('unloaded');
        alert(`Failed to load model: ${error.message}`);
    }
}

// ==================== Chat ====================
async function sendMessage() {
    const text = dom.messageInput.value.trim();
    if (!text || !state.engine || state.isGenerating) return;
    
    const userMsg = {
        role: 'user',
        content: text,
        timestamp: Date.now()
    };
    
    state.chatHistory.push(userMsg);
    dom.messageInput.value = '';
    dom.messageInput.style.height = 'auto';
    
    renderMessages();
    await generateReply();
    saveSettings();
}

async function generateReply() {
    state.isGenerating = true;
    updateStatus('generating');
    
    const assistantMsg = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
    };
    
    state.chatHistory.push(assistantMsg);
    renderMessages();
    
    try {
        const messages = [
            { role: 'system', content: state.settings.systemPrompt },
            ...state.chatHistory.filter(m => !m.isStreaming).map(m => ({
                role: m.role,
                content: m.content
            }))
        ];
        
        const chunks = await state.engine.chat.completions.create({
            messages,
            stream: true,
            temperature: state.settings.temperature,
            max_tokens: state.settings.maxTokens
        });
        
        let fullReply = '';
        for await (const chunk of chunks) {
            const delta = chunk.choices[0]?.delta?.content || '';
            fullReply += delta;
            assistantMsg.content = fullReply;
            renderMessages();
        }
        
        assistantMsg.isStreaming = false;
        
        if (fullReply.toLowerCase().includes('generate') && fullReply.toLowerCase().includes('image')) {
            assistantMsg.hasImageRequest = true;
        }
        
        renderMessages();
    } catch (error) {
        console.error('Generation failed:', error);
        assistantMsg.content = `Error: ${error.message}`;
        assistantMsg.isStreaming = false;
        renderMessages();
    } finally {
        state.isGenerating = false;
        updateStatus('ready');
        saveSettings();
    }
}

// ==================== Rendering ====================
function renderMessages() {
    if (state.chatHistory.length === 0) {
        dom.emptyState.style.display = 'block';
        dom.messages.innerHTML = '';
        return;
    }
    
    dom.emptyState.style.display = 'none';
    
    dom.messages.innerHTML = state.chatHistory.map((msg, idx) => {
        const isUser = msg.role === 'user';
        const avatar = isUser ? '👤' : '🤖';
        
        return `
            <div class="message ${msg.role}">
                <div class="message-avatar">${avatar}</div>
                <div class="message-content">
                    <div class="message-text">${escapeHtml(msg.content)}</div>
                    ${msg.isStreaming ? '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>' : ''}
                    ${!isUser && !msg.isStreaming ? `
                        <div class="message-actions">
                            <button class="action-btn copy-btn" data-idx="${idx}">📋 Copy</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            navigator.clipboard.writeText(state.chatHistory[idx].content);
        });
    });
    
    dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== Export/Import ====================
function exportChat() {
    const data = {
        version: 1,
        model: state.settings.model,
        messages: state.chatHistory,
        settings: state.settings
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importChat(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = event => {
        try {
            const data = JSON.parse(event.target.result);
            state.chatHistory = data.messages || [];
            if (data.settings) Object.assign(state.settings, data.settings);
            applySettings();
            saveSettings();
        } catch (error) {
            alert('Import failed: Invalid file format');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ==================== Start ====================
init();

