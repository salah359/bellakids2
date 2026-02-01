// public/js/app.js
// THE MASTER SCRIPT: Handles Shop, Cart, API, Language, and UI.

const CONFIG = {
    API_URL: '/api/products',
    UPLOAD_PATH: '/uploads/',
    CART_KEY: 'BELLA_KIDS_CART',
    LANG_KEY: 'BELLA_LANGUAGE',
    WHATSAPP_PHONE: '972598439251',
    DELIVERY_FEE: 15
};

let state = {
    products: [],      
    cart: JSON.parse(localStorage.getItem(CONFIG.CART_KEY)) || [],
    lang: localStorage.getItem(CONFIG.LANG_KEY) || 'ar', 
    currentCategory: 'all',
    selectedSize: null,
    selectedColor: null 
};

// Translations
const I18N = {
    "en": {
        "loading": "Loading...", "error": "Error.", "empty": "No items.",
        "currency": "₪", "add_to_cart": "Add to Basket", "out_of_stock": "Sold Out",
        "in_stock": "In Stock", "select_size": "Select size!", "select_color": "Select color!", "cart_empty": "Basket empty",
        "subtotal": "Subtotal", "delivery": "Delivery", "total": "Total Order Amount",
        "whatsapp_intro": "Hello Bella Kids! I would like to place an order for the following items:", 
        "size": "Size", "color": "Color", "qty": "Quantity", "item_code": "Item Code",
        "search_placeholder": "Search...", "sale": "SALE", "off": "OFF"
    },
    "ar": {
        "loading": "جاري التحميل...", "error": "خطأ.", "empty": "لا توجد عناصر.",
        "currency": "₪", "add_to_cart": "أضف للسلة", "out_of_stock": "نفد الكمية",
        "in_stock": "متوفر", "select_size": "اختر المقاس!", "select_color": "اختر اللون!", "cart_empty": "السلة فارغة",
        "subtotal": "المجموع الفرعي", "delivery": "رسوم التوصيل", "total": "إجمالي قيمة الطلب",
        "whatsapp_intro": "مرحباً بيلا كيدز، أود تقديم طلب للمنتجات التالية:", 
        "size": "المقاس", "color": "اللون", "qty": "الكمية", "item_code": "رمز المنتج",
        "search_placeholder": "بحث...", "sale": "خصم", "off": "توفير"
    }
};

function resolveImage(imageInput) {
    if (!imageInput) return 'assets/images/placeholder.png';
    if (imageInput.startsWith('http') || imageInput.startsWith('data:')) return imageInput;
    return CONFIG.UPLOAD_PATH + (imageInput.startsWith('/') ? imageInput.substring(1) : imageInput);
}

document.addEventListener('DOMContentLoaded', () => {
    applyLanguageSettings();
    const path = window.location.pathname;
    if (path.includes('boys')) state.currentCategory = 'boys';
    else if (path.includes('girls')) state.currentCategory = 'girls';
    else if (path.includes('newborn')) state.currentCategory = 'newborn';
    else if (path === '/' || path.includes('index')) {
        state.currentCategory = 'featured';
        initBalloons();
    }
    updateCartCounts();
    renderSidebarCart(); 
    fetchProducts();
    const searchInput = document.getElementById('productSearch');
    if (searchInput) searchInput.addEventListener('keyup', (e) => filterGrid(e.target.value));
    if (typeof AOS !== 'undefined') AOS.init();
});

async function fetchProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return; 
    try {
        const res = await fetch(CONFIG.API_URL);
        state.products = await res.json();
        filterGrid(''); 
    } catch (err) { grid.innerHTML = `<div class="text-center py-5">Error loading</div>`; }
}

function filterGrid(searchTerm) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    const term = searchTerm.toLowerCase();
    const filtered = state.products.filter(p => {
        const matchesCategory = (state.currentCategory === 'all' || state.currentCategory === 'featured') ? true : (p.category && p.category.includes(state.currentCategory));
        const nameMatch = (p.name_en||'').toLowerCase().includes(term) || (p.name_ar||'').toLowerCase().includes(term) || (p.itemId||'').toLowerCase().includes(term);
        return matchesCategory && nameMatch;
    });
    renderProducts(filtered, grid);
}

function renderProducts(products, container) {
    container.innerHTML = '';
    const t = I18N[state.lang];
    if (products.length === 0) { container.innerHTML = `<h3 class="text-center py-5">${t.empty}</h3>`; return; }

    products.forEach(p => {
        const name = state.lang === 'ar' ? (p.name_ar || p.name) : (p.name_en || p.name);
        const imageSrc = resolveImage(p.images && p.images.length > 0 ? p.images[0] : null);
        const isSoldOut = !p.inStock;

        const isSale = p.oldPrice && p.oldPrice > p.price;
        let priceHtml = `<div class="text-primary fw-bold mb-2">${t.currency}${p.price}</div>`;
        let saleBadge = '';

        if (isSale) {
            const percent = Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100);
            priceHtml = `
                <div class="mb-2">
                    <del class="text-muted small">${t.currency}${p.oldPrice}</del>
                    <span class="text-danger fw-bold ms-1">${t.currency}${p.price}</span>
                </div>
            `;
            saleBadge = `<span class="badge bg-danger position-absolute top-0 end-0 m-3 shadow-sm" style="font-size: 11px; padding: 5px 10px; border-radius: 6px;">${t.sale} ${percent}% ${t.off}</span>`;
        }

        const badgeStyle = `position: absolute !important; top: 10px !important; left: 10px !important; right: auto !important; bottom: auto !important; height: auto !important; width: auto !important; font-size: 11px !important; padding: 5px 12px !important; border-radius: 6px !important; z-index: 50 !important; box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;`;
        
        const stockBadge = isSoldOut 
            ? `<span class="badge bg-danger" style="${badgeStyle}">${t.out_of_stock}</span>`
            : `<span class="badge bg-success" style="${badgeStyle}">${t.in_stock}</span>`;

        const btnState = isSoldOut ? 'disabled' : '';
        const btnClass = isSoldOut ? 'btn-secondary' : 'btn-outline-dark';
        const cardOpacity = isSoldOut ? 'opacity: 0.75;' : '';

        container.innerHTML += `
        <div class="col-6 col-md-4 col-lg-3 mb-4" data-aos="fade-up">
            <div class="card product-card h-100 border-0 shadow-sm" style="${cardOpacity}" onclick="openProductModal('${p._id}')">
                <div class="position-relative overflow-hidden ratio ratio-1x1 rounded-3">
                    ${stockBadge}
                    ${saleBadge}
                    <img src="${imageSrc}" class="img-fluid object-fit-cover w-100 h-100">
                </div>
                <div class="card-body text-center p-3">
                    <h6 class="fw-bold text-dark mb-1 text-truncate">${name}</h6>
                    ${priceHtml}
                    <button class="btn ${btnClass} rounded-pill w-100 btn-sm" ${btnState}>${isSoldOut ? t.out_of_stock : t.add_to_cart}</button>
                </div>
            </div>
        </div>`;
    });
}

// 🎡 UPDATED MODAL WITH CAROUSEL SUPPORT
function openProductModal(id) {
    const p = state.products.find(x => x._id === id);
    if (!p) return;
    state.selectedSize = null;
    state.selectedColor = null; 
    const t = I18N[state.lang];
    const name = state.lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar);
    const desc = state.lang === 'ar' ? (p.description_ar || p.description_en) : (p.description_en || p.description_ar);

    // Build Carousel
    const images = (p.images && p.images.length) ? p.images : ['placeholder.png'];
    let carouselItems = images.map((img, idx) => `
        <div class="carousel-item ${idx === 0 ? 'active' : ''}">
            <img src="${resolveImage(img)}" class="d-block w-100 object-fit-cover" style="height: 400px;">
        </div>
    `).join('');

    const carouselHtml = `
        <div id="productCarousel" class="carousel slide" data-bs-ride="carousel">
            <div class="carousel-inner rounded-start">${carouselItems}</div>
            ${images.length > 1 ? `
                <button class="carousel-control-prev" type="button" data-bs-target="#productCarousel" data-bs-slide="prev">
                    <span class="carousel-control-prev-icon bg-dark rounded-circle" aria-hidden="true"></span>
                </button>
                <button class="carousel-control-next" type="button" data-bs-target="#productCarousel" data-bs-slide="next">
                    <span class="carousel-control-next-icon bg-dark rounded-circle" aria-hidden="true"></span>
                </button>
            ` : ''}
        </div>
    `;

    const container = document.getElementById('modalImageContainer');
    if(container) container.innerHTML = carouselHtml;

    document.getElementById('popupName').innerText = name;
    document.getElementById('popupDesc').innerText = desc || '';

    const isSale = p.oldPrice && p.oldPrice > p.price;
    if (isSale) {
        document.getElementById('popupPrice').innerHTML = `<del class="text-muted small">${t.currency}${p.oldPrice}</del> <span class="text-danger fw-bold fs-4">${t.currency}${p.price}</span>`;
    } else {
        document.getElementById('popupPrice').innerText = t.currency + p.price;
    }

    const sizes = (p.sizes && p.sizes.length) ? p.sizes : ['One Size'];
    document.getElementById('sizeSelector').innerHTML = sizes.map(s => 
        `<button class="btn btn-outline-secondary btn-sm m-1" onclick="selectSize(this, '${s}')">${s}</button>`
    ).join('');

    const colors = (p.colors && p.colors.length) ? p.colors : [];
    const colorContainer = document.getElementById('colorSelector');
    if (colorContainer) {
        if (colors.length > 0) {
            colorContainer.parentElement.classList.remove('d-none');
            colorContainer.innerHTML = colors.map(c => 
                `<button class="btn btn-outline-secondary btn-sm m-1" style="background-color: ${c.toLowerCase()};" onclick="selectColor(this, '${c}')">${c}</button>`
            ).join('');
        } else {
            colorContainer.parentElement.classList.add('d-none');
        }
    }

    const btn = document.getElementById('modalAddToCart');
    btn.onclick = () => {
        if(!state.selectedSize) { alert(t.select_size); return; }
        if(colors.length > 0 && !state.selectedColor) { alert(t.select_color); return; }
        addToCart(p, state.selectedSize, state.selectedColor, resolveImage(images[0]));
        bootstrap.Modal.getInstance(document.getElementById('productModal')).hide();
    };

    new bootstrap.Modal(document.getElementById('productModal')).show();
}

function selectSize(el, s) {
    document.querySelectorAll('#sizeSelector .btn').forEach(b => b.classList.replace('btn-dark', 'btn-outline-secondary'));
    el.classList.replace('btn-outline-secondary', 'btn-dark');
    state.selectedSize = s;
}

function selectColor(el, c) {
    document.querySelectorAll('#colorSelector .btn').forEach(b => b.classList.replace('btn-dark', 'btn-outline-secondary'));
    el.classList.replace('btn-outline-secondary', 'btn-dark');
    state.selectedColor = c;
}

function addToCart(p, size, color, img) {
    const name = state.lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar);
    const exist = state.cart.find(x => x.id === p._id && x.size === size && x.color === color);
    if(exist) {
        exist.qty++; 
    } else {
        state.cart.push({ id: p._id, itemId: p.itemId, name, price: p.price, img, size, color, qty: 1 });
    }
    saveCart();
}

function removeFromCart(i) { state.cart.splice(i, 1); saveCart(); }
function saveCart() { localStorage.setItem(CONFIG.CART_KEY, JSON.stringify(state.cart)); updateCartCounts(); renderSidebarCart(); }
function updateCartCounts() { 
    const c = state.cart.reduce((a, b) => a + b.qty, 0); 
    document.querySelectorAll('.cart-count').forEach(e => e.innerText = c); 
}

function renderSidebarCart() {
    const div = document.getElementById('cartItems');
    const totEl = document.getElementById('cartTotal');
    if(!div) return;
    div.innerHTML = '';
    const t = I18N[state.lang];
    let sub = 0;
    if(state.cart.length === 0) { div.innerHTML = `<div class="text-center py-4 text-muted">${t.cart_empty}</div>`; if(totEl) totEl.innerText = t.currency+'0.00'; return; }
    state.cart.forEach((x, i) => {
        sub += x.price * x.qty;
        const meta = x.color ? `${x.size} | ${x.color}` : `${x.size}`;
        div.innerHTML += `
            <div class="d-flex align-items-center mb-3">
                <img src="${x.img}" width="50" height="50" class="rounded object-fit-cover mx-2">
                <div class="flex-grow-1">
                    <div class="fw-bold small">${x.name}</div>
                    <div class="text-muted small">${meta} | ${t.currency}${x.price} x ${x.qty}</div>
                </div>
                <button onclick="removeFromCart(${i})" class="btn btn-sm text-danger">×</button>
            </div>`;
    });
    if(totEl) totEl.innerText = t.currency + (sub + CONFIG.DELIVERY_FEE).toFixed(2);
}

// ⚡ CLEAN WHATSAPP MESSAGE
function sendToWhatsApp() {
    if (state.cart.length === 0) return;
    const t = I18N[state.lang];
    let msg = `*${t.whatsapp_intro}*\n\n`;
    let subtotal = 0;

    state.cart.forEach((item, index) => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        msg += `*${index + 1}. ${item.name}*\n`;
        if(item.itemId) msg += `- ${t.item_code}: ${item.itemId}\n`;
        msg += `- ${t.size}: ${item.size}\n`;
        if(item.color) msg += `- ${t.color}: ${item.color}\n`;
        msg += `- ${t.qty}: ${item.qty}\n`;
        msg += `- Price: ${t.currency}${item.price} each\n\n`;
    });

    const total = subtotal + CONFIG.DELIVERY_FEE;
    msg += `--------------------------\n`;
    msg += `*${t.subtotal}:* ${t.currency}${subtotal}\n`;
    msg += `*${t.delivery}:* ${t.currency}${CONFIG.DELIVERY_FEE}\n`;
    msg += `*${t.total}: ${t.currency}${total}*\n`;
    msg += `--------------------------\n\n`;
    msg += `Thank you for shopping with Bella Kids!`;

    window.open(`https://wa.me/${CONFIG.WHATSAPP_PHONE}?text=${encodeURIComponent(msg)}`, '_blank');
}

function toggleLanguage() {
    state.lang = state.lang === 'en' ? 'ar' : 'en';
    localStorage.setItem(CONFIG.LANG_KEY, state.lang);
    location.reload();
}

function applyLanguageSettings() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n-key]').forEach(el => {
        const k = el.getAttribute('data-i18n-key');
        if(I18N[state.lang][k]) el.innerText = I18N[state.lang][k];
    });
}

function initBalloons() {
    const container = document.getElementById('balloon-container'); 
    if (!container) return;
    const colors = ['#FFC8DD', '#FFAFCC', '#BDE0FE', '#A2D2FF'];
    for(let i=0; i<15; i++) {
        let b = document.createElement('div');
        b.className = 'balloon';
        b.style.background = colors[Math.floor(Math.random()*colors.length)];
        b.style.left = Math.random()*100 + '%';
        b.style.animationDuration = (Math.random()*5 + 5) + 's';
        b.style.animationDelay = Math.random()*5 + 's';
        container.appendChild(b);
    }
}