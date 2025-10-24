// Файл: app.js (ИЗМЕНЕННАЯ ВЕРСИЯ)

document.addEventListener('DOMContentLoaded', () => {

    // --- НАСТРОЙКИ ---
    const API_BASE_URL = 'https://devoutly-pragmatic-louse.cloudpub.ru:443';
    const API_KEY = 'your-super-secret-and-long-api-key-12345';
    const tg = window.Telegram.WebApp;

    // --- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
    let cart = {};
    let allProducts = [];
    let deliveryPoints = [];
    let activeOrder = null;
    let userProfile = null;
    let orderHistory = [];
    let toastTimer = null;
    let currentCategory = 'Все';
    let isEditingComposition = false;
    let unreadSupportMessages = 0; // <-- Переменная для локального счетчика

    // --- WEBSOCKET ДЛЯ ЧАТА ---
    let ws = null;
    let userId = null;

    // ПАГИНАЦИЯ
    let currentHistoryOffset = 0;
    let totalHistoryCount = 0;
    let isHistoryLoading = false;
    const HISTORY_PAGE_SIZE = 5;

    // --- Смайлики для категорий ---
    const categoryEmojis = {
        'Ягоды': '🍓',
        'Рыба': '🟠',
        'Фрукты': '🍑',
        'Прочее': '🛒'
    };

    // --- ПОЛУЧЕНИЕ ЭЛЕМЕНТОВ DOM ---
    const appContainer = document.getElementById('app-container');
    const views = document.querySelectorAll('.view');
    const navLinks = document.querySelectorAll('.nav-link');
    const profileNavLink = document.getElementById('profile-nav-link');
    const productsGrid = document.getElementById('products-grid');
    const productLoader = document.getElementById('product-loader');
    const cartBadge = document.getElementById('cart-badge');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartSummary = document.getElementById('cart-summary');
    const subtotalPriceEl = document.getElementById('subtotal-price');
    const discountRowEl = document.getElementById('discount-row');
    const discountAmountEl = document.getElementById('discount-amount');
    const finalPriceEl = document.getElementById('final-price');
    const checkoutBtn = document.getElementById('checkout-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const orderModal = document.getElementById('order-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const deliveryOptions = document.getElementById('delivery-options');
    const phoneInput = document.getElementById('phone-number');
    const submitOrderBtn = document.getElementById('submit-order-btn');
    const modalError = document.getElementById('modal-error');
    const modalTitle = document.getElementById('modal-title');
    const activeOrderContainer = document.getElementById('active-order-container');
    const orderHistoryContainer = document.getElementById('order-history-container');
    const toastNotification = document.getElementById('toast-notification');
    const confettiContainer = document.getElementById('confetti-container');
    const orderAnimationContainer = document.getElementById('order-animation-container');
    const orderContentContainer = document.getElementById('order-content-container');
    const categoryPillsContainer = document.getElementById('category-pills-container');
    const showAllHistoryBtn = document.getElementById('show-all-history-btn');
    const historyDetailModal = document.getElementById('history-detail-modal');
    const closeHistoryModalBtn = document.getElementById('close-history-modal-btn');
    const historyModalOrderId = document.getElementById('history-modal-order-id');
    const historyModalCollage = document.getElementById('history-modal-collage-container');
    const historyModalInfo = document.getElementById('history-modal-info');
    const historyModalProductsList = document.getElementById('history-modal-products-list');
    const activeOrderDetailModal = document.getElementById('active-order-detail-modal');
    const closeActiveOrderModalBtn = document.getElementById('close-active-order-modal-btn');
    const activeOrderModalProductsList = document.getElementById('active-order-modal-products-list');
    const supportChatBtn = document.getElementById('support-chat-btn');
    const supportChatOverlay = document.getElementById('support-chat-overlay');
    const closeChatBtn = document.getElementById('close-chat-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatFaqButtons = document.getElementById('chat-faq-buttons');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const supportBadge = document.getElementById('support-badge');


    // --- ОСНОВНЫЕ ФУНКЦИИ ---
    const navigateTo = (viewId) => {
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId)?.classList.remove('hidden');
        navLinks.forEach(link => link.classList.toggle('active', link.dataset.view === viewId));
    };

    const updateCartBadge = () => {
        const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
        cartBadge.textContent = totalItems;
        cartBadge.classList.toggle('hidden', totalItems === 0);
    };

    const updateSupportBadge = (count) => {
        const countNum = parseInt(count, 10);
        if (isNaN(countNum) || countNum <= 0) {
            supportBadge.classList.add('hidden');
            supportBadge.textContent = '0';
        } else {
            supportBadge.textContent = countNum;
            supportBadge.classList.remove('hidden');
        }
    };

    const showErrorPopup = (message) => tg.showAlert(message);

    const showToast = (message) => {
        if (toastTimer) clearTimeout(toastTimer);
        toastNotification.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        toastNotification.classList.add('show');
        toastTimer = setTimeout(() => {
            toastNotification.classList.remove('show');
            toastNotification.classList.add('hide');
            setTimeout(() => { toastNotification.classList.remove('hide'); toastTimer = null; }, 400);
        }, 2000);
    };

    const createConfetti = () => {
        const colors = ['#e53935', '#ff7043', '#2e7d32', '#fdd835', '#1e88e5'];
        const confettiEl = document.createElement('div');
        confettiEl.classList.add('confetti');
        confettiEl.style.left = `${Math.random() * 100}%`;
        confettiEl.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confettiEl.style.animationDuration = `${Math.random() * 2 + 1}s`;
        confettiEl.style.width = `${Math.random() * 8 + 6}px`;
        confettiEl.style.height = confettiEl.style.width;
        confettiContainer.appendChild(confettiEl);
        setTimeout(() => confettiEl.remove(), 3000);
    };

    const playSuccessAnimation = (newOrder) => {
        return new Promise(resolve => {
            orderAnimationContainer.classList.remove('hidden');
            orderContentContainer.classList.add('hidden');
            tg.HapticFeedback.notificationOccurred('success');
            confettiContainer.innerHTML = '';
            for (let i = 0; i < 50; i++) setTimeout(createConfetti, i * 20);

            setTimeout(() => {
                orderAnimationContainer.classList.add('hidden');
                orderContentContainer.classList.remove('hidden');
                renderActiveOrder(newOrder);
                resolve();
            }, 4000);
        });
    };

    const loadMoreHistory = async () => {
        if (isHistoryLoading || (currentHistoryOffset > 0 && orderHistory.length >= totalHistoryCount)) {
            return;
        }

        isHistoryLoading = true;
        showAllHistoryBtn.disabled = true;
        showAllHistoryBtn.textContent = 'Загрузка...';

        try {
            const historyData = await fetchData(`/api/user/orders/history?offset=${currentHistoryOffset}&limit=${HISTORY_PAGE_SIZE}`);

            totalHistoryCount = historyData.total_count;
            const newOrdersStubs = historyData.history || [];

            if (newOrdersStubs.length > 0) {
                const enrichedOrders = [];
                for (const orderStub of newOrdersStubs) {
                    const fullOrderData = await fetchData(`/api/user/orders/${orderStub.id}`);
                    enrichedOrders.push(await getFullOrderDetails(fullOrderData.order_details));
                }
                orderHistory.push(...enrichedOrders);
                currentHistoryOffset += HISTORY_PAGE_SIZE;
            }

            renderOrderHistory();

        } catch (e) {
            showErrorPopup("Не удалось загрузить историю заказов.");
            renderOrderHistory();
        } finally {
            isHistoryLoading = false;
            showAllHistoryBtn.disabled = false;
        }
    };


    // --- РЕНДЕР ФУНКЦИИ ---

    // --- НАЧАЛО БЛОКА ИЗМЕНЕНИЙ ---
    const formatWeight = (weightStr) => {
        if (!weightStr) return '';

        // Новая проверка: если в строке уже есть буквы (например, "1 л" или "5 шт"),
        // то выводим ее как есть, ничего не добавляя.
        if (/[а-яА-Яa-zA-Z]/.test(weightStr)) {
            return weightStr;
        }

        // Старая логика для диапазонов веса (например, "500/600")
        if (weightStr.includes('/')) {
            const parts = weightStr.split('/');
            const unit = weightStr.includes('.') ? 'кг' : 'г';
            return `~ ${parts[0]}-${parts[1]} ${unit}`;
        }

        // Старая логика для простого веса (например, "700" или "1.2")
        const unit = weightStr.includes('.') ? 'кг' : 'г';
        return `${weightStr} ${unit}`;
    };
    // --- КОНЕЦ БЛОКА ИЗМЕНЕНИЙ ---

    const renderCategories = () => {
        const categories = ['Все', ...new Set(allProducts.map(p => p.category))];
        categoryPillsContainer.innerHTML = categories.map(cat => {
            const emoji = categoryEmojis[cat] || '🛒';
            const text = cat === 'Все' ? cat : `${emoji} ${cat}`;
            return `<button class="pill ${cat === currentCategory ? 'active' : ''}" data-category="${cat}">${text}</button>`;
        }).join('');
    };

    const renderProducts = () => {
        const filteredProducts = currentCategory === 'Все'
            ? allProducts
            : allProducts.filter(p => p.category === currentCategory);

        if (filteredProducts.length === 0) {
            productsGrid.innerHTML = `<p class="empty-cart">В этой категории пока нет товаров.</p>`;
            return;
        }

        productsGrid.innerHTML = filteredProducts.map(product => {
            const imageUrl = product.photo_url ? `${API_BASE_URL}${product.photo_url}` : '';
            const imageElement = imageUrl ? `<img src="${imageUrl}" alt="${product.name}" class="product-image">` : '<div class="product-image-placeholder">Фото нет</div>';

            const shouldDisableButton = activeOrder && !isEditingComposition;

            const buttonHtml = shouldDisableButton
                ? `<button class="btn-primary btn-disabled view-active-order-btn">У вас есть заказ</button>`
                : `<button class="btn-primary add-to-cart-btn" data-id="${product.id}" data-name="${product.name}">В корзину</button>`;
            const weightHtml = product.weight_display ? `<span class="weight">${formatWeight(product.weight_display)}</span>` : '';

            /* --- ИЗМЕНЕНИЕ: Структура HTML карточки товара --- */
            // Блок .product-actions вынесен из .product-info, чтобы кнопка всегда была внизу карточки при вертикальном отображении.
            return `
                <div class="product-card">
                    <div class="product-image-container">${imageElement}</div>
                    <div class="product-info">
                        <h3>${product.name}</h3>
                        <span class="price">${product.price} руб.</span>
                        ${weightHtml}
                    </div>
                    <div class="product-actions">${buttonHtml}</div>
                </div>`;
            /* --- КОНЕЦ ИЗМЕНЕНИЯ --- */
        }).join('');
    };

    const renderCart = () => {
        cartItemsContainer.innerHTML = '';
        if (Object.keys(cart).length === 0) {
            cartItemsContainer.innerHTML = '<p class="empty-cart">Пока пусто. Добавьте вкусности из каталога.</p>';
            cartSummary.classList.add('hidden');
            return;
        }

        if (isEditingComposition) {
            checkoutBtn.textContent = 'Сохранить заказ';
            cancelEditBtn.classList.remove('hidden');
        } else {
            checkoutBtn.textContent = 'Оформить заказ';
            cancelEditBtn.classList.add('hidden');
        }

        let subtotalPrice = 0;
        Object.entries(cart).forEach(([productId, quantity]) => {
            const product = allProducts.find(p => p.id == productId);
            if (!product) return;
            subtotalPrice += product.price * quantity;
            const imageUrl = product.photo_url ? `${API_BASE_URL}${product.photo_url}` : '';
            const imageElement = imageUrl ? `<img src="${imageUrl}" alt="${product.name}" class="product-image">` : '<div class="product-image-placeholder"></div>';
            const item = document.createElement('div');
            item.className = 'cart-item card';
            item.innerHTML = `
                ${imageElement}
                <div class="cart-item-info">
                    <h4>${product.name}</h4>
                    <span>${product.price} руб.</span>
                </div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" data-id="${productId}" data-action="decrease">-</button>
                    <span>${quantity}</span>
                    <button class="quantity-btn" data-id="${productId}" data-action="increase">+</button>
                </div>`;
            cartItemsContainer.appendChild(item);
        });

        const discountPercent = userProfile?.status_system?.[userProfile.status]?.discount || 0;
        let finalPrice = subtotalPrice;
        if (discountPercent > 0) {
            const discountAmount = Math.round(subtotalPrice * (discountPercent / 100));
            finalPrice -= discountAmount;
            subtotalPriceEl.textContent = `${subtotalPrice} руб.`;
            subtotalPriceEl.classList.add('has-discount');
            discountAmountEl.textContent = `- ${discountAmount} руб.`;
            discountRowEl.style.display = 'flex';
        } else {
            subtotalPriceEl.textContent = `${subtotalPrice} руб.`;
            subtotalPriceEl.classList.remove('has-discount');
            discountRowEl.style.display = 'none';
        }
        finalPriceEl.textContent = `${finalPrice} руб.`;
        cartSummary.classList.remove('hidden');
    };

    const renderOrderHistory = () => {
        if (orderHistory.length === 0) {
            orderHistoryContainer.innerHTML = '<p class="empty-cart">История заказов пока пуста.</p>';
            showAllHistoryBtn.classList.add('hidden');
            return;
        }

        orderHistoryContainer.innerHTML = orderHistory.map(order => {
            const collageImages = (order.products || []).slice(0, 4).map(p => {
                const imageUrl = p.photo_url ? `${API_BASE_URL}${p.photo_url}` : '';
                return imageUrl ? `<img src="${imageUrl}" alt="">` : '';
            }).join('');

            return `
                <div class="history-item" data-order-id="${order.id}">
                    <div class="history-item-collage">${collageImages}</div>
                    <div class="history-item-info">
                        <span class="history-date">Заказ от ${new Date(order.created_at).toLocaleDateString()}</span>
                        <span class="history-status status-${order.status}">${order.status === 'completed' ? 'Выполнен' : 'Отменен'}</span>
                    </div>
                    <span class="history-item-price">${order.final_price} руб.</span>
                </div>
            `;
        }).join('');

        if (orderHistory.length < totalHistoryCount) {
            showAllHistoryBtn.classList.remove('hidden');
            showAllHistoryBtn.textContent = `Показать еще`;
        } else {
            showAllHistoryBtn.classList.add('hidden');
        }
    };

    const renderLoyalty = (profile) => {
        userProfile = profile;
        const { status_system = {}, status = 'standard', done_deals = 0 } = profile;
        const currentStatusInfo = status_system[status] || { discount: 0, threshold: 0 };
        document.getElementById('user-status').textContent = status.charAt(0).toUpperCase() + status.slice(1);
        document.getElementById('user-discount').textContent = `${currentStatusInfo.discount}% скидка`;

        const statusOrder = ['standard', 'silver', 'gold', 'platinum'];
        const currentStatusIndex = statusOrder.indexOf(status);
        let progressPercent = 0;
        let hintText = "Вы достигли максимального статуса!";

        if (currentStatusIndex < statusOrder.length - 1) {
            const nextStatus = statusOrder[currentStatusIndex + 1];
            const nextStatusInfo = status_system[nextStatus];
            if (nextStatusInfo) {
                const prevThreshold = currentStatusInfo.threshold || 0;
                const { threshold: nextThreshold, discount: nextDiscount } = nextStatusInfo;
                const dealsNeeded = Math.max(0, nextThreshold - done_deals);
                const range = nextThreshold - prevThreshold;
                if (range > 0) progressPercent = Math.min(100, ((done_deals - prevThreshold) / range) * 100);
                hintText = `До статуса ${nextStatus} (${nextDiscount}%) осталось ${dealsNeeded} покупок.`;
            }
        } else {
            progressPercent = 100;
        }
        document.getElementById('loyalty-progress').style.width = `${progressPercent}%`;
        document.getElementById('loyalty-hint').textContent = hintText;
    };

    const renderActiveOrder = (order) => {
        activeOrder = order;
        if (order) {
            const deliveryMethod = order['Способ получения'];

            orderContentContainer.innerHTML = `
                <p>Покажите этот QR-код на пункте выдачи.</p>
                <div class="qr-code-wrapper" id="qrcode-placeholder">
                    <i class="fas fa-question-circle" id="show-active-order-details-btn"></i>
                </div>
                <h2>Заказ #${String(order['№ заказа']).padStart(4, '0')}</h2>
                <p class="order-details-small">
                    ${deliveryMethod}<br>
                    <strong>Телефон:</strong> ${order['Номер телефона']}<br>
                    <strong>Итого: ${order.final_price} руб.</strong>
                </p>
                <div class="active-order-actions" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                    <button class="btn-secondary" id="edit-order-composition-btn">Изменить состав</button>
                    <button class="btn-secondary" id="edit-order-delivery-btn">Изменить пункт</button>
                </div>
                 <button class="btn-danger" id="cancel-order-btn" style="margin-top: 10px;">Отменить заказ</button>
                `;
            new QRCode(document.getElementById('qrcode-placeholder'), { text: String(order['№ заказа']).padStart(4, '0'), width: 180, height: 180 });
        } else {
            orderContentContainer.innerHTML = '<p class="empty-cart">У вас нет активных заказов.</p>';
        }
    };

    // --- ЛОГИКА API ---
    async function fetchData(endpoint, options = {}) {
        const headers = { 'X-API-Key': API_KEY, ...options.headers };
        if (tg.initData) headers['X-Telegram-Init-Data'] = tg.initData;
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ detail: `HTTP error! status: ${response.status}` }));
            throw new Error(errorBody.detail || `Ошибка сети при запросе ${endpoint}`);
        }
        return response.json();
    }

    async function getFullOrderDetails(order) {
        if (!order || !order['Позиции']) {
            return { ...order, products: [] };
        }
        const productDetails = Object.entries(order['Позиции']).map(([productName, orderItem]) => {
            let productInfo = allProducts.find(p => p.name === productName);
            if (!productInfo) {
                productInfo = { id: null, name: productName, photo_url: null, weight_display: null };
            }
            return { ...productInfo, quantity: orderItem.quantity, price: orderItem.price };
        });
        return { ...order, products: productDetails };
    }

    async function initializeAndFetch() {
        const minAnimationDelay = new Promise(resolve => setTimeout(resolve, 2000));
        try {
            const fetchDataPromise = (async () => {
                const [statusData, productsData, pointsData, profileData, activeOrderData] = await Promise.all([
                    fetchData('/api/status'),
                    fetchData('/api/products'),
                    fetchData('/api/delivery-points'),
                    fetchData('/api/user/profile'),
                    fetchData('/api/user/orders/active'),
                ]);

                allProducts = productsData.products || [];
                orderHistory = [];
                currentHistoryOffset = 0;
                totalHistoryCount = 0;

                return { statusData, productsData, pointsData, profileData, activeOrderData };
            })();

            const [{ statusData, pointsData, profileData, activeOrderData }] = await Promise.all([fetchDataPromise, minAnimationDelay]);

            deliveryPoints = pointsData.delivery_points;
            activeOrder = activeOrderData.order ? await getFullOrderDetails(activeOrderData.order) : null;

            renderLoyalty(profileData.profile);

            // <-- ИЗМЕНЕНИЕ: Инициализируем счетчик при первой загрузке
            unreadSupportMessages = profileData.profile.unread_messages || 0;
            updateSupportBadge(unreadSupportMessages);

            renderActiveOrder(activeOrder);
            renderCategories();
            renderProducts();

            await loadMoreHistory();

            const statusBadge = document.getElementById('status-badge');
            statusBadge.textContent = statusData.is_open ? '✅ Прием заявок ОТКРЫТ' : '❌ Прием заявок ЗАКРЫТ';
            statusBadge.className = statusData.is_open ? 'open' : 'closed';
            if (!statusData.is_open) productsGrid.innerHTML = '<p class="empty-cart">Магазин закрыт.</p>';

        } catch (err) {
            showErrorPopup(err.message);
            productsGrid.innerHTML = '<p class="error">Не удалось загрузить товары. Попробуйте перезапустить приложение.</p>';
        } finally {
            productLoader.classList.add('hidden');
        }
    }

    async function loadProfileData() {
        if (isEditingComposition) return;
        if (!tg.initData) return;
        try {
            const [profileData, activeOrderData] = await Promise.all([
                fetchData('/api/user/profile'),
                fetchData('/api/user/orders/active'),
            ]);

            orderHistory = [];
            currentHistoryOffset = 0;
            totalHistoryCount = 0;

            await loadMoreHistory();

            activeOrder = activeOrderData.order ? await getFullOrderDetails(activeOrderData.order) : null;

            profileNavLink.classList.remove('hidden');
            renderProducts();
            renderLoyalty(profileData.profile);

            // <-- ИЗМЕНЕНИЕ: Инициализируем счетчик при переключении на профиль
            unreadSupportMessages = profileData.profile.unread_messages || 0;
            updateSupportBadge(unreadSupportMessages);

            renderActiveOrder(activeOrder);
        } catch (err) { showErrorPopup(err.message); }
    }

    async function submitOrder(editMode = 'none') {
        if (!phoneInput.value) { modalError.textContent = 'Пожалуйста, введите номер телефона.'; return; }
        if (Object.keys(cart).length === 0 && editMode !== 'delivery') {
            modalError.textContent = 'Ваша корзина пуста.';
            return;
        }
        if (!tg.initData) { modalError.textContent = 'Ошибка: приложение запущено не внутри Telegram.'; return; }

        let payload = {
            phone_number: phoneInput.value,
            products: Object.entries(cart).map(([productId, quantity]) => ({
                product_id: parseInt(productId),
                quantity,
                price: allProducts.find(p => p.id == productId)?.price || 0
            })),
            delivery_point_id: null,
            delivery_address: null
        };

        if (editMode === 'delivery' && activeOrder) {
            payload.products = (activeOrder.products || []).map(p => ({
                product_id: p.id,
                quantity: p.quantity,
                price: p.price
            }));
        }

        payload.delivery_point_id = parseInt(deliveryOptions.value);

        submitOrderBtn.disabled = true;
        submitOrderBtn.textContent = 'Отправка...';

        try {
            const response = await fetchData('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const newOrderDetails = await getFullOrderDetails(response.order_details);

            orderModal.classList.add('hidden');
            isEditingComposition = false;
            profileNavLink.classList.remove('hidden');
            cart = {};
            updateCartBadge();
            renderCart();
            navigateTo('profile-view');
            await playSuccessAnimation(newOrderDetails);

            if (!isEditingComposition) {
                await loadProfileData();
            }

        } catch (error) {
            modalError.textContent = error.message;
        } finally {
            submitOrderBtn.disabled = false;
            submitOrderBtn.textContent = editMode === 'none' ? 'Подтвердить заказ' : 'Сохранить изменения';
        }
    }


    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (isEditingComposition && link.dataset.view === 'profile-view') {
                return;
            }
            const viewId = link.dataset.view;

            if (isEditingComposition && viewId === 'catalog-view') {
                renderProducts();
                navigateTo('catalog-view');
                return;
            }

            if (viewId === 'cart-view') renderCart();
            if (viewId === 'profile-view' && !isEditingComposition) {
                 loadProfileData();
            }
            navigateTo(viewId);
        });
    });

    productsGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-to-cart-btn');
        if (btn) {
            const productId = btn.dataset.id;
            const productName = btn.dataset.name;
            cart[productId] = (cart[productId] || 0) + 1;
            updateCartBadge();
            tg.HapticFeedback.notificationOccurred('success');
            showToast(`"${productName}" добавлен в корзину`);
        }
        if (e.target.closest('.view-active-order-btn')) {
            tg.showAlert("У вас уже есть активный заказ. Чтобы создать новый, отмените его. Чтобы изменить - воспользуйтесь кнопками 'Изменить состав' или 'Изменить пункт'.");
            navigateTo('profile-view');
        }
    });

    categoryPillsContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (pill) {
            currentCategory = pill.dataset.category;
            renderCategories();
            renderProducts();
        }
    });

    orderHistoryContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.history-item');
        if (item) {
            const orderId = item.dataset.orderId;
            const order = orderHistory.find(o => o.id == orderId);
            if (order) {
                historyModalOrderId.textContent = `#${String(order.id).padStart(4, '0')}`;
                const images = (order.products || []).map(p => p.photo_url ? `${API_BASE_URL}${p.photo_url}` : null).filter(Boolean);
                historyModalCollage.innerHTML = images.slice(0, 4).map(src => `<img src="${src}" alt="">`).join('');
                historyModalCollage.dataset.count = Math.min(images.length, 4);
                historyModalInfo.innerHTML = `<b>Дата:</b> ${new Date(order.created_at).toLocaleString()}<br><b>Статус:</b> <span class="status-${order.status}">${order.status === 'completed' ? 'Выполнен' : 'Отменен'}</span><br><b>Получение:</b> ${order['Способ получения']}<br><strong>Итого: ${order.final_price} руб.</strong>`;
                historyModalProductsList.innerHTML = (order.products || []).map(p => `<div class="cart-item"><img src="${p.photo_url ? `${API_BASE_URL}${p.photo_url}` : ''}" alt="${p.name}" class="product-image" style="width: 50px; height: 50px; border-radius: 8px;"><div class="cart-item-info"><h4>${p.name}</h4><span>${p.quantity} шт. &times; ${p.price} руб.</span>${p.weight_display ? `<div class="weight" style="margin-top: 5px;">${formatWeight(p.weight_display)}</div>` : ''}</div></div>`).join('');
                historyDetailModal.classList.remove('hidden');
            }
        }
    });

    closeHistoryModalBtn.addEventListener('click', () => historyDetailModal.classList.add('hidden'));
    closeActiveOrderModalBtn.addEventListener('click', () => activeOrderDetailModal.classList.add('hidden'));

    showAllHistoryBtn.addEventListener('click', loadMoreHistory);

    cartItemsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.quantity-btn')) {
            const { id, action } = e.target.dataset;
            cart[id] = (cart[id] || 0) + (action === 'increase' ? 1 : -1);
            if (cart[id] <= 0) delete cart[id];
            updateCartBadge();
            renderCart();
        }
    });

    const openOrderModal = (editMode = 'none') => {
        modalError.textContent = '';
        deliveryOptions.parentElement.style.display = 'block';

        if (editMode === 'composition' || editMode === 'delivery') {
             modalTitle.textContent = editMode === 'composition' ? 'Подтверждение изменений' : 'Изменение пункта выдачи';
             submitOrderBtn.textContent = 'Сохранить изменения';
             submitOrderBtn.onclick = () => submitOrder(editMode);
             phoneInput.value = activeOrder['Номер телефона'];
             // --- НАЧАЛО ИЗМЕНЕНИЙ ---
             // Теперь deliveryPoints - это массив объектов, а не строк
             deliveryOptions.innerHTML = deliveryPoints.map(point =>
                 `<option value="${point.id}">${point.name}</option>`
             ).join('');
             // --- КОНЕЦ ИЗМЕНЕНИЙ ---
             if(activeOrder.delivery_point_id) {
                 deliveryOptions.value = activeOrder.delivery_point_id;
             }
        } else {
            modalTitle.textContent = 'Оформление заказа';
            submitOrderBtn.textContent = 'Подтвердить заказ';
            submitOrderBtn.onclick = () => submitOrder('none');
            // --- НАЧАЛО ИЗМЕНЕНИЙ ---
            // Теперь deliveryPoints - это массив объектов, а не строк
            deliveryOptions.innerHTML = deliveryPoints.map(point =>
                `<option value="${point.id}">${point.name}</option>`
            ).join('');
            // --- КОНЕЦ ИЗМЕНЕНИЙ ---
            phoneInput.value = userProfile?.phone_number || '';
        }
        orderModal.classList.remove('hidden');
    };

    checkoutBtn.addEventListener('click', () => {
        if (isEditingComposition) {
            openOrderModal('composition');
        } else if (activeOrder && !isEditingComposition) {
            tg.showAlert("У вас уже есть активный заказ. Вы не можете оформить новый.");
            navigateTo('profile-view');
        } else {
            openOrderModal('none');
        }
    });

    cancelEditBtn.addEventListener('click', () => {
        tg.showConfirm("Вы уверены, что хотите отменить редактирование? Все изменения в корзине будут сброшены.", (confirmed) => {
            if (confirmed) {
                isEditingComposition = false;
                profileNavLink.classList.remove('hidden');
                cart = {};
                updateCartBadge();
                renderProducts();
                navigateTo('profile-view');
                showToast("Редактирование отменено.");
            }
        });
    });

    closeModalBtn.addEventListener('click', () => orderModal.classList.add('hidden'));

    document.body.addEventListener('click', async (e) => {
        if (e.target.id === 'edit-order-composition-btn') {
            if (!activeOrder) return;
            isEditingComposition = true;
            profileNavLink.classList.add('hidden');
            cart = {};
            (activeOrder.products || []).forEach(p => {
                if (p.id) cart[p.id] = p.quantity;
            });
            updateCartBadge();
            renderProducts();
            navigateTo('catalog-view');
            showToast("Редактирование заказа. Измените состав и сохраните в корзине.");
        }

        if (e.target.id === 'edit-order-delivery-btn') {
            if (!activeOrder) return;
            openOrderModal('delivery');
        }

        if (e.target.id === 'show-active-order-details-btn') {
            if (activeOrder && activeOrder.products) {
                activeOrderModalProductsList.innerHTML = (activeOrder.products || []).map(p =>
                    `<div class="cart-item">
                        <img src="${p.photo_url ? `${API_BASE_URL}${p.photo_url}` : ''}" alt="${p.name}" class="product-image" style="width: 50px; height: 50px; border-radius: 8px;">
                        <div class="cart-item-info">
                            <h4>${p.name}</h4>
                            <span>${p.quantity} шт. &times; ${p.price} руб.</span>
                            ${p.weight_display ? `<div class="weight" style="margin-top: 5px;">${formatWeight(p.weight_display)}</div>` : ''}
                        </div>
                    </div>`
                ).join('');
                activeOrderDetailModal.classList.remove('hidden');
            } else {
                showErrorPopup("Не удалось загрузить состав заказа.");
            }
        }

        if (e.target.id === 'cancel-order-btn') {
            tg.showConfirm("Вы уверены, что хотите отменить заказ?", async (confirmed) => {
                if (confirmed) {
                    try {
                        await fetchData('/api/orders/active', { method: 'DELETE' });
                        showToast("Заказ успешно отменен.");
                        isEditingComposition = false;
                        profileNavLink.classList.remove('hidden');
                        await loadProfileData();
                        renderCategories();
                        renderProducts();
                    } catch (err) {
                        showErrorPopup(err.message);
                    }
                }
            });
        }
    });

    let touchStartX = 0, touchEndX = 0, touchStartY = 0, touchEndY = 0;
    const catalogView = document.getElementById('catalog-view');
    catalogView.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });
    catalogView.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    });

    function handleSwipe() {
        if (catalogView.classList.contains('hidden')) return;
        const swipeThreshold = 50;
        const swipeAngleThreshold = 30;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const angle = Math.abs(Math.atan2(deltaY, deltaX) * 180 / Math.PI);
        if (angle > swipeAngleThreshold && angle < (180 - swipeAngleThreshold)) return;
        const categories = ['Все', ...new Set(allProducts.map(p => p.category))];
        const currentIndex = categories.indexOf(currentCategory);
        if (deltaX < -swipeThreshold && currentIndex < categories.length - 1) {
            currentCategory = categories[currentIndex + 1];
            tg.HapticFeedback.impactOccurred('light');
            renderCategories();
            renderProducts();
        }
        if (deltaX > swipeThreshold && currentIndex > 0) {
            currentCategory = categories[currentIndex - 1];
            tg.HapticFeedback.impactOccurred('light');
            renderCategories();
            renderProducts();
        }
    }

    const connectWebSocket = () => {
        try {
            const initData = new URLSearchParams(tg.initData);
            const userData = JSON.parse(initData.get('user'));
            if (!userData || !userData.id) {
                console.error("Не удалось получить ID пользователя из InitData");
                return;
            }
            userId = userData.id;
        } catch (e) {
            console.error("Ошибка парсинга InitData:", e);
            if (!userId) userId = '12345_test';
        }

        const wsUrl = API_BASE_URL.replace('https', 'wss').replace('http', 'ws') + `/ws/${userId}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WS] Соединение установлено');
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('[WS] Получено сообщение:', message);

            if (message.sender_type === 'admin' || message.sender_type === 'bot') {
                if (supportChatOverlay.classList.contains('hidden')) {
                    unreadSupportMessages++;
                    updateSupportBadge(unreadSupportMessages);
                    tg.HapticFeedback.notificationOccurred('success');
                } else {
                    sendWsMessage('mark_as_read', { user_id: userId, reader_type: 'user' });
                }
            }

            if (!supportChatOverlay.classList.contains('hidden')) {
                addChatMessage(message.text, message.sender_type);
            }
        };

        ws.onclose = () => {
            console.log('[WS] Соединение закрыто. Попытка переподключения через 3 секунды...');
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
            console.error('[WS] Произошла ошибка:', error);
            ws.close();
        };
    };

    const sendWsMessage = (type, payload) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({ type, ...payload });
            ws.send(message);
        } else {
            console.error('[WS] Соединение не готово для отправки сообщения.');
            addChatMessage("Ошибка отправки. Проверьте интернет-соединение.", 'bot');
        }
    };

    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast('6.1')) { tg.disableVerticalSwipes(); }
    tg.setHeaderColor('#f4f4f9');
    tg.onEvent('viewportChanged', () => { if (!tg.isExpanded) { tg.expand(); } });
    navigateTo('catalog-view');
    initializeAndFetch();

    const operatorAvatarSvg = `
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="18" fill="#E0E0E0"/>
        <path d="M12 29C12 24.0294 16.0294 20 21 20C25.9706 20 30 24.0294 30 29" stroke="#BDBDBD" stroke-width="2"/>
        <circle cx="21" cy="15" r="5" fill="#BDBDBD"/>
        <path d="M12 18C9.23858 18 7 20.2386 7 23V25C7 27.7614 9.23858 30 12 30" stroke="#757575" stroke-width="2" stroke-linecap="round"/>
        <circle cx="7" cy="23" r="2" fill="#757575"/>
    </svg>`;

    const addChatMessage = (text, type = 'bot') => {
        const messageEl = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        if (type === 'bot' || type === 'admin') {
            const container = document.createElement('div');
            container.classList.add('bot-message-container');

            const avatarEl = document.createElement('div');
            avatarEl.classList.add('bot-avatar');
            avatarEl.innerHTML = operatorAvatarSvg;

            messageEl.classList.add('chat-message', 'bot-message');
            messageEl.innerHTML = `${text}<span class="chat-timestamp">${timestamp}</span>`;

            container.appendChild(avatarEl);
            container.appendChild(messageEl);
            chatMessages.appendChild(container);
        } else { // 'user'
            messageEl.classList.add('chat-message', 'user-message');
            messageEl.innerHTML = `${text}<span class="chat-timestamp">${timestamp}</span>`;
            chatMessages.appendChild(messageEl);
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    const openSupportChat = async () => {
        chatMessages.innerHTML = '<div class="chat-loader">Загрузка истории...</div>';
        chatFaqButtons.innerHTML = '';
        chatInput.value = '';
        supportChatOverlay.classList.remove('hidden');
        tg.HapticFeedback.impactOccurred('light');

        try {
            const historyData = await fetchData(`/api/admin/chats/${userId}`);
            chatMessages.innerHTML = '';

            if (historyData.messages && historyData.messages.length > 0) {
                historyData.messages.forEach(msg => addChatMessage(msg.text, msg.sender_type));
            } else {
                addChatMessage('Здравствуйте! Чем могу помочь?');
            }

            // <-- ИЗМЕНЕНИЕ: Сбрасываем счетчик при открытии
            unreadSupportMessages = 0;
            updateSupportBadge(unreadSupportMessages);
            sendWsMessage('mark_as_read', { user_id: userId, reader_type: 'user' });

        } catch (e) {
            chatMessages.innerHTML = '';
            addChatMessage('Не удалось загрузить историю чата. Попробуйте позже.');
            console.error("Ошибка загрузки истории чата:", e);
        }
    };

    const closeSupportChat = () => {
        supportChatOverlay.classList.add('hidden');
    };

    const sendMessageFromInput = () => {
        const text = chatInput.value.trim();
        if (text === '') return;
        sendWsMessage('user_message', { text: text });
        chatInput.value = '';
    };

    supportChatBtn.addEventListener('click', openSupportChat);
    closeChatBtn.addEventListener('click', closeSupportChat);
    chatSendBtn.addEventListener('click', sendMessageFromInput);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessageFromInput();
        }
    });

    supportChatOverlay.addEventListener('click', (e) => {
        if (e.target === supportChatOverlay) {
            closeSupportChat();
        }
    });

    connectWebSocket();
});