// PWA and Service Worker initialization
class PWAManager {
    static async initialize() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                console.log('ServiceWorker registration successful:', registration);
                
                // Set up push notifications
                if ('Notification' in window) {
                    const permission = await Notification.requestPermission();
                    console.log('Notification permission:', permission);
                }
                
                return registration;
            } catch (error) {
                console.error('ServiceWorker registration failed:', error);
                return null;
            }
        }
    }
}

class UIManager {
    constructor() {
        this.initializeUI();
        this.setupThemeHandling();
        this.setupConnectionStatus();
    }

    initializeUI() {
        // Add app shell elements
        document.body.innerHTML = `
            <div class="app-header">
                <h1>DeshDrawChat</h1>
                <div class="connection-status" id="connectionStatus"></div>
                <button id="installPWA" class="hidden">Install App</button>
            </div>
            <div class="app-container">
                <div class="drawing-section">
                    <div class="drawing-controls">
                        <input type="color" id="colorPicker" value="#000000">
                        <input type="range" id="brushSize" min="1" max="20" value="2">
                        <button id="clearCanvas">Clear</button>
                        <button id="downloadDrawing">Download</button>
                    </div>
                    <canvas id="drawingCanvas"></canvas>
                </div>
                <div class="messaging-section">
                    <div id="messageHistory"></div>
                    <div class="message-input">
                        <textarea id="messageInput" placeholder="Type your message here"></textarea>
                        <button id="sendMessage">Send</button>
                    </div>
                </div>
            </div>
        `;
    }

    setupThemeHandling() {
        // Add theme detection and handling
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        const handleThemeChange = (e) => {
            document.body.classList.toggle('dark-theme', e.matches);
        };
        prefersDark.addListener(handleThemeChange);
        handleThemeChange(prefersDark);
    }

    setupConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        const updateConnectionStatus = () => {
            statusElement.textContent = navigator.onLine ? 'Online' : 'Offline';
            statusElement.className = `connection-status ${navigator.onLine ? 'online' : 'offline'}`;
        };
        window.addEventListener('online', updateConnectionStatus);
        window.addEventListener('offline', updateConnectionStatus);
        updateConnectionStatus();
    }
}

class DrawingApp {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.setupCanvas();
        this.addEventListeners();
        this.setupTouchEvents();
    }

    setupCanvas() {
        // Make canvas responsive
        const resizeCanvas = () => {
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.ctx.strokeStyle = document.getElementById('colorPicker').value;
            this.ctx.lineWidth = document.getElementById('brushSize').value;
            this.ctx.lineCap = 'round';
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    setupTouchEvents() {
        // Add touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });
    }

    addEventListeners() {
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

        document.getElementById('colorPicker').addEventListener('change', (e) => {
            this.ctx.strokeStyle = e.target.value;
        });

        document.getElementById('brushSize').addEventListener('input', (e) => {
            this.ctx.lineWidth = e.target.value;
        });

        document.getElementById('clearCanvas').addEventListener('click', () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        });

        document.getElementById('downloadDrawing').addEventListener('click', this.downloadDrawing.bind(this));
    }

    startDrawing(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
    }

    draw(e) {
        if (!this.isDrawing) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
    }

    stopDrawing() {
        this.isDrawing = false;
    }

    downloadDrawing() {
        // Add timestamp to filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const link = document.createElement('a');
        link.download = `drawing-${timestamp}.jpg`;
        link.href = this.canvas.toDataURL('image/jpeg');
        link.click();
    }
}

class MessagingApp {
    constructor() {
        this.messageHistory = document.getElementById('messageHistory');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendMessage');
        this.messageQueue = [];
        this.setupEventListeners();
        this.loadMessageHistory();
    }

    setupEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Handle offline/online events
        window.addEventListener('online', () => this.processMessageQueue());
        window.addEventListener('offline', () => {
            this.addMessageToHistory('system', 'You are currently offline. Messages will be sent when connection is restored.');
        });
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        this.addMessageToHistory('user', message);
        this.messageInput.value = '';

        if (navigator.onLine) {
            await this.sendToChatGPT(message);
        } else {
            this.messageQueue.push(message);
            this.addMessageToHistory('system', 'Message queued for sending when online');
            this.saveMessageQueue();
        }
    }

    async sendToChatGPT(message) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer API-KEY-HERE`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{
                        role: "user",
                        content: message
                    }]
                })
            });

            const data = await response.json();
            this.addMessageToHistory('assistant', data.choices[0].message.content);
            this.saveMessageHistory();
        } catch (error) {
            console.error('Error sending message to ChatGPT:', error);
            this.addMessageToHistory('system', 'Error sending message to ChatGPT');
        }
    }

    addMessageToHistory(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        messageDiv.textContent = `${role}: ${content}`;
        this.messageHistory.appendChild(messageDiv);
        this.messageHistory.scrollTop = this.messageHistory.scrollHeight;
        this.saveMessageHistory();
    }

    saveMessageHistory() {
        const messages = Array.from(this.messageHistory.children).map(msg => ({
            role: msg.classList[1],
            content: msg.textContent
        }));
        localStorage.setItem('messageHistory', JSON.stringify(messages));
    }

    loadMessageHistory() {
        const savedMessages = localStorage.getItem('messageHistory');
        if (savedMessages) {
            JSON.parse(savedMessages).forEach(msg => {
                this.addMessageToHistory(msg.role, msg.content);
            });
        }
    }

    saveMessageQueue() {
        localStorage.setItem('messageQueue', JSON.stringify(this.messageQueue));
    }

    async processMessageQueue() {
        const savedQueue = localStorage.getItem('messageQueue');
        if (savedQueue) {
            this.messageQueue = JSON.parse(savedQueue);
        }

        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            await this.sendToChatGPT(message);
        }

        localStorage.removeItem('messageQueue');
    }
}

// Initialize the application
window.addEventListener('load', async () => {
    const ui = new UIManager();
    const registration = await PWAManager.initialize();
    const drawingApp = new DrawingApp();
    const messagingApp = new MessagingApp();

    // Handle PWA installation
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installButton = document.getElementById('installPWA');
        installButton.classList.remove('hidden');
        
        installButton.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User ${outcome} the installation`);
                deferredPrompt = null;
                installButton.classList.add('hidden');
            }
        });
    });
});
