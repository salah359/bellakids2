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

// --- MODEL ---
const ProductSchema = new mongoose.Schema({
    itemId: { type: String },
    name_en: { type: String, required: true },
    name_ar: { type: String, required: true },
    price: { type: Number, required: true },
    oldPrice: { type: Number }, 
    category: { type: String, default: 'all' },
    subCategory: { type: String, default: 'other' },
    sizes: [String],
    outOfStockSizes: [String], // NEW: Specific ages/sizes out of stock
    colors: [String],
    description_en: String,
    description_ar: String,
    images: [mongoose.Schema.Types.Mixed], 
    inStock: { type: Boolean, default: true },
    isEid: { type: Boolean, default: false }, // NEW: Eid Collection
    createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

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
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

app.post('/api/products', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const { itemId, name_en, name_ar, price, oldPrice, category, subCategory, sizes, outOfStockSizes, colors, description_en, description_ar, inStock, isEid, imageCodes } = req.body;
        
        let sizesArray = sizes ? sizes.split(',').map(s => s.trim()).filter(s => s !== '') : [];
        let oosArray = outOfStockSizes ? outOfStockSizes.split(',').map(s => s.trim()).filter(s => s !== '') : []; // NEW
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
            outOfStockSizes: oosArray, // NEW
            colors: colorsArray,
            description_en, description_ar,
            images: imageObjects, 
            inStock: inStock === 'true' || inStock === true,
            isEid: isEid === 'true' || isEid === true // NEW
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
        const { itemId, name_en, name_ar, price, oldPrice, category, subCategory, sizes, outOfStockSizes, colors, description_en, description_ar, inStock, isEid, imageCodes } = req.body;
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
        product.isEid = isEid === 'true' || isEid === true; // NEW
        
        if (sizes) product.sizes = sizes.split(',').map(s => s.trim()).filter(s => s !== '');
        if (outOfStockSizes !== undefined) product.outOfStockSizes = outOfStockSizes.split(',').map(s => s.trim()).filter(s => s !== ''); // NEW
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

// NEW: Quick toggle for Eid Status
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
                        console.log(`Successfully deleted ${fileName} from Cloud Storage`);
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

app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
