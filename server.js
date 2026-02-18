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
const cookieParser = require('cookie-parser'); // Added for cookie handling
const { Storage } = require('@google-cloud/storage'); // ADDED: Import Google Cloud Storage

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const JWT_SECRET = crypto.randomBytes(64).toString('hex'); 
const RAW_PASSWORD = process.env.ADMIN_PASS || 'magic123';
const SALT = bcrypt.genSaltSync(12); 
const ADMIN_HASH = bcrypt.hashSync(RAW_PASSWORD, SALT);

// ADDED: Initialize Google Cloud Storage
const storageGCS = new Storage({
    keyFilename: process.env.GCS_KEY_FILE || './gcs-key.json', // Path to your downloaded JSON key
    projectId: process.env.GCP_PROJECT_ID // Your Google Cloud Project ID
});
const bucket = storageGCS.bucket(process.env.GCS_BUCKET_NAME || 'bellakids-images'); // Your bucket name

console.log("------------------------------------------------");
console.log("🛡️  SECURITY SYSTEM ACTIVE & CLOUD STORAGE READY");
console.log("------------------------------------------------");

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json()); 
app.use(cookieParser()); // Added to parse cookies for auth
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- DATABASE ---
const dbURI = process.env.MONGO_URI || 'mongodb://localhost:27017/bellakids';
mongoose.connect(dbURI)
    .then(() => console.log("✨ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ DB Connection Error:", err));

// --- UPLOAD CONFIGURATION ---
// UPDATED: Changed to memoryStorage to handle files before sending to Cloud
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
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
    colors: [String],
    description_en: String,
    description_ar: String,
    images: [mongoose.Schema.Types.Mixed], 
    inStock: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

// --- AUTH MIDDLEWARE (API) ---
const requireAuth = (req, res, next) => {
    // Check both Authorization header and cookies
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
// ADDED: Handles the actual stream to Google Cloud Storage
const uploadToGCS = (file, variantCode) => {
    return new Promise((resolve, reject) => {
        const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
        const blob = bucket.file(fileName);
        const blobStream = blob.createWriteStream({
            resumable: false,
            public: true, // Makes the image viewable by everyone
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

// --- ROUTES ---

// Login API
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (bcrypt.compareSync(password, ADMIN_HASH)) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
        
        // Set HTTP-only cookie for secure browser access to the admin page
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

// GET Products
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

// POST Product (Upload to Cloud)
app.post('/api/products', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const { itemId, name_en, name_ar, price, oldPrice, category, subCategory, sizes, colors, description_en, description_ar, inStock, imageCodes } = req.body;
        
        let sizesArray = sizes ? sizes.split(',').map(s => s.trim()).filter(s => s !== '') : [];
        let colorsArray = colors ? colors.split(',').map(c => c.trim()).filter(c => c !== '') : [];

        // NEW: Process images for Google Cloud Storage
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
            colors: colorsArray,
            description_en, description_ar,
            images: imageObjects, // Stores public Cloud URLs
            inStock: inStock === 'true' || inStock === true 
        });

        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        console.error("Cloud Save Error:", err);
        res.status(500).json({ error: "Cloud Save error" });
    }
});

// EDIT Product (Upload new images to Cloud if provided)
app.put('/api/products/:id', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const { itemId, name_en, name_ar, price, oldPrice, category, subCategory, sizes, colors, description_en, description_ar, inStock, imageCodes } = req.body;
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
        
        if (sizes) product.sizes = sizes.split(',').map(s => s.trim()).filter(s => s !== '');
        if (colors) product.colors = colors.split(',').map(c => c.trim()).filter(c => c !== ''); 
        
        // NEW: Handle Cloud Upload for updated images
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

// TOGGLE STOCK
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

// DELETE Product
app.delete('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        // Note: For full cleanup, you would use bucket.file(name).delete() here
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/girls', (req, res) => res.sendFile(path.join(__dirname, 'public', 'girls.html')));
app.get('/boys', (req, res) => res.sendFile(path.join(__dirname, 'public', 'boys.html')));
app.get('/newborn', (req, res) => res.sendFile(path.join(__dirname, 'public', 'newborn.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', requirePageAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));

app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
