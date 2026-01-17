require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');      // 🔒 Encryption
const jwt = require('jsonwebtoken');     // 🔑 Secure Tokens
const crypto = require('crypto');        // 🎲 Random Generator

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. HIGH SECURITY CONFIGURATION ---

// 🎲 ROTATING SECRET KEY
// This generates a completely new, random 64-character secret key every time the server starts.
// This ensures that even if a hacker guesses a token, it becomes invalid the moment you restart.
const JWT_SECRET = crypto.randomBytes(64).toString('hex'); 

// 🔒 PASSWORD HASHING
// We hash the password on startup so we never compare plain text later.
const RAW_PASSWORD = process.env.ADMIN_PASS || 'magic123';
const SALT = bcrypt.genSaltSync(12); // High complexity salt
const ADMIN_HASH = bcrypt.hashSync(RAW_PASSWORD, SALT);

console.log("------------------------------------------------");
console.log("🛡️  SECURITY SYSTEM ACTIVE");
console.log("🔑 Session Secret Generated (Rotating)");
console.log("🔒 Admin Password Hashed in Memory");
console.log("------------------------------------------------");

// --- 2. MIDDLEWARE ---
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// SERVE STATIC FILES
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- 3. DATABASE ---
const dbURI = process.env.MONGO_URI || 'mongodb://localhost:27017/bellakids';
mongoose.connect(dbURI)
    .then(() => console.log("✨ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ DB Connection Error:", err));

// --- 4. UPLOAD CONFIGURATION ---
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

// --- 5. DATA MODEL ---
const ProductSchema = new mongoose.Schema({
    name_en: { type: String, required: true },
    name_ar: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, default: 'all' },
    sizes: [String],
    description_en: String,
    description_ar: String,
    images: [String],
    inStock: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', ProductSchema);

// --- 6. SECURE API ROUTES ---

// 👮‍♂️ DYNAMIC TOKEN MIDDLEWARE
// Instead of checking for a simple string, we cryptographically verify the JWT.
const requireAuth = (req, res, next) => {
    const token = req.headers['authorization'];
    
    if (!token) {
        return res.status(403).json({ error: "⛔ No Token Provided" });
    }

    // Verify the token using the Rotating Secret Key
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            // Token is expired, fake, or from a previous server session
            return res.status(403).json({ error: "⛔ Token Expired or Invalid. Please Log In Again." });
        }
        // Token is valid!
        req.user = decoded; 
        next();
    });
};

// 🔐 SECURE LOGIN ENDPOINT
app.post('/api/login', (req, res) => {
    const { password } = req.body;

    // Compare input with the Secure Hash
    if (bcrypt.compareSync(password, ADMIN_HASH)) {
        
        // Generate a Time-Limited Token (Valid for 20 minutes)
        // This effectively "rotates" the access key.
        const token = jwt.sign(
            { role: 'admin', timestamp: Date.now() }, 
            JWT_SECRET, 
            { expiresIn: '20m' } 
        );

        res.json({ success: true, token: token });
    } else {
        res.status(401).json({ success: false, message: 'Incorrect Password' });
    }
});

// GET All Products (Public)
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        console.error("GET Error:", err);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});

// POST New Product (SECURED)
app.post('/api/products', requireAuth, upload.array('images', 5), async (req, res) => {
    try {
        console.log("📥 Receiving Product Data from Admin..."); 

        const { 
            name_en, name_ar, 
            price, category, 
            sizes, 
            description_en, description_ar, 
            inStock 
        } = req.body;
        
        let sizesArray = [];
        if (sizes) {
            sizesArray = sizes.split(',').map(s => s.trim()).filter(s => s !== '');
        }

        const imagePaths = req.files.map(f => f.filename);

        const newProduct = new Product({
            name_en, name_ar,
            price: Number(price), 
            category,
            sizes: sizesArray,
            description_en, description_ar,
            images: imagePaths,
            inStock: inStock === 'true' || inStock === true 
        });

        await newProduct.save();
        res.status(201).json(newProduct);

    } catch (err) {
        console.error("❌ Save Error:", err);
        res.status(500).json({ error: "Could not save product." });
    }
});

// DELETE Product (SECURED)
app.delete('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        
        if (product && product.images) {
            product.images.forEach(img => {
                const imgPath = path.join(__dirname, 'uploads', img);
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            });
        }

        res.json({ message: "Product deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Catch-all Route
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 7. START SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📂 Serving uploads from: ${path.join(__dirname, 'uploads')}`);
});