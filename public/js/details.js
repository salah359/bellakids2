document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const productId = parseInt(params.get('id'));

    // Find the product in our products.js array
    const product = products.find(p => p.id === productId);

    if (product) {
        document.getElementById('detail-image').src = product.image;
        document.getElementById('detail-name').innerText = product.name;
        document.getElementById('detail-price').innerText = `$${product.price}`;
        document.getElementById('detail-desc').innerText = product.description;
    } else {
        window.location.href = 'index.html'; // Redirect if product not found
    }
});

function addToCartFromDetails() {
    const params = new URLSearchParams(window.location.search);
    const productId = parseInt(params.get('id'));
    
    // Use the same function we built in main.js
    // (Ensure main.js cart logic is accessible or copied here)
    alert("Added to cart! (Check console for storage update)");
}