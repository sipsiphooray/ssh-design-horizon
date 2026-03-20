import { Component } from '@theme/component';
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

class VariantSelect extends Component {
  connectedCallback() {
    this.select = this.querySelector("select");
    if (!this.select) return;
    
    this.wrapper = this.querySelector(".custom-select");
    this.display = this.querySelector(".cs-display");
    this.menu = this.querySelector(".cs-menu");
    this.optionEls = Array.from(this.querySelectorAll(".cs-option"));
    
    // Track if user has interacted yet
    this.userHasInteracted = false;
    
    this.bindEvents();
    this.initializeSelectedOption();
  }

  bindEvents() {
    this.wrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });
    
    document.addEventListener("click", () => this.closeMenu());
    
    // Keyboard navigation
    this.wrapper.addEventListener("keydown", (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleMenu();
      }
    });
    
    this.optionEls.forEach((optionEl, index) => {
      const option = this.select.options[index];
      
      optionEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.userHasInteracted = true; // Mark interaction
        this.onOptionSelect(option, optionEl);
      });
      
      optionEl.addEventListener("keydown", (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.userHasInteracted = true; // Mark interaction
          this.onOptionSelect(option, optionEl);
        }
      });
    });
  }

  initializeSelectedOption() {
    const selectedOption = Array.from(this.select.options).find(opt => opt.selected);
    
    if (selectedOption) {
      // Check if we should show custom label on initial load
      const hasCustomLabel = this.display.hasAttribute('data-custom-label');
      
      if (hasCustomLabel && !this.userHasInteracted) {
      } else {
        this.classList.add("has-value");
      }
      
      // Still mark the option as selected in the menu
      const optionIndex = Array.from(this.select.options).indexOf(selectedOption);
      if (this.optionEls[optionIndex]) {
        this.optionEls[optionIndex].classList.add("selected");
      }
    } else {
      // Select first available option by default
      const firstAvailable = Array.from(this.select.options).find(opt => !opt.disabled);
      if (firstAvailable) {
        this.select.value = firstAvailable.value;
        this.onOptionSelect(firstAvailable, this.optionEls[0]);
      }
    }
  }

  getDisplayText(option) {
    if (option.text.includes('content.unavailable')) {
      return option.text.split(' - ')[0];
    }
    return option.text;
  }

  toggleMenu() {
    const isOpening = !this.menu.classList.contains("open");
    
    if (isOpening) {
      // Close all other variant-select menus on the page
      document.querySelectorAll('variant-select .cs-menu.open').forEach(otherMenu => {
        if (otherMenu !== this.menu) {
          otherMenu.classList.remove('open');
          otherMenu.closest('variant-select').wrapper.setAttribute('aria-expanded', 'false');
        }
      });
    }
    
    this.menu.classList.toggle("open");
    this.wrapper.setAttribute('aria-expanded', this.menu.classList.contains("open"));
  }

  closeMenu() {
    this.menu.classList.remove("open");
    this.wrapper.setAttribute('aria-expanded', 'false');
  }

  onOptionSelect(option, optionEl) {
    
    // Update native select
    this.select.value = option.value;
    
    // Trigger variant change
    this.select.dispatchEvent(new Event("change", { 
      bubbles: true, 
      composed: true 
    }));
    
    // Update selected styling
    this.optionEls.forEach(el => el.classList.remove("selected"));
    optionEl.classList.add("selected");
    
    // Update has-value class
    this.classList.add("has-value");
    
    this.closeMenu();
  }
}

customElements.define("variant-select", VariantSelect);


// Function to update both Titles and Prices on product cards
function updateProductCardData() {
  const productCards = document.querySelectorAll('product-card[data-variant-id]');

  productCards.forEach(card => {
    const variantId = card.getAttribute('data-variant-id');

    // ------------------------------------------
    // 1. TITLE UPDATE LOGIC
    // ------------------------------------------
    const renderTitle = card.getAttribute('data-render-text');
    const titleTextElement = card.querySelector('.product-title-block > *');

    if (titleTextElement && renderTitle) {
      const suffix = ` - ${renderTitle}`;
      if (!titleTextElement.textContent.endsWith(suffix)) {
        titleTextElement.textContent += suffix;
      }
    }

    // ------------------------------------------
    // 2. PRICE UPDATE LOGIC
    // ------------------------------------------
    const priceContainer = card.querySelector('product-price [ref="priceContainer"]') || card.querySelector('[ref="priceContainer"]');
    const variantPrice = card.getAttribute('data-variant-price');
    const variantComparePrice = card.getAttribute('data-variant-compare-price');

    if (priceContainer && variantPrice) {
      // Prevent infinite MutationObserver loops by checking if we already rendered this exact variant's price
      if (priceContainer.getAttribute('data-rendered-variant') === variantId) {
        return; // Skip, we already processed this price
      }

      // Helper function to format Shopify's raw cents (e.g., "500") into dollars ("$5.00")
      // Note: If your Liquid outputs "$5.00" already, this function safely ignores it.
      const formatMoney = (val) => {
        if (!val || val === 'null') return '';
        if (String(val).includes('$')) return val; // Already formatted
        return '$' + (parseInt(val, 10) / 100).toFixed(2);
      };

      const formattedPrice = formatMoney(variantPrice);

      // Check if compare price exists and is higher than 0
      if (variantComparePrice && variantComparePrice !== 'null' && variantComparePrice !== '0' && variantComparePrice !== '') {
        const formattedComparePrice = formatMoney(variantComparePrice);
        
        // Inject Sale Layout
        priceContainer.innerHTML = `
          <span role="group">
            <span class="visually-hidden">Sale price&nbsp;</span>
            <span class="price">${formattedPrice}</span>
          </span>
          <span role="group">
            <span class="visually-hidden">Regular price&nbsp;</span>
            <span class="compare-at-price">${formattedComparePrice}</span>
          </span>
        `;
      } else {
        // Inject Standard Layout (Replaces the "From $10.99" text)
        priceContainer.innerHTML = `
          <span class="price">${formattedPrice}</span>
        `;
      }

      // CRITICAL: Mark this container with the current variant ID so the observer doesn't loop
      priceContainer.setAttribute('data-rendered-variant', variantId);
    }
  });
}

// 1. Run immediately on load.
updateProductCardData();

// 2. Set up the observer with a Debounce.
let debounceTimer;
const cardObserver = new MutationObserver((mutations) => {
  let shouldRun = false;
  
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
      shouldRun = true;
      break; 
    }
  }
  
  if (shouldRun) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateProductCardData();
    }, 150); 
  }
});

// Start observing the body for dynamically injected elements AND text mutations
cardObserver.observe(document.body, { 
  childList: true, 
  subtree: true,
  characterData: true 
});

document.addEventListener('click', (e) => {
  const card = e.target.closest('.addon-card');
  if (!card) return;

  // respect product-card logic (no navigation already handled)
  if (card.hasAttribute('data-no-navigation') === false) return;

  const checkbox = card.querySelector('input[type="checkbox"]');
  if (!checkbox) return;

  // Check if disabled, abort if true
  if (checkbox.disabled) return;

  // ignore real interactive elements
  if (e.target.closest('input, label, button, a')) return;

  checkbox.checked = !checkbox.checked;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
});