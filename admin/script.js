document.addEventListener('DOMContentLoaded', () => {

    // --- НАСТРОЙКИ ---
    // !!! ВАЖНО: Замените на URL вашего сервера
    const API_BASE_URL = 'https://efficiently-exulting-horntail.cloudpub.ru:443';
    const API_KEY = 'your-super-secret-and-long-api-key-12345';
    const ACCESS_CODE = 'Polza59'; // Ваш код доступа

    // --- Элементы DOM ---
    const loginScreen = document.getElementById('login-screen');
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('password-input');
    const loginError = document.getElementById('login-error');
    const adminPanel = document.getElementById('admin-panel');
    const chatListEl = document.getElementById('chat-list');
    const chatViewPlaceholder = document.getElementById('chat-view-placeholder');
    const activeChatView = document.getElementById('active-chat-view');
    const currentChatUsernameEl = document.getElementById('current-chat-username');
    const messagesViewEl = document.getElementById('messages-view');
    const replyForm = document.getElementById('reply-area');
    const replyInput = document.getElementById('reply-input');

    // --- Глобальное состояние ---
    let ws = null;
    let currentChatUserId = null;
    let allChats = [];

    // --- ЛОГИКА ВХОДА ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const enteredPassword = passwordInput.value;
        if (enteredPassword === ACCESS_CODE) {
            loginScreen.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            initializeAdminPanel();
        } else {
            loginError.textContent = 'Неверный код доступа';
            passwordInput.style.border = '1px solid #d32f2f';
            setTimeout(() => {
                loginError.textContent = '';
                passwordInput.style.border = '1px solid var(--border-color)';
            }, 2000);
        }
    });

    // --- ОСНОВНАЯ ЛОГИКА АДМИНКИ ---
    function initializeAdminPanel() {
        loadAllChats();
        connectWebSocket();
    }

    async function fetchWithAuth(endpoint, options = {}) {
        const headers = { 'X-API-Key': API_KEY, ...options.headers };
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            console.error("Fetch error:", error);
            throw error;
        }
    }

    // 1. Загрузка и отображение списка чатов
    async function loadAllChats() {
        try {
            const data = await fetchWithAuth('/api/admin/chats');
            allChats = data.chats || [];
            renderChatList();
        } catch (error) {
            chatListEl.innerHTML = '<p style="text-align:center; color:red;">Ошибка загрузки</p>';
        }
    }

    function renderChatList() {
        const scrollPosition = chatListEl.scrollTop;
        chatListEl.innerHTML = '';
        if (allChats.length === 0) {
            chatListEl.innerHTML = '<p style="text-align:center;">Нет активных диалогов</p>';
            return;
        }

        allChats.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'chat-list-item';
            item.dataset.userId = chat.user_id;

            if (chat.admin_unread_count > 0) {
                item.classList.add('unread');
            }
            if (chat.user_id == currentChatUserId) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <h4>${chat.first_name || 'Пользователь'} (@${chat.username || 'N/A'})</h4>
                <p>Телефон: ${chat.phone_number || 'не указан'}</p>
                ${chat.admin_unread_count > 0 ? `<span class="unread-counter">${chat.admin_unread_count}</span>` : ''}
            `;
            item.addEventListener('click', () => loadChatHistory(chat.user_id));
            chatListEl.appendChild(item);
        });
        chatListEl.scrollTop = scrollPosition;
    }

    // 2. Загрузка истории выбранного чата (версия с ручным обновлением UI)
    async function loadChatHistory(userId) {
        if (currentChatUserId === userId) return;

        currentChatUserId = userId;

        const oldActive = chatListEl.querySelector('.active');
        if (oldActive) oldActive.classList.remove('active');

        const newActive = chatListEl.querySelector(`.chat-list-item[data-user-id='${userId}']`);
        if (newActive) {
            newActive.classList.add('active');
            const counter = newActive.querySelector('.unread-counter');
            if (counter) counter.classList.add('hidden');
            newActive.classList.remove('unread');
        }

        chatViewPlaceholder.classList.add('hidden');
        activeChatView.classList.remove('hidden');
        messagesViewEl.innerHTML = '<div class="loader"></div>';

        const selectedChat = allChats.find(c => c.user_id == userId);
        currentChatUsernameEl.textContent = `${selectedChat.first_name || 'Пользователь'} (ID: ${userId})`;

        try {
            const data = await fetchWithAuth(`/api/admin/chats/${userId}`);
            renderMessages(data.messages);

            // Обновляем счетчик в основном массиве и перерисовываем список
            const chatToUpdate = allChats.find(c => c.user_id == userId);
            if (chatToUpdate) {
                chatToUpdate.admin_unread_count = 0;
            }
            renderChatList(); // Перерисовываем, чтобы убрать счетчик
        } catch (error) {
            messagesViewEl.innerHTML = '<p style="text-align:center; color:red;">Не удалось загрузить сообщения</p>';
        }
    }

    function renderMessages(messages) {
        messagesViewEl.innerHTML = '';
        messages.forEach(msg => addMessageToView(msg));
        messagesViewEl.scrollTop = messagesViewEl.scrollHeight;
    }

    function addMessageToView(message) {
        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${message.sender_type === 'admin' ? 'admin-message' : 'user-message'}`;

        const date = new Date(message.timestamp);
        const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        msgEl.innerHTML = `${message.text}<span class="timestamp">${time}</span>`;
        messagesViewEl.appendChild(msgEl);
    }

    // 3. Подключение WebSocket для real-time обновлений
    function connectWebSocket() {
        const wsUrl = API_BASE_URL.replace('https', 'wss').replace('http', 'ws') + '/ws/admin';
        ws = new WebSocket(wsUrl);

        ws.onopen = () => console.log('[WS] Соединение с сервером установлено (admin)');

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);

            // Игнорируем сообщения от самого админа, чтобы избежать дублирования
            if (message.sender_type === 'admin') {
                console.log('[WS] Игнорируем собственное сообщение от админа.');
                return;
            }

            // --- НАЧАЛО НОВОЙ ЛОГИКИ ---
            const chatIndex = allChats.findIndex(c => c.user_id == message.user_id);

            // Если чата нет в списке (новый пользователь написал), перезагружаем все чаты
            if (chatIndex === -1) {
                loadAllChats();
                return;
            }

            // Удаляем чат из его текущей позиции
            const [chatToUpdate] = allChats.splice(chatIndex, 1);

            // Если сообщение пришло в активный чат
            if (message.user_id == currentChatUserId) {
                addMessageToView(message);
                messagesViewEl.scrollTop = messagesViewEl.scrollHeight;
                chatToUpdate.admin_unread_count = 0; // Сразу помечаем как прочитанное
            } else {
                // Если сообщение пришло в НЕактивный чат, увеличиваем счетчик
                chatToUpdate.admin_unread_count = (chatToUpdate.admin_unread_count || 0) + 1;
            }

            // Помещаем обновленный чат в начало массива
            allChats.unshift(chatToUpdate);

            // Перерисовываем список чатов с новым порядком
            renderChatList();
            // --- КОНЕЦ НОВОЙ ЛОГИКИ ---
        };

        ws.onclose = () => {
            console.log('[WS] Соединение закрыто. Переподключение через 5 секунд...');
            setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (error) => {
            console.error('[WS] Ошибка:', error);
            ws.close();
        };
    }

    // 4. Отправка ответа от администратора
    replyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = replyInput.value.trim();
        if (!text || !currentChatUserId || !ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const messagePayload = {
            type: 'admin_message',
            user_id: parseInt(currentChatUserId),
            text: text
        };

        ws.send(JSON.stringify(messagePayload));

        addMessageToView({
            text,
            sender_type: 'admin',
            timestamp: new Date().toISOString()
        });
        messagesViewEl.scrollTop = messagesViewEl.scrollHeight;

        replyInput.value = '';

        // --- НАЧАЛО НОВОЙ ЛОГИКИ: ПЕРЕМЕЩЕНИЕ ДИАЛОГА НАВЕРХ ПОСЛЕ ОТВЕТА ---
        const chatIndex = allChats.findIndex(c => c.user_id == currentChatUserId);
        if (chatIndex > 0) { // Перемещаем, только если он не был первым
            const [chatToMove] = allChats.splice(chatIndex, 1);
            allChats.unshift(chatToMove);
            renderChatList();
        }
        // --- КОНЕЦ НОВОЙ ЛОГИКИ ---
    });
});