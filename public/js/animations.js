// Initialize AOS (Animate On Scroll)
// Note: You'll need the AOS CDN in your index.html head/footer
document.addEventListener('DOMContentLoaded', () => {
    // Basic text reveal for the Hero section
    const heroText = document.querySelector('.reveal-text');
    setTimeout(() => {
        if(heroText) heroText.classList.add('active');
    }, 500);

    // If using AOS library:
    // AOS.init({
    //     duration: 1000,
    //     once: true,
    //     offset: 100
    // });
});