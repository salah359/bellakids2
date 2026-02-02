// public/js/app.js
// THE MASTER SCRIPT: Handles Shop, Cart, API, Language, and UI.

const DELIVERY_RATES = {
    "wb": { price: 20, name_ar: "الضفة الغربية", name_en: "West Bank" },
    "jlm": { price: 30, name_ar: "القدس", name_en: "Jerusalem" },
    "48": { price: 70, name_ar: "الداخل 48", name_en: "Arab 48" }
};

const CONFIG = {
    API_URL: '/api/products',
    UPLOAD_PATH: '/uploads/',
    CART_KEY: 'BELLA_KIDS_CART',
    LANG_KEY: 'BELLA_LANGUAGE',
    WHATSAPP_PHONE: '972598439251',
    DEFAULT_DELIVERY: 20 
};

// Standard Ages for Filter
const AGES = [
    "0-3M", "3-6M", "6-9M", "9-12M", "12-18M", "18-24M",
    "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "11Y", "12Y"
];

let state = {
    products: [],      
    cart: JSON.parse(localStorage.getItem(CONFIG.CART_KEY)) || [],
    lang: localStorage.getItem(CONFIG.LANG_KEY) || 'ar', 
    currentCategory: 'all',
    selectedSize: null,
    selectedColor: null, 
    modalQty: 1 
};

// Translations
const I18N = {
    "en": {
        "loading": "Loading...", "error": "Error.", "empty": "No items.",
        "currency": "₪", "add_to_cart": "Add to Basket", "out_of_stock": "Sold Out",
        "in_stock": "In Stock", "select_size": "Select size!", "select_color": "Select style!", "cart_empty": "Basket empty",
        "subtotal": "Subtotal", "delivery": "Delivery", "total": "Total Order Amount",
        "whatsapp_intro": "Hello Bella Kids! I would like to place an order for the following items:", 
        "size": "Size", "color": "Style", "qty": "Quantity", "item_code": "Item Code",
        "search_placeholder": "Search...", "sale": "SALE", "off": "OFF",
        "variant_code": "Image Code"
    },
    "ar": {
        "loading": "جاري التحميل...", "error": "خطأ.", "empty": "لا توجد عناصر.",
        "currency": "₪", "add_to_cart": "أضف للسلة", "out_of_stock": "نفد الكمية",
        "in_stock": "متوفر", "select_size": "اختر المقاس!", "select_color": "اختر الموديل!", "cart_empty": "السلة فارغة",
        "subtotal": "المجموع الفرعي", "delivery": "رسوم التوصيل", "total": "إجمالي قيمة الطلب",
        "whatsapp_intro": "مرحباً بيلا كيدز، أود تقديم طلب للمنتجات التالية:", 
        "size": "المقاس", "color": "الموديل", "qty": "الكمية", "item_code": "لون المنتج",
        "search_placeholder": "بحث...", "sale": "خصم", "off": "توفير",
        "variant_code": "كود الصورة"
    }
};

// HELPER: Handles both old strings and new object formats for images
function resolveImage(imageInput) {
    if (!imageInput) return 'assets/images/placeholder.png';
    
    // NEW: If input is an object (from new schema), extract the URL
    const actualPath = (typeof imageInput === 'object' && imageInput.url) ? imageInput.url : imageInput;

    if (actualPath.startsWith('http') || actualPath.startsWith('data:')) return actualPath;
    return CONFIG.UPLOAD_PATH + (actualPath.startsWith('/') ? actualPath.substring(1) : actualPath);
}

// HELPER: Extract Variant ID safely
function getVariantId(imageInput) {
    if (typeof imageInput === 'object' && imageInput.variantId) {
        return imageInput.variantId;
    }
    return ''; // No code available (or old data)
}

document.addEventListener('DOMContentLoaded', () => {
    applyLanguageSettings();
    populateAgeFilter();

    const path = window.location.pathname;
    
    // Set category based on page URL
    if (path.includes('boys')) state.currentCategory = 'boys';
    else if (path.includes('girls')) state.currentCategory = 'girls';
    else if (path.includes('newborn')) state.currentCategory = 'newborn';
    else if (path === '/' || path.includes('index')) {
        state.currentCategory = 'all'; 
        initBalloons();
    }
    
    // Sync dropdown if exists
    const catDropdown = document.getElementById('categoryFilter');
    if(catDropdown && state.currentCategory !== 'all') catDropdown.value = state.currentCategory;

    updateCartCounts();
    renderSidebarCart(); 
    fetchProducts();
    
    // Search listener
    const searchInput = document.getElementById('productSearch');
    if (searchInput) searchInput.addEventListener('keyup', () => filterGrid());
    
    if (typeof AOS !== 'undefined') AOS.init();
});

function populateAgeFilter() {
    const select = document.getElementById('ageFilter');
    if(!select) return;
    AGES.forEach(age => {
        const opt = document.createElement('option');
        opt.value = age;
        opt.innerText = age;
        select.appendChild(opt);
    });
}

async function fetchProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return; 
    try {
        const res = await fetch(CONFIG.API_URL);
        state.products = await res.json();
        filterGrid(); 
    } catch (err) { grid.innerHTML = `<div class="text-center py-5">Error loading</div>`; }
}

function filterGrid() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    
    const searchInput = document.getElementById('productSearch');
    const catDropdown = document.getElementById('categoryFilter');
    const ageDropdown = document.getElementById('ageFilter');
    
    const term = searchInput ? searchInput.value.toLowerCase() : '';
    const category = catDropdown ? catDropdown.value : (state.currentCategory || 'all');
    const age = ageDropdown ? ageDropdown.value : 'all';
    
    const filtered = state.products.filter(p => {
        const matchesCategory = (category === 'all' || category === 'featured') ? true : (p.category && p.category.includes(category));
        const nameMatch = (p.name_en||'').toLowerCase().includes(term) || (p.name_ar||'').toLowerCase().includes(term) || (p.itemId||'').toLowerCase().includes(term);
        
        let matchesAge = true;
        if (age !== 'all') {
            const productSizes = (p.sizes || []).map(s => s.trim().toUpperCase());
            matchesAge = productSizes.includes(age.toUpperCase());
        }

        return matchesCategory && nameMatch && matchesAge;
    });
    renderProducts(filtered, grid);
}

function filterSearch() { filterGrid(); }

function renderProducts(products, container) {
    container.innerHTML = '';
    const t = I18N[state.lang];
    if (products.length === 0) { container.innerHTML = `<h3 class="text-center py-5">${t.empty}</h3>`; return; }

    products.forEach(p => {
        const name = state.lang === 'ar' ? (p.name_ar || p.name) : (p.name_en || p.name);
        // Updated to safely handle object/string images
        const firstImg = (p.images && p.images.length > 0) ? p.images[0] : null;
        const imageSrc = resolveImage(firstImg);
        
        const isSoldOut = !p.inStock;
        const isSale = p.oldPrice && p.oldPrice > p.price;
        let priceHtml = `<div class="text-primary fw-bold mb-2">${t.currency}${p.price}</div>`;
        let saleBadge = '';

        if (isSale) {
            const percent = Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100);
            priceHtml = `<div class="mb-2"><del class="text-muted small">${t.currency}${p.oldPrice}</del><span class="text-danger fw-bold ms-1">${t.currency}${p.price}</span></div>`;
            saleBadge = `<span class="badge bg-danger position-absolute top-0 end-0 m-3 shadow-sm" style="font-size: 11px; padding: 5px 10px; border-radius: 6px;">${t.sale} ${percent}% ${t.off}</span>`;
        }

        const badgeStyle = `position: absolute !important; top: 10px !important; left: 10px !important; right: auto !important; bottom: auto !important; height: auto !important; width: auto !important; font-size: 11px !important; padding: 5px 12px !important; border-radius: 6px !important; z-index: 50 !important; box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;`;
        const stockBadge = isSoldOut ? `<span class="badge bg-danger" style="${badgeStyle}">${t.out_of_stock}</span>` : `<span class="badge bg-success" style="${badgeStyle}">${t.in_stock}</span>`;
        const btnState = isSoldOut ? 'disabled' : '';
        const btnClass = isSoldOut ? 'btn-secondary' : 'btn-outline-dark';
        const cardOpacity = isSoldOut ? 'opacity: 0.75;' : '';

        container.innerHTML += `
        <div class="col-6 col-md-4 col-lg-3 mb-4" data-aos="fade-up">
            <div class="card product-card h-100 border-0 shadow-sm" style="${cardOpacity}" onclick="openProductModal('${p._id}')">
                <div class="position-relative overflow-hidden ratio ratio-1x1 rounded-3">
                    ${stockBadge} ${saleBadge}
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

function openProductModal(id) {
    const p = state.products.find(x => x._id === id);
    if (!p) return;
    state.selectedSize = null;
    state.modalQty = 1; 
    
    const t = I18N[state.lang];
    const name = state.lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar);
    const desc = state.lang === 'ar' ? (p.description_ar || p.description_en) : (p.description_en || p.description_ar);

    const images = (p.images && p.images.length) ? p.images : ['placeholder.png'];
    
    // UPDATED: Render Carousel Items
    let carouselItems = images.map((img, idx) => `
        <div class="carousel-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
            <img src="${resolveImage(img)}" class="d-block w-100 object-fit-cover" style="height: 400px;">
        </div>
    `).join('');

    const carouselHtml = `
        <div id="productCarousel" class="carousel slide" data-bs-ride="carousel">
            <div class="carousel-inner rounded-start">${carouselItems}</div>
            ${images.length > 1 ? `
                <button class="carousel-control-prev" type="button" data-bs-target="#productCarousel" data-bs-slide="prev"><span class="carousel-control-prev-icon bg-dark rounded-circle" aria-hidden="true"></span></button>
                <button class="carousel-control-next" type="button" data-bs-target="#productCarousel" data-bs-slide="next"><span class="carousel-control-next-icon bg-dark rounded-circle" aria-hidden="true"></span></button>
            ` : ''}
        </div>
    `;

    const container = document.getElementById('modalImageContainer');
    if(container) container.innerHTML = carouselHtml;

    document.getElementById('popupName').innerText = name;
    document.getElementById('popupDesc').innerText = desc || '';
    const isSale = p.oldPrice && p.oldPrice > p.price;
    document.getElementById('popupPrice').innerHTML = isSale 
        ? `<del class="text-muted small">${t.currency}${p.oldPrice}</del> <span class="text-danger fw-bold fs-4">${t.currency}${p.price}</span>`
        : t.currency + p.price;

    const sizes = (p.sizes && p.sizes.length) ? p.sizes : ['One Size'];
    document.getElementById('sizeSelector').innerHTML = sizes.map(s => `<button class="btn btn-outline-secondary btn-sm m-1" onclick="selectSize(this, '${s}')">${s}</button>`).join('');

    // Thumbnails
    const thumbContainer = document.getElementById('thumbnailsSelector');
    if (thumbContainer) {
        if (images.length > 1) {
            thumbContainer.parentElement.classList.remove('d-none');
            thumbContainer.innerHTML = images.map((img, idx) => `
                <img src="${resolveImage(img)}" class="thumb-img rounded shadow-sm" width="50" height="50" style="object-fit: cover;" onclick="goToSlide(${idx}, this)">
            `).join('');
        } else { thumbContainer.parentElement.classList.add('d-none'); }
    }
    
    updateModalQtyUI();

    const btn = document.getElementById('modalAddToCart');
    btn.onclick = () => {
        if(!state.selectedSize) { alert(t.select_size); return; }
        
        // UPDATED: Logic to find the Active Image and its Variant ID
        const activeItem = document.querySelector('#productCarousel .carousel-item.active');
        const activeIndex = activeItem ? parseInt(activeItem.getAttribute('data-index')) : 0;
        
        const selectedImgData = images[activeIndex];
        const imgUrl = resolveImage(selectedImgData);
        const variantId = getVariantId(selectedImgData); // NEW: Get the code

        addToCart(p, state.selectedSize, imgUrl, state.modalQty, variantId);
        bootstrap.Modal.getInstance(document.getElementById('productModal')).hide();
    };

    new bootstrap.Modal(document.getElementById('productModal')).show();
}

function selectSize(el, s) {
    document.querySelectorAll('#sizeSelector .btn').forEach(b => b.classList.replace('btn-dark', 'btn-outline-secondary'));
    el.classList.replace('btn-outline-secondary', 'btn-dark');
    state.selectedSize = s;
}

function goToSlide(index, el) {
    const carouselEl = document.getElementById('productCarousel');
    const bsCarousel = bootstrap.Carousel.getOrCreateInstance(carouselEl);
    bsCarousel.to(index);
    document.querySelectorAll('.thumb-img').forEach(img => img.classList.remove('active-thumb', 'border-primary'));
    el.classList.add('active-thumb', 'border-primary');
}

function adjustModalQty(change) {
    state.modalQty += change;
    if (state.modalQty < 1) state.modalQty = 1;
    updateModalQtyUI();
}

function updateModalQtyUI() { const input = document.getElementById('modalQty'); if(input) input.value = state.modalQty; }

// UPDATED: addToCart now saves the Variant ID
function addToCart(p, size, imgUrl, qty, variantId) {
    const name = state.lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar);
    
    // Check if item exists with same ID, Size, AND Variant Image
    const exist = state.cart.find(x => x.id === p._id && x.size === size && x.img === imgUrl);
    
    if(exist) {
        exist.qty += qty; 
    } else {
        state.cart.push({ 
            id: p._id, 
            itemId: p.itemId, 
            name, 
            price: p.price, 
            img: imgUrl, 
            size, 
            qty, 
            variantId: variantId || '' // Save the code
        });
    }
    saveCart();
}

function removeFromCart(i) { state.cart.splice(i, 1); saveCart(); }
function saveCart() { localStorage.setItem(CONFIG.CART_KEY, JSON.stringify(state.cart)); updateCartCounts(); renderSidebarCart(); }
function updateCartCounts() { const c = state.cart.reduce((a, b) => a + b.qty, 0); document.querySelectorAll('.cart-count').forEach(e => e.innerText = c); }

function renderSidebarCart() {
    const div = document.getElementById('cartItems');
    if(!div) return;
    div.innerHTML = '';
    const t = I18N[state.lang];
    if(state.cart.length === 0) { 
        div.innerHTML = `<div class="text-center py-4 text-muted">${t.cart_empty}</div>`; 
        updateCartTotalUI();
        return; 
    }
    state.cart.forEach((x, i) => {
        // Display variant code in cart if it exists
        const codeHtml = x.variantId ? `<br><span class="text-success small fw-bold">${t.variant_code}: ${x.variantId}</span>` : '';
        
        div.innerHTML += `
            <div class="d-flex align-items-center mb-3">
                <img src="${x.img}" width="50" height="50" class="rounded object-fit-cover mx-2">
                <div class="flex-grow-1">
                    <div class="fw-bold small">${x.name}</div>
                    <div class="text-muted small">
                        ${t.size}: ${x.size} | ${t.currency}${x.price} x ${x.qty}
                        ${codeHtml}
                    </div>
                </div>
                <button onclick="removeFromCart(${i})" class="btn btn-sm text-danger">×</button>
            </div>`;
    });
    updateCartTotalUI();
}

function updateCartTotalUI() {
    const t = I18N[state.lang];
    const deliverySelect = document.getElementById('deliveryRegion');
    const feeDisplay = document.getElementById('deliveryFeeDisplay');
    const totalDisplay = document.getElementById('cartTotal');
    
    let regionKey = deliverySelect ? deliverySelect.value : 'wb';
    let fee = DELIVERY_RATES[regionKey] ? DELIVERY_RATES[regionKey].price : 20;
    
    let sub = state.cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    let total = sub > 0 ? sub + fee : 0;

    if(feeDisplay) feeDisplay.innerText = `${t.currency}${fee.toFixed(2)}`;
    if(totalDisplay) totalDisplay.innerText = `${t.currency}${total.toFixed(2)}`;
}

// UPDATED: sendToWhatsApp now includes the Variant ID in the message
function sendToWhatsApp() {
    if (state.cart.length === 0) return;
    const t = I18N[state.lang];
    const deliverySelect = document.getElementById('deliveryRegion');
    const regionKey = deliverySelect ? deliverySelect.value : 'wb';
    const regionData = DELIVERY_RATES[regionKey] || DELIVERY_RATES['wb'];
    const regionName = state.lang === 'ar' ? regionData.name_ar : regionData.name_en;
    const deliveryCost = regionData.price;

    let msg = `*${t.whatsapp_intro}*\n\n`;
    let subtotal = 0;

    state.cart.forEach((item, index) => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        msg += `*${index + 1}. ${item.name}*\n`;
        if(item.itemId) msg += `- ${t.item_code}: ${item.itemId}\n`;
        msg += `- ${t.size}: ${item.size}\n`;
        
        // --- NEW: Add the specific code to the message ---
        if(item.variantId) msg += `- ${t.variant_code}: ${item.variantId} (See Image)\n`;
        // -------------------------------------------------

        msg += `- ${t.qty}: ${item.qty}\n`;
        
    });

    const total = subtotal + deliveryCost;
    msg += `--------------------------\n`;
    msg += `*${t.subtotal}:* ${t.currency}${subtotal}\n`;
    msg += `*${t.delivery} (${regionName}):* ${t.currency}${deliveryCost}\n`;
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
