document.addEventListener('DOMContentLoaded', ()-&gt; {

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
    loginForm.addEventListener('submit', (e) =&gt; {
        e.preventDefault();
        const enteredPassword = passwordInput.value;
        if (enteredPassword === ACCESS_CODE) {
            loginScreen.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            initializeAdminPanel();
        } else {
            loginError.textContent = 'Неверный код доступа';
            passwordInput.style.border = '1px solid #d32f2f';
            setTimeout(() =&gt; {
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

    // --- ИЗМЕНЕНИЕ: Добавляем функцию сортировки ---
    function sortChats() {
        allChats.sort((a, b) =&gt; {
            // Сначала чаты с непрочитанными сообщениями
            const a_unread = a.admin_unread_count &gt; 0;
            const b_unread = b.admin_unread_count &gt; 0;
            if (a_unread &amp;&amp; !b_unread) return -1;
            if (!a_unread &amp;&amp; b_unread) return 1;

            // Затем по дате последнего сообщения (от нового к старому)
            return new Date(b.last_message_at) - new Date(a.last_message_at);
        });
    }


    // 1. Загрузка и отображение списка чатов
    async function loadAllChats() {
        try {
            const data = await fetchWithAuth('/api/admin/chats');
            allChats = data.chats || [];
            // --- ИЗМЕНЕНИЕ: Сортируем при первой загрузке ---
            sortChats();
            renderChatList();
        } catch (error) {
            chatListEl.innerHTML = '&lt;p style="text-align:center; color:red;"&gt;Ошибка загрузки&lt;/p&gt;';
        }
    }

    function renderChatList() {
        const scrollPosition = chatListEl.scrollTop;
        chatListEl.innerHTML = '';
        if (allChats.length === 0) {
            chatListEl.innerHTML = '&lt;p style="text-align:center;"&gt;Нет активных диалогов&lt;/p&gt;';
            return;
        }

        allChats.forEach(chat =&gt; {
            const item = document.createElement('div');
            item.className = 'chat-list-item';
            item.dataset.userId = chat.user_id;

            if (chat.admin_unread_count &gt; 0) {
                item.classList.add('unread');
            }
            if (chat.user_id == currentChatUserId) {
                item.classList.add('active');
            }

            item.innerHTML = `
                &lt;h4&gt;${chat.first_name || 'Пользователь'} (@${chat.username || 'N/A'})&lt;/h4&gt;
                &lt;p&gt;Телефон: ${chat.phone_number || 'не указан'}&lt;/p&gt;
                ${chat.admin_unread_count &gt; 0 ? `&lt;span class="unread-counter"&gt;${chat.admin_unread_count}&lt;/span&gt;` : ''}
            `;
            item.addEventListener('click', () =&gt; loadChatHistory(chat.user_id));
            chatListEl.appendChild(item);
        });
        chatListEl.scrollTop = scrollPosition;
    }

    // 2. Загрузка истории выбранного чата
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
        messagesViewEl.innerHTML = '&lt;div class="loader"&gt;&lt;/div&gt;';

        const selectedChat = allChats.find(c =&gt; c.user_id == userId);
        currentChatUsernameEl.textContent = `${selectedChat.first_name || 'Пользователь'} (ID: ${userId})`;

        try {
            const data = await fetchWithAuth(`/api/admin/chats/${userId}`);
            renderMessages(data.messages);

            const chatToUpdate = allChats.find(c =&gt; c.user_id == userId);
            if (chatToUpdate) {
                chatToUpdate.admin_unread_count = 0;
            }
        } catch (error) {
            messagesViewEl.innerHTML = '&lt;p style="text-align:center; color:red;"&gt;Не удалось загрузить сообщения&lt;/p&gt;';
        }
    }

    function renderMessages(messages) {
        messagesViewEl.innerHTML = '';
        messages.forEach(msg =&gt; addMessageToView(msg));
        messagesViewEl.scrollTop = messagesViewEl.scrollHeight;
    }

    function addMessageToView(message) {
        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${message.sender_type === 'admin' ? 'admin-message' : 'user-message'}`;

        const date = new Date(message.timestamp);
        const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        msgEl.innerHTML = `${message.text}&lt;span class="timestamp"&gt;${time}&lt;/span&gt;`;
        messagesViewEl.appendChild(msgEl);
    }

    // 3. Подключение WebSocket для real-time обновлений
    function connectWebSocket() {
        const wsUrl = API_BASE_URL.replace('https', 'wss').replace('http', 'ws') + '/ws/admin';
        ws = new WebSocket(wsUrl);

        ws.onopen = () =&gt; console.log('[WS] Соединение с сервером установлено (admin)');

        ws.onmessage = (event) =&gt; {
            const message = JSON.parse(event.data);

            if (message.sender_type === 'admin') {
                return;
            }

            if (message.user_id == currentChatUserId) {
                addMessageToView(message);
                messagesViewEl.scrollTop = messagesViewEl.scrollHeight;

                const chatToUpdate = allChats.find(c =&gt; c.user_id == message.user_id);
                if(chatToUpdate) {
                     chatToUpdate.admin_unread_count = 0;
                     // --- ИЗМЕНЕНИЕ: Обновляем время, чтобы чат остался наверху ---
                     chatToUpdate.last_message_at = new Date().toISOString();
                }

            } else {
                 const chatToUpdate = allChats.find(c =&gt; c.user_id == message.user_id);
                 if (chatToUpdate) {
                     chatToUpdate.admin_unread_count = (chatToUpdate.admin_unread_count || 0) + 1;
                      // --- ИЗМЕНЕНИЕ: Обновляем время последнего сообщения ---
                     chatToUpdate.last_message_at = new Date().toISOString();
                 } else {
                     // Если это новый чат, просто перезагружаем все
                     loadAllChats();
                     return;
                 }
            }
            // --- ИЗМЕНЕНИЕ: Сортируем и перерисовываем список ---
            sortChats();
            renderChatList();
        };

        ws.onclose = () =&gt; {
            console.log('[WS] Соединение закрыто. Переподключение через 5 секунд...');
            setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (error) =&gt; {
            console.error('[WS] Ошибка:', error);
            ws.close();
        };
    }

    // 4. Отправка ответа от администратора
    replyForm.addEventListener('submit', (e) =&gt; {
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

        // --- ИЗМЕНЕНИЕ: После ответа перемещаем текущий чат наверх ---
        const chatToUpdate = allChats.find(c =&gt; c.user_id == currentChatUserId);
        if (chatToUpdate) {
            chatToUpdate.last_message_at = new Date().toISOString();
            sortChats();
            renderChatList();
        }
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

        replyInput.value = '';
    });
});