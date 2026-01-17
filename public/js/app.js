// public/js/app.js
// THE MASTER SCRIPT: Handles Shop, Cart, API, Language, and UI.

// =========================================
// 1. CONFIGURATION & STATE
// =========================================
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
    lang: localStorage.getItem(CONFIG.LANG_KEY) || 'ar', // Force Arabic Default
    currentCategory: 'all',
    selectedSize: null 
};

// Translations
const I18N = {
    "en": {
        "loading": "Loading...", "error": "Error loading.", "empty": "No items.",
        "currency": "₪", "add_to_cart": "Add to Basket", "out_of_stock": "Sold Out",
        "in_stock": "In Stock", "select_size": "Select size!", "cart_empty": "Basket is empty",
        "subtotal": "Subtotal", "delivery": "Delivery", "total": "Total",
        "whatsapp_intro": "Hi Bella Kids! I want to order:", "size": "Size",
        "search_placeholder": "Search..."
    },
    "ar": {
        "loading": "جاري تحميل التشكيلة...",
        "error": "تعذر الاتصال بالمتجر.",
        "empty": "لا توجد عناصر هنا 🎈",
        "currency": "₪",
        "add_to_cart": "أضف إلى السلة",
        "out_of_stock": "نفد من المخزون",
        "in_stock": "متوفر",
        "select_size": "يرجى اختيار المقاس!",
        "cart_empty": "سلتك فارغة",
        "subtotal": "المجموع الفرعي",
        "delivery": "التوصيل",
        "total": "المجموع الكلي",
        "whatsapp_intro": "مرحباً بيلا كيدز! أود طلب ما يلي:",
        "size": "المقاس",
        "search_placeholder": "بحث..."
    }
};

// =========================================
// 2. HELPER: IMAGE RESOLVER
// =========================================
function resolveImage(imageInput) {
    if (!imageInput) return 'assets/images/placeholder.png';
    if (imageInput.startsWith('http') || imageInput.startsWith('data:')) {
        return imageInput;
    }
    const cleanName = imageInput.startsWith('/') ? imageInput.substring(1) : imageInput;
    return CONFIG.UPLOAD_PATH + cleanName;
}

// =========================================
// 3. INITIALIZATION
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log(`🚀 Bella Kids App Started [Lang: ${state.lang}]`);

    // --- 1. INJECT FIREWORK STYLES ---
    const style = document.createElement('style');
    style.innerHTML = `
        .firework-particle {
            position: fixed;
            pointer-events: none;
            z-index: 10000;
            border-radius: 50%;
        }
    `;
    document.head.appendChild(style);
    // ---------------------------------

    applyLanguageSettings();

    // Detect Page Category
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
    if (searchInput) {
        searchInput.placeholder = I18N[state.lang].search_placeholder;
        searchInput.addEventListener('keyup', (e) => filterGrid(e.target.value));
    }
    
    if (typeof AOS !== 'undefined') AOS.init();
});

// =========================================
// 4. BACKEND FETCHING
// =========================================
async function fetchProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return; 

    grid.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">${I18N[state.lang].loading}</p>
        </div>`;

    try {
        const res = await fetch(CONFIG.API_URL);
        if (!res.ok) throw new Error('API Error');
        state.products = await res.json();
        filterGrid(''); 
    } catch (err) {
        console.error(err);
        grid.innerHTML = `<div class="col-12 text-center text-danger py-5">${I18N[state.lang].error}</div>`;
    }
}

// =========================================
// 5. RENDERING & FILTERING
// =========================================
function filterGrid(searchTerm) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    const term = searchTerm.toLowerCase();
    
    const filtered = state.products.filter(p => {
        const matchesCategory = (state.currentCategory === 'all' || state.currentCategory === 'featured') 
            ? true 
            : (p.category && p.category.toLowerCase().includes(state.currentCategory));

        const nameEn = p.name_en ? p.name_en.toLowerCase() : '';
        const nameAr = p.name_ar ? p.name_ar.toLowerCase() : '';
        const matchesSearch = nameEn.includes(term) || nameAr.includes(term);

        return matchesCategory && matchesSearch;
    });

    renderProducts(filtered, grid);
}

function renderProducts(products, container) {
    container.innerHTML = '';
    const t = I18N[state.lang];

    if (products.length === 0) {
        container.innerHTML = `<div class="col-12 text-center py-5"><h3>${t.empty}</h3></div>`;
        return;
    }

    products.forEach(p => {
        const name = state.lang === 'ar' ? (p.name_ar || p.name) : (p.name_en || p.name);
        const imageSrc = resolveImage(p.images && p.images.length > 0 ? p.images[0] : null);

        const stockBadge = p.inStock 
            ? `<span class="badge bg-success position-absolute top-0 start-0 m-3">${t.in_stock}</span>`
            : `<span class="badge bg-danger position-absolute top-0 start-0 m-3">${t.out_of_stock}</span>`;

        const html = `
        <div class="col-6 col-md-4 col-lg-3 mb-4" data-aos="fade-up">
            <div class="card product-card h-100 border-0 shadow-sm" onclick="openProductModal('${p._id}')">
                <div class="position-relative overflow-hidden ratio ratio-1x1 rounded-3">
                    ${stockBadge}
                    <img src="${imageSrc}" class="img-fluid object-fit-cover w-100 h-100" alt="${name}">
                </div>
                <div class="card-body text-center p-3">
                    <h6 class="fw-bold text-dark mb-1 text-truncate">${name}</h6>
                    <div class="text-primary fw-bold mb-2">${t.currency}${p.price}</div>
                    <button class="btn btn-outline-dark rounded-pill w-100 btn-sm">
                        ${t.add_to_cart}
                    </button>
                </div>
            </div>
        </div>`;
        container.innerHTML += html;
    });
}

// =========================================
// 6. PRODUCT MODAL
// =========================================
function openProductModal(id) {
    const product = state.products.find(p => p._id === id);
    if (!product) return;

    state.selectedSize = null;
    const t = I18N[state.lang];

    const name = state.lang === 'ar' ? (product.name_ar || product.name) : (product.name_en || product.name);
    const desc = state.lang === 'ar' ? (product.description_ar || product.description) : (product.description_en || product.description);
    
    let imageSrc = 'assets/images/placeholder.png';
    if (product.images && product.images.length > 0) {
        imageSrc = resolveImage(product.images[0]);
    }

    document.getElementById('popupName').innerText = name;
    document.getElementById('popupPrice').innerText = t.currency + product.price;
    document.getElementById('popupDesc').innerText = desc || '';
    
    const imgEl = document.getElementById('popupImage');
    if (imgEl) imgEl.src = imageSrc;

    let sizesToDisplay = (product.sizes && product.sizes.length > 0) ? product.sizes : ['One Size'];
    const sizeContainer = document.getElementById('sizeSelector');
    if (sizeContainer) {
        sizeContainer.innerHTML = sizesToDisplay.map(s => 
            `<button class="btn btn-outline-secondary btn-sm m-1" onclick="selectSize(this, '${s}')">${s}</button>`
        ).join('');
    }

    const addBtn = document.getElementById('modalAddToCart');
    
    // Replace button to remove old event listeners
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);

    newBtn.innerText = t.add_to_cart;
    newBtn.onclick = (e) => {
        if (!state.selectedSize) {
            alert(t.select_size);
            return;
        }
        
        // 1. Add to Cart Logic
        addToCart(product, state.selectedSize, imageSrc); 
        
        // 2. Trigger Firework at Click Position
        createFirework(e.clientX, e.clientY);

        // 3. Trigger Smooth Image Flight
        runSmoothFlyAnimation(imgEl);

        // 4. Close Modal after short delay
        setTimeout(() => {
            const modalEl = document.getElementById('productModal');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.hide();
        }, 400);
    };

    const myModal = new bootstrap.Modal(document.getElementById('productModal'));
    myModal.show();
}

function selectSize(btn, size) {
    document.querySelectorAll('#sizeSelector .btn').forEach(b => {
        b.classList.remove('btn-dark', 'text-white');
        b.classList.add('btn-outline-secondary');
    });
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-dark', 'text-white');
    
    state.selectedSize = size;
}

// =========================================
// 7. CART LOGIC
// =========================================
function addToCart(product, size, image) {
    const existing = state.cart.find(item => item.id === product._id && item.size === size);
    const name = state.lang === 'ar' ? (product.name_ar || product.name) : (product.name_en || product.name);

    if (existing) {
        existing.qty++;
    } else {
        state.cart.push({
            id: product._id,
            name: name,
            price: product.price,
            img: image, 
            size: size,
            qty: 1
        });
    }
    saveCart();
}

function removeFromCart(index) {
    state.cart.splice(index, 1);
    saveCart();
}

function saveCart() {
    localStorage.setItem(CONFIG.CART_KEY, JSON.stringify(state.cart));
    updateCartCounts();
    renderSidebarCart();
}

function updateCartCounts() {
    const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
    document.querySelectorAll('.cart-count').forEach(el => el.innerText = count);
}

function renderSidebarCart() {
    const container = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    if (!container) return;

    container.innerHTML = '';
    const t = I18N[state.lang];
    let subtotal = 0;

    if (state.cart.length === 0) {
        container.innerHTML = `<div class="text-center py-4 text-muted">${t.cart_empty}</div>`;
        if(totalEl) totalEl.innerText = t.currency + '0.00';
        return;
    }

    state.cart.forEach((item, idx) => {
        subtotal += item.price * item.qty;
        container.innerHTML += `
            <div class="d-flex align-items-center mb-3">
                <img src="${item.img}" width="50" height="50" class="rounded object-fit-cover me-2 ms-2">
                <div class="flex-grow-1 mx-2">
                    <div class="small fw-bold">${item.name}</div>
                    <div class="text-muted small">${item.size} | ${t.currency}${item.price} x ${item.qty}</div>
                </div>
                <button onclick="removeFromCart(${idx})" class="btn btn-sm text-danger">×</button>
            </div>`;
    });

    const total = subtotal + CONFIG.DELIVERY_FEE;
    if (totalEl) totalEl.innerText = t.currency + total.toFixed(2);
}

function sendToWhatsApp() {
    if (state.cart.length === 0) return;
    
    const t = I18N[state.lang];
    let msg = `*${t.whatsapp_intro}*\n\n`;
    let subtotal = 0;

    state.cart.forEach(item => {
        msg += `▪️ ${item.name} (${t.size}: ${item.size})\n`;
        msg += `   ${item.qty} x ${t.currency}${item.price}\n`;
        subtotal += item.price * item.qty;
    });

    const total = subtotal + CONFIG.DELIVERY_FEE;
    
    msg += `\n----------------\n`;
    msg += `${t.subtotal}: ${t.currency}${subtotal}\n`;
    msg += `${t.delivery}: ${t.currency}${CONFIG.DELIVERY_FEE}\n`;
    msg += `*${t.total}: ${t.currency}${total}*\n`;

    window.open(`https://wa.me/${CONFIG.WHATSAPP_PHONE}?text=${encodeURIComponent(msg)}`, '_blank');
}

// =========================================
// 8. NEW ANIMATIONS (FIREWORKS + SMOOTH RECTANGLE FLY)
// =========================================

// Firework Effect
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

        // Random Angle and Velocity
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 80 + 40;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;

        particle.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
        ], {
            duration: 600,
            easing: 'cubic-bezier(0, .9, .57, 1)'
        }).onfinish = () => particle.remove();
    }
}

// Smooth Rectangular Flight
function runSmoothFlyAnimation(startElement) {
    const cartIcon = document.querySelector('.cart-float') || document.querySelector('.cart-count');
    if (!startElement || !cartIcon) return;

    const flyImg = startElement.cloneNode();
    const startRect = startElement.getBoundingClientRect();
    const endRect = cartIcon.getBoundingClientRect();

    flyImg.style.position = 'fixed';
    flyImg.style.zIndex = 9999;
    
    // START: Full size rectangle
    flyImg.style.width = startRect.width + 'px'; 
    flyImg.style.height = startRect.height + 'px';
    flyImg.style.left = startRect.left + 'px';
    flyImg.style.top = startRect.top + 'px';
    
    // STYLE: Smooth corners, NOT oval
    flyImg.style.borderRadius = '15px'; 
    flyImg.style.objectFit = 'cover';
    flyImg.style.transition = 'all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)'; // Smooth easing
    flyImg.style.opacity = 1;

    document.body.appendChild(flyImg);

    // Trigger Animation Frame
    requestAnimationFrame(() => {
        // END: Center on cart and shrink
        flyImg.style.left = (endRect.left + 10) + 'px'; 
        flyImg.style.top = (endRect.top + 10) + 'px';
        flyImg.style.width = '30px'; // Shrink size
        flyImg.style.height = '30px';
        flyImg.style.opacity = 0.5;
    });

    // Cleanup
    setTimeout(() => {
        flyImg.remove();
        // Shake the cart icon slightly
        cartIcon.animate([
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-10deg)' },
            { transform: 'rotate(10deg)' },
            { transform: 'rotate(0deg)' }
        ], { duration: 300 });
    }, 800);
}

// =========================================
// 9. GLOBAL UI
// =========================================
function toggleLanguage() {
    state.lang = state.lang === 'en' ? 'ar' : 'en';
    localStorage.setItem(CONFIG.LANG_KEY, state.lang);
    location.reload(); 
}

function applyLanguageSettings() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    
    document.querySelectorAll('[data-i18n-key]').forEach(el => {
        const key = el.getAttribute('data-i18n-key');
        if (I18N[state.lang][key]) {
            el.innerText = I18N[state.lang][key];
        }
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

