const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    itemId: { type: String }, // Internal ID
    name: { type: String, required: true }, // Kept for backward compatibility if used
    name_en: { type: String },
    name_ar: { type: String },
    description: { type: String },
    description_en: { type: String },
    description_ar: { type: String },
    category: { type: String, default: 'all' },
    sizes: [String], 
    colors: [String],
    price: { type: Number, required: true },
    oldPrice: { type: Number },
    inStock: { type: Boolean, default: true },
    // UPDATED: Images are now objects with a URL and a Variant ID
    images: [{
        url: { type: String },
        variantId: { type: String, default: '' }
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);