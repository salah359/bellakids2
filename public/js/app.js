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
    selectedSize: null 
};

// Translations
const I18N = {
    "en": {
        "loading": "Loading...", "error": "Error.", "empty": "No items.",
        "currency": "₪", "add_to_cart": "Add to Basket", "out_of_stock": "Sold Out",
        "in_stock": "In Stock", "select_size": "Select size!", "cart_empty": "Basket empty",
        "subtotal": "Subtotal", "delivery": "Delivery", "total": "Total",
        "whatsapp_intro": "Hi Bella Kids! I would like to order:", "size": "Size",
        "search_placeholder": "Search...", "sale": "SALE", "off": "OFF"
    },
    "ar": {
        "loading": "جاري التحميل...", "error": "خطأ.", "empty": "لا توجد عناصر.",
        "currency": "₪", "add_to_cart": "أضف للسلة", "out_of_stock": "نفد الكمية",
        "in_stock": "متوفر", "select_size": "اختر المقاس!", "cart_empty": "السلة فارغة",
        "subtotal": "المجموع", "delivery": "التوصيل", "total": "الكلي",
        "whatsapp_intro": "مرحباً بيلا كيدز! أود طلب ما يلي:", "size": "المقاس",
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
        const nameMatch = (p.name_en||'').toLowerCase().includes(term) || (p.name_ar||'').toLowerCase().includes(term);
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

        // --- SALE LOGIC ---
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
            // Sale Badge HTML
            saleBadge = `<span class="badge bg-danger position-absolute top-0 end-0 m-3 shadow-sm" style="font-size: 11px; padding: 5px 10px; border-radius: 6px;">${t.sale} ${percent}% ${t.off}</span>`;
        }

        // --- STOCK BADGE ---
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

// PRODUCT MODAL
function openProductModal(id) {
    const p = state.products.find(x => x._id === id);
    if (!p) return;
    state.selectedSize = null;
    const t = I18N[state.lang];
    const name = state.lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar);
    const desc = state.lang === 'ar' ? (p.description_ar || p.description_en) : (p.description_en || p.description_ar);
    const img = resolveImage(p.images[0]);

    document.getElementById('popupName').innerText = name;
    document.getElementById('popupDesc').innerText = desc || '';
    document.getElementById('popupImage').src = img;

    // Modal Price Logic
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

    const btn = document.getElementById('modalAddToCart');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    if (!p.inStock) {
        newBtn.innerText = t.out_of_stock;
        newBtn.disabled = true;
        newBtn.className = 'btn btn-secondary w-100 rounded-pill py-3 fw-bold';
    } else {
        newBtn.innerText = t.add_to_cart;
        newBtn.disabled = false;
        newBtn.className = 'btn btn-primary w-100 rounded-pill py-3 fw-bold';
        newBtn.onclick = () => {
            if(!state.selectedSize) { alert(t.select_size); return; }
            addToCart(p, state.selectedSize, img);
            createFirework(event.clientX, event.clientY);
            runSmoothFlyAnimation(document.getElementById('popupImage'));
            setTimeout(() => bootstrap.Modal.getInstance(document.getElementById('productModal')).hide(), 400);
        };
    }
    new bootstrap.Modal(document.getElementById('productModal')).show();
}

function selectSize(el, s) {
    document.querySelectorAll('#sizeSelector .btn').forEach(b => b.classList.replace('btn-dark', 'btn-outline-secondary'));
    el.classList.replace('btn-outline-secondary', 'btn-dark');
    state.selectedSize = s;
}

function addToCart(p, size, img) {
    const name = state.lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar);
    const exist = state.cart.find(x => x.id === p._id && x.size === size);
    if(exist) exist.qty++; 
    else state.cart.push({ id: p._id, name: name, price: p.price, img: img, size: size, qty: 1 });
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
        div.innerHTML += `<div class="d-flex align-items-center mb-3"><img src="${x.img}" width="50" height="50" class="rounded object-fit-cover mx-2"><div class="flex-grow-1"><div class="fw-bold small">${x.name}</div><div class="text-muted small">${x.size} | ${t.currency}${x.price} x ${x.qty}</div></div><button onclick="removeFromCart(${i})" class="btn btn-sm text-danger">×</button></div>`;
    });
    if(totEl) totEl.innerText = t.currency + (sub + CONFIG.DELIVERY_FEE).toFixed(2);
}

// ---------------------------------------------------------
// ⚡ NEW: PROFESSIONAL WHATSAPP ORDER FORMAT
// ---------------------------------------------------------
function sendToWhatsApp() {
    if (state.cart.length === 0) return;
    
    const t = I18N[state.lang];
    
    // Header
    let msg = `👋 *${t.whatsapp_intro}*\n`;
    msg += ``;

    let subtotal = 0;

    // Items Loop
    state.cart.forEach((item, index) => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        
        msg += `📦 *${index + 1}. ${item.name}*\n`;
        msg += `   └ 📏 ${t.size}: ${item.size}\n`;
        msg += `   └ 💵 ${item.qty} x ${t.currency}${item.price} = *${t.currency}${itemTotal}*\n\n`;
    });

    const total = subtotal + CONFIG.DELIVERY_FEE;

    // Professional Summary
    msg += ``;
    msg += `💰 *${t.subtotal}:* ${t.currency}${subtotal}\n`;
    msg += `🚚 *${t.delivery}:* ${t.currency}${CONFIG.DELIVERY_FEE}\n`;
    msg += ``;
    msg += `🏆 *${t.total}: ${t.currency}${total}*\n`;
    msg += ``;

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

function createFirework(x, y) {
    const colors = ['#FF9AA2', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA'];
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.classList.add('firework-particle');
        document.body.appendChild(particle);
        const color = colors[Math.floor(Math.random() * colors.length)];
        particle.style.backgroundColor = color;
        particle.style.width = '8px';
        particle.style.height = '8px';
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 80 + 40;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        particle.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
        ], { duration: 600, easing: 'cubic-bezier(0, .9, .57, 1)' }).onfinish = () => particle.remove();
    }
}

function runSmoothFlyAnimation(startElement) {
    const cartIcon = document.querySelector('.cart-float') || document.querySelector('.cart-count');
    if (!startElement || !cartIcon) return;
    const flyImg = startElement.cloneNode();
    const startRect = startElement.getBoundingClientRect();
    const endRect = cartIcon.getBoundingClientRect();
    flyImg.style.position = 'fixed';
    flyImg.style.zIndex = 9999;
    flyImg.style.width = startRect.width + 'px'; 
    flyImg.style.height = startRect.height + 'px';
    flyImg.style.left = startRect.left + 'px';
    flyImg.style.top = startRect.top + 'px';
    flyImg.style.borderRadius = '15px'; 
    flyImg.style.objectFit = 'cover';
    flyImg.style.transition = 'all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)';
    flyImg.style.opacity = 1;
    document.body.appendChild(flyImg);
    requestAnimationFrame(() => {
        flyImg.style.left = (endRect.left + 10) + 'px'; 
        flyImg.style.top = (endRect.top + 10) + 'px';
        flyImg.style.width = '30px'; 
        flyImg.style.height = '30px';
        flyImg.style.opacity = 0.5;
    });
    setTimeout(() => {
        flyImg.remove();
        cartIcon.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(0deg)' }], { duration: 300 });
    }, 800);
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