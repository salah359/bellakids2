const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: ['newborn', 'boys', 'girls'], required: true },
    sizes: { type: String, required: true }, // e.g., "S, M, L" or "3-6m, 6-9m"
    price: { type: Number, required: true },
    inStock: { type: Boolean, default: true },
    images: [{ type: String }] // Array of image filenames
});

module.exports = mongoose.model('Product', productSchema);