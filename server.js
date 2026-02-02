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

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const JWT_SECRET = crypto.randomBytes(64).toString('hex'); 
const RAW_PASSWORD = process.env.ADMIN_PASS || 'magic123';
const SALT = bcrypt.genSaltSync(12); 
const ADMIN_HASH = bcrypt.hashSync(RAW_PASSWORD, SALT);

console.log("------------------------------------------------");
console.log("🛡️  SECURITY SYSTEM ACTIVE");
console.log("------------------------------------------------");

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- DATABASE ---
const dbURI = process.env.MONGO_URI || 'mongodb://localhost:27017/bellakids';
mongoose.connect(dbURI)
    .then(() => console.log("✨ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ DB Connection Error:", err));

// --- UPLOAD ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});
const upload = multer({ storage });

// --- MODEL ---
// UPDATED: Schema now supports image objects with IDs
const ProductSchema = new mongoose.Schema({
    itemId: { type: String }, // Stores the internal ID
    name_en: { type: String, required: true },
    name_ar: { type: String, required: true },
    price: { type: Number, required: true },
    oldPrice: { type: Number }, 
    category: { type: String, default: 'all' },
    sizes: [String],
    colors: [String],
    description_en: String,
    description_ar: String,
    // CHANGED: Array of Mixed types to support both old strings and new objects
    images: [mongoose.Schema.Types.Mixed], 
    inStock: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: "No Token" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Invalid Token" });
        req.user = decoded; 
        next();
    });
};

// --- ROUTES ---

// Login API
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (bcrypt.compareSync(password, ADMIN_HASH)) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
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

// POST Product
app.post('/api/products', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const { itemId, name_en, name_ar, price, oldPrice, category, sizes, colors, description_en, description_ar, inStock } = req.body;
        
        // Parse basic arrays
        let sizesArray = [];
        if (sizes) sizesArray = sizes.split(',').map(s => s.trim()).filter(s => s !== '');
        
        let colorsArray = []; 
        if (colors) colorsArray = colors.split(',').map(c => c.trim()).filter(c => c !== '');

        // --- NEW: Handle Image Codes ---
        // req.body.imageCodes might be a string (if 1 image) or array (if multiple)
        let codes = req.body.imageCodes || [];
        if (!Array.isArray(codes)) codes = [codes];

        // Map files to the new object structure { url, variantId }
        const imageObjects = req.files.map((f, i) => ({
            url: f.filename,
            variantId: codes[i] || '' // Assign the corresponding code or empty string
        }));

        const newProduct = new Product({
            itemId, 
            name_en, name_ar,
            price: Number(price),
            oldPrice: oldPrice ? Number(oldPrice) : null,
            category,
            sizes: sizesArray,
            colors: colorsArray,
            description_en, description_ar,
            images: imageObjects, // Save the new object structure
            inStock: inStock === 'true' || inStock === true 
        });
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Save error" });
    }
});

// EDIT Product
app.put('/api/products/:id', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const { itemId, name_en, name_ar, price, oldPrice, category, sizes, colors, description_en, description_ar, inStock } = req.body;
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: "Not found" });
        
        product.itemId = itemId; 
        product.name_en = name_en;
        product.name_ar = name_ar;
        product.price = Number(price);
        product.oldPrice = oldPrice ? Number(oldPrice) : null;
        product.category = category;
        product.description_en = description_en;
        product.description_ar = description_ar;
        product.inStock = inStock === 'true' || inStock === true;
        
        if (sizes) product.sizes = sizes.split(',').map(s => s.trim()).filter(s => s !== '');
        if (colors) product.colors = colors.split(',').map(c => c.trim()).filter(c => c !== ''); 
        
        // Only replace images if new ones are uploaded
        if (req.files && req.files.length > 0) {
            let codes = req.body.imageCodes || [];
            if (!Array.isArray(codes)) codes = [codes];

            product.images = req.files.map((f, i) => ({
                url: f.filename,
                variantId: codes[i] || ''
            }));
        }
        
        await product.save();
        res.json(product);
    } catch (err) {
        console.error(err);
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
        if (product && product.images) {
            product.images.forEach(imgData => {
                // Handle both old strings and new objects
                const filename = (typeof imgData === 'string') ? imgData : imgData.url;
                const p = path.join(__dirname, 'uploads', filename);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            });
        }
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cleaning up URL routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/girls', (req, res) => res.sendFile(path.join(__dirname, 'public', 'girls.html')));
app.get('/boys', (req, res) => res.sendFile(path.join(__dirname, 'public', 'boys.html')));
app.get('/newborn', (req, res) => res.sendFile(path.join(__dirname, 'public', 'newborn.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Catch-all
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));