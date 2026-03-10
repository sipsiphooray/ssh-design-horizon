import { ThemeEvents } from '@theme/events';

function scrollToHash() {
  const hash = window.location.hash; // "#faq"
  if (hash) {
    const id = hash.slice(1); // remove #
    const target = document.querySelector(`[data-section-id="${id}"]`);
    if (target) {
      let offset = 0;
      const stickyHeader = document.querySelector('.header[data-sticky-state="active"]');
      if (stickyHeader) {
        offset = stickyHeader.clientHeight;
      }

      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;

      window.scrollTo({
        top: targetPosition,
        behavior: "smooth"
      });
    }
  }
}

// Run on page load
scrollToHash();


// Run on hash change
window.addEventListener("hashchange", scrollToHash);


// Set initial thumbnail from first [data-card-image] in each mega menu
document.querySelectorAll('.mega-menu').forEach(menu => {
  const firstImage = menu.querySelector('[data-card-image]');
  const canvas = menu.querySelector('.thumbnail-hover-canvas');
  if (firstImage && canvas) {
    canvas.style.backgroundImage = `url('${firstImage.dataset.cardImage}')`;
  }
});

// Handle hover updates
document.addEventListener('mouseover', e => {
  const card = e.target.closest('[data-card-image]');
  if (!card) return;
  
  const menu = card.closest('.mega-menu');
  const canvas = menu?.querySelector('.thumbnail-hover-canvas');
  if (canvas) {
    canvas.style.backgroundImage = `url('${card.dataset.cardImage}')`;
  }
});

// Reset to first image when leaving mega menu
document.addEventListener('mouseout', e => {
  const menu = e.target.closest('.mega-menu');
  if (!menu || menu.contains(e.relatedTarget)) return;
  
  const firstImage = menu.querySelector('[data-card-image]');
  const canvas = menu.querySelector('.thumbnail-hover-canvas');
  if (firstImage && canvas) {
    canvas.style.backgroundImage = `url('${firstImage.dataset.cardImage}')`;
  }
});