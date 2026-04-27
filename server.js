require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');      
const jwt = require('jsonwebtoken');     
const crypto = require('crypto');        
const cookieParser = require('cookie-parser'); 
const { Storage } = require('@google-cloud/storage'); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const JWT_SECRET = crypto.randomBytes(64).toString('hex'); 
const RAW_PASSWORD = process.env.ADMIN_PASS || 'magic123';
const SALT = bcrypt.genSaltSync(12); 
const ADMIN_HASH = bcrypt.hashSync(RAW_PASSWORD, SALT);

// Initialize Google Cloud Storage
const storageGCS = new Storage({
    keyFilename: process.env.GCS_KEY_FILE || './gcs-key.json',
    projectId: process.env.GCP_PROJECT_ID 
});
const bucket = storageGCS.bucket(process.env.GCS_BUCKET_NAME || 'bellakids-images'); 

console.log("------------------------------------------------");
console.log("🛡️  SECURITY SYSTEM ACTIVE & CLOUD STORAGE READY");
console.log("------------------------------------------------");

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json()); 
app.use(cookieParser()); 
app.use(express.urlencoded({ extended: true })); 

// 🚨 ADDED THIS BLOCK TO PROTECT admin.html FROM DIRECT ACCESS
app.use((req, res, next) => {
    if (req.path === '/admin.html') {
        const token = req.cookies?.adminToken;
        if (!token) return res.redirect('/login');

        jwt.verify(token, JWT_SECRET, (err) => {
            if (err) return res.redirect('/login');
            next(); // Token is valid, allow them to view the page
        });
    } else {
        next();
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- DATABASE ---
const dbURI = process.env.MONGO_URI || 'mongodb://localhost:27017/bellakids';
mongoose.connect(dbURI)
    .then(() => console.log("✨ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ DB Connection Error:", err));

// --- UPLOAD CONFIGURATION ---
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// --- MODELS ---
const ProductSchema = new mongoose.Schema({
    itemId: { type: String },
    name_en: { type: String, required: true },
    name_ar: { type: String, required: true },
    price: { type: Number, required: true },
    oldPrice: { type: Number }, 
    category: { type: String, default: 'all' },
    subCategory: { type: String, default: 'other' },
    sizes: [String],
    outOfStockSizes: [String],
    colors: [String],
    description_en: String,
    description_ar: String,
    images: [mongoose.Schema.Types.Mixed], 
    inStock: { type: Boolean, default: true },
    isEid: { type: Boolean, default: false },
    isSpring: { type: Boolean, default: false },
    isSummer: { type: Boolean, default: false },
    isAutumn: { type: Boolean, default: false },
    isWinter: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

const SettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
});
const Settings = mongoose.model('Settings', SettingsSchema);

// --- NEW: PROMO MODEL ---
const PromoSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discount: { type: Number, required: true },
    discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    minPurchase: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
    usageLimit: { type: Number, default: 0 }, // 0 means unlimited
    timesUsed: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const Promo = mongoose.model('Promo', PromoSchema);

// --- AUTH MIDDLEWARE (API) ---
const requireAuth = (req, res, next) => {
    const token = req.headers['authorization'] || req.cookies?.adminToken;
    if (!token) return res.status(403).json({ error: "No Token" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Invalid Token" });
        req.user = decoded; 
        next();
    });
};

// --- AUTH MIDDLEWARE (PAGE ACCESS) ---
const requirePageAuth = (req, res, next) => {
    const token = req.cookies?.adminToken;
    if (!token) return res.redirect('/login');

    jwt.verify(token, JWT_SECRET, (err) => {
        if (err) return res.redirect('/login');
        next();
    });
};

// --- HELPER FUNCTION FOR CLOUD UPLOAD ---
const uploadToGCS = (file, variantCode) => {
    return new Promise((resolve, reject) => {
        const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
        const blob = bucket.file(fileName);
        const blobStream = blob.createWriteStream({
            resumable: false,
            public: true, 
            metadata: { contentType: file.mimetype }
        });

        blobStream.on('error', (err) => reject(err));
        blobStream.on('finish', () => {
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            resolve({ url: publicUrl, variantId: variantCode || '' });
        });

        blobStream.end(file.buffer);
    });
};

// --- CAROUSEL SLIDE MODEL ---
const SlideSchema = new mongoose.Schema({
    url: { type: String, required: true },
    link: { type: String, default: '#' }, 
    createdAt: { type: Date, default: Date.now }
});
const Slide = mongoose.model('Slide', SlideSchema);

// --- CAROUSEL ROUTES ---
app.get('/api/slides', async (req, res) => {
    try {
        const slides = await Slide.find().sort({ createdAt: -1 });
        res.json(slides);
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

app.post('/api/slides', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const { link } = req.body;
        if (!req.file) return res.status(400).json({ error: "No image provided" });
        
        const uploadResult = await uploadToGCS(req.file);
        
        const newSlide = new Slide({ url: uploadResult.url, link });
        await newSlide.save();
        res.status(201).json(newSlide);
    } catch (err) {
        console.error("Slide Upload Error:", err);
        res.status(500).json({ error: "Upload failed" });
    }
});

app.delete('/api/slides/:id', requireAuth, async (req, res) => {
    try {
        const slide = await Slide.findByIdAndDelete(req.params.id);
        
        if (slide && slide.url && slide.url.includes('storage.googleapis.com')) {
            const urlParts = slide.url.split('/');
            const fileName = decodeURIComponent(urlParts[urlParts.length - 1]);
            try {
                await bucket.file(fileName).delete();
            } catch (e) {
                console.error("GCS Delete Error:", e);
            }
        }
        res.json({ message: "Slide deleted" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// --- SEASON SETTINGS ROUTES ---
app.post('/api/settings/active-season', requireAuth, async (req, res) => {
    try {
        const { seasonPage } = req.body;
        
        // 1. Update the active season button link
        await Settings.findOneAndUpdate(
            { key: 'active_season' },
            { value: seasonPage },
            { upsert: true, new: true }
        );

        // 2. Determine which database key matches the selected season
        let seasonKey = '';
        if (seasonPage === '/spring') seasonKey = 'isSpring';
        if (seasonPage === '/summer') seasonKey = 'isSummer';
        if (seasonPage === '/autumn') seasonKey = 'isAutumn';
        if (seasonPage === '/winter') seasonKey = 'isWinter';

        // 3. Automatically hide/unhide products across the store
        if (seasonKey) {
            // Hide products that do NOT belong to the chosen season
            await Product.updateMany(
                { [seasonKey]: { $ne: true } }, 
                { $set: { isHidden: true } }
            );
            
            // Unhide products that DO belong to the chosen season
            await Product.updateMany(
                { [seasonKey]: true }, 
                { $set: { isHidden: false } }
            );
        }

        res.json({ success: true, active_season: seasonPage });
    } catch (err) {
        console.error("Error updating season:", err);
        res.status(500).json({ error: "Failed to update season" });
    }
});

app.get('/api/settings/active-season', requireAuth, async (req, res) => {
    try {
        const setting = await Settings.findOne({ key: 'active_season' });
        res.json({ active_season: setting ? setting.value : '/spring' });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch season" });
    }
});

app.get('/active-season', async (req, res) => {
    try {
        const setting = await Settings.findOne({ key: 'active_season' });
        const seasonPage = setting ? setting.value : '/spring';
        res.redirect(seasonPage);
    } catch (err) {
        res.redirect('/spring');
    }
});

// --- NEW: PROMO ROUTES (ADMIN) ---
app.get('/api/promos', requireAuth, async (req, res) => {
    try {
        const promos = await Promo.find().sort({ createdAt: -1 });
        res.json(promos);
    } catch (err) { res.status(500).json({ error: "Fetch error" }); }
});

app.post('/api/promos', requireAuth, async (req, res) => {
    try {
        let { code, discount, discountType, minPurchase, startDate, endDate, isActive, usageLimit } = req.body;
        const newPromo = new Promo({
            code: code.toUpperCase().trim(),
            discount: Number(discount),
            discountType,
            minPurchase: Number(minPurchase) || 0,
            startDate: startDate ? new Date(startDate) : Date.now(),
            endDate: endDate ? new Date(endDate) : null,
            isActive: isActive === 'true' || isActive === true,
            usageLimit: Number(usageLimit) || 0
        });
        await newPromo.save();
        res.status(201).json(newPromo);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/promos/:id', requireAuth, async (req, res) => {
    try {
        await Promo.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/promos/:id/toggle', requireAuth, async (req, res) => {
    try {
        const promo = await Promo.findById(req.params.id);
        if (promo) {
            promo.isActive = !promo.isActive;
            await promo.save();
            res.json(promo);
        } else { res.status(404).json({ error: "Not found" }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- NEW: PROMO ROUTES (PUBLIC VALIDATION) ---
app.post('/api/promos/validate', async (req, res) => {
    try {
        const { code, cartTotal } = req.body;
        const promo = await Promo.findOne({ code: code.toUpperCase().trim() });
        
        if (!promo) return res.status(400).json({ error: "كود الخصم غير صحيح (Invalid Code)" });
        if (!promo.isActive) return res.status(400).json({ error: "كود الخصم غير فعال (Inactive Code)" });
        
        const now = new Date();
        if (promo.startDate && now < promo.startDate) return res.status(400).json({ error: "لم يبدأ عرض هذا الكود بعد (Code not started yet)" });
        if (promo.endDate && now > promo.endDate) return res.status(400).json({ error: "انتهت صلاحية هذا الكود (Code expired)" });
        
        if (promo.usageLimit > 0 && promo.timesUsed >= promo.usageLimit) return res.status(400).json({ error: "تم تجاوز الحد الأقصى لاستخدام هذا الكود (Limit reached)" });
        if (cartTotal < promo.minPurchase) return res.status(400).json({ error: `الحد الأدنى لتطبيق الخصم هو ₪${promo.minPurchase} (Minimum purchase not met)` });

        res.json({
            success: true,
            discount: promo.discount,
            discountType: promo.discountType,
            code: promo.code,
            minPurchase: promo.minPurchase
        });
    } catch (err) { res.status(500).json({ error: "Server Error" }); }
});

// Track promo usage after checkout
app.post('/api/promos/use', async (req, res) => {
    try {
        const { code } = req.body;
        await Promo.findOneAndUpdate({ code: code.toUpperCase().trim() }, { $inc: { timesUsed: 1 } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Server Error" }); }
});

// --- ROUTES ---
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (bcrypt.compareSync(password, ADMIN_HASH)) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
        
        res.cookie('adminToken', token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 3600000 
        });

        res.json({ success: true, token: token });
    } else {
        res.status(401).json({ success: false });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const query = req.query.all === 'true' ? {} : { isHidden: { $ne: true } };
        const products = await Product.find(query).sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

app.post('/api/products/bulk', requireAuth, async (req, res) => {
    try {
        const { ids, action } = req.body;
        if (!ids || ids.length === 0) return res.status(400).json({ error: "No IDs provided" });
        
        if (action === 'delete') {
            const products = await Product.find({ _id: { $in: ids } });
            for (const product of products) {
                if (product.images && product.images.length > 0) {
                    for (const img of product.images) {
                        if (img.url && img.url.includes('storage.googleapis.com')) {
                            const urlParts = img.url.split('/');
                            const fileName = decodeURIComponent(urlParts[urlParts.length - 1]);
                            try { await bucket.file(fileName).delete(); } catch(e) {}
                        }
                    }
                }
            }
            await Product.deleteMany({ _id: { $in: ids } });
        } else if (action === 'hide') {
            await Product.updateMany({ _id: { $in: ids } }, { isHidden: true });
        } else if (action === 'unhide') {
            await Product.updateMany({ _id: { $in: ids } }, { isHidden: false });
        } else if (action === 'duplicate') {
            const products = await Product.find({ _id: { $in: ids } });
            const newProducts = products.map(p => {
                const newP = p.toObject();
                delete newP._id;
                delete newP.createdAt;
                newP.name_ar = newP.name_ar + ' (نسخة)';
                newP.name_en = newP.name_en + ' (Copy)';
                if (newP.itemId) newP.itemId = newP.itemId + '-COPY';
                newP.isHidden = true; // Duplicates are hidden by default
                return newP;
            });
            await Product.insertMany(newProducts);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const { itemId, name_en, name_ar, price, oldPrice, category, subCategory, sizes, outOfStockSizes, colors, description_en, description_ar, inStock, isEid, isSpring, isSummer, isAutumn, isWinter, imageCodes } = req.body;
        
        let sizesArray = sizes ? sizes.split(',').map(s => s.trim()).filter(s => s !== '') : [];
        let oosArray = outOfStockSizes ? outOfStockSizes.split(',').map(s => s.trim()).filter(s => s !== '') : []; 
        let colorsArray = colors ? colors.split(',').map(c => c.trim()).filter(c => c !== '') : [];

        let codes = imageCodes || [];
        if (!Array.isArray(codes)) codes = [codes];

        const uploadPromises = req.files.map((file, i) => uploadToGCS(file, codes[i]));
        const imageObjects = await Promise.all(uploadPromises);

        const newProduct = new Product({
            itemId, name_en, name_ar,
            price: Number(price),
            oldPrice: oldPrice ? Number(oldPrice) : null,
            category, subCategory,
            sizes: sizesArray,
            outOfStockSizes: oosArray, 
            colors: colorsArray,
            description_en, description_ar,
            images: imageObjects, 
            inStock: inStock === 'true' || inStock === true,
            isEid: isEid === 'true' || isEid === true, 
            isSpring: isSpring === 'true' || isSpring === true,
            isSummer: isSummer === 'true' || isSummer === true,
            isAutumn: isAutumn === 'true' || isAutumn === true,
            isWinter: isWinter === 'true' || isWinter === true
        });

        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        console.error("Cloud Save Error:", err);
        res.status(500).json({ error: "Cloud Save error" });
    }
});

app.put('/api/products/:id', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const { itemId, name_en, name_ar, price, oldPrice, category, subCategory, sizes, outOfStockSizes, colors, description_en, description_ar, inStock, isEid, isSpring, isSummer, isAutumn, isWinter, imageCodes } = req.body;
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: "Not found" });
        
        product.itemId = itemId; 
        product.name_en = name_en;
        product.name_ar = name_ar;
        product.price = Number(price);
        product.oldPrice = oldPrice ? Number(oldPrice) : null;
        product.category = category;
        if(subCategory) product.subCategory = subCategory;
        product.description_en = description_en;
        product.description_ar = description_ar;
        product.inStock = inStock === 'true' || inStock === true;
        product.isEid = isEid === 'true' || isEid === true; 
        
        product.isSpring = isSpring === 'true' || isSpring === true;
        product.isSummer = isSummer === 'true' || isSummer === true;
        product.isAutumn = isAutumn === 'true' || isAutumn === true;
        product.isWinter = isWinter === 'true' || isWinter === true;
        
        if (sizes) product.sizes = sizes.split(',').map(s => s.trim()).filter(s => s !== '');
        if (outOfStockSizes !== undefined) product.outOfStockSizes = outOfStockSizes.split(',').map(s => s.trim()).filter(s => s !== ''); 
        if (colors) product.colors = colors.split(',').map(c => c.trim()).filter(c => c !== ''); 
        
        if (req.files && req.files.length > 0) {
            let codes = imageCodes || [];
            if (!Array.isArray(codes)) codes = [codes];
            const uploadPromises = req.files.map((file, i) => uploadToGCS(file, codes[i]));
            product.images = await Promise.all(uploadPromises);
        }
        
        await product.save();
        res.json(product);
    } catch (err) {
        console.error("Cloud Update Error:", err);
        res.status(500).json({ error: "Update error" });
    }
});

app.put('/api/products/:id/toggle-hide', requireAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            product.isHidden = !product.isHidden; 
            await product.save();
            res.json(product);
        } else {
            res.status(404).json({ error: "Not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id/toggle', requireAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            product.inStock = !product.inStock; 
            await product.save();
            res.json(product);
        } else {
            res.status(404).json({ error: "Not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id/toggle-eid', requireAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            product.isEid = !product.isEid; 
            await product.save();
            res.json(product);
        } else {
            res.status(404).json({ error: "Not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        
        if (product && product.images && product.images.length > 0) {
            for (const img of product.images) {
                if (img.url && img.url.includes('storage.googleapis.com')) {
                    const urlParts = img.url.split('/');
                    const fileName = decodeURIComponent(urlParts[urlParts.length - 1]);

                    try {
                        await bucket.file(fileName).delete();
                    } catch (gcsErr) {
                        console.error(`Failed to delete ${fileName} from Cloud Storage:`, gcsErr);
                    }
                }
            }
        }

        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/girls', (req, res) => res.sendFile(path.join(__dirname, 'public', 'girls.html')));
app.get('/boys', (req, res) => res.sendFile(path.join(__dirname, 'public', 'boys.html')));
app.get('/newborn', (req, res) => res.sendFile(path.join(__dirname, 'public', 'newborn.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', requirePageAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/offers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'offers.html')));
app.get('/eid', (req, res) => res.sendFile(path.join(__dirname, 'public', 'eid.html')));

app.get('/spring', (req, res) => res.sendFile(path.join(__dirname, 'public', 'spring.html')));
app.get('/summer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'summer.html')));
app.get('/autumn', (req, res) => res.sendFile(path.join(__dirname, 'public', 'autumn.html')));
app.get('/winter', (req, res) => res.sendFile(path.join(__dirname, 'public', 'winter.html')));

app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
