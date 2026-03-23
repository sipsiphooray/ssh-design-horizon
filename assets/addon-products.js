import { convertMoneyToMinorUnits, formatMoney } from '@theme/money-formatting';
import { ThemeEvents, PriceChangeEvent, CartAddEvent, CartErrorEvent, CartUpdateEvent, VariantUpdateEvent } from '@theme/events';

/**
 * AddonCard Component - A lightweight component for addon products
 * Supports variant selection via dropdown when product has variants
 */
export class AddonCard extends HTMLElement {
  static get observedAttributes() {
    return ['data-variant-id', 'data-product-id'];
  }

  constructor() {
    super();
    this.handleVariantChange = this.handleVariantChange.bind(this);
    this.handleCheckboxChange = this.handleCheckboxChange.bind(this);
    this.handleCardClick = this.handleCardClick.bind(this);
    this.handlePriceChange = this.handlePriceChange.bind(this);
  }

  connectedCallback() {
    // Get elements
    this.checkbox = this.querySelector('input[type="checkbox"]');
    this.variantSelector = this.querySelector('.addon-variant-selector');
    this.imageElement = this.querySelector('.addon-image-wrapper img');
    this.priceElement = this.querySelector('product-price .price');
    this.soldOutBadge = this.querySelector('.sold-out-addon');
    
    // Initialize from data attributes
    this.productId = this.getAttribute('data-product-id');
    this.currentVariantId = this.getAttribute('data-variant-id');
    
    // Setup event listeners
    if (this.variantSelector) {
      this.variantSelector.addEventListener('change', this.handleVariantChange);
    }
    
    if (this.checkbox) {
      this.checkbox.addEventListener('change', this.handleCheckboxChange);
    }
    
    // Add click listener to the card itself
    this.addEventListener('click', this.handleCardClick);
    
    // Listen for global price change events
    document.addEventListener('price:change', this.handlePriceChange);
    
    // Initialize variant state
    this.updateVariantState();

    // Update frequently bought section display
    this.updateFrequentlyBoughtDisplay();
  }

  disconnectedCallback() {
    if (this.variantSelector) {
      this.variantSelector.removeEventListener('change', this.handleVariantChange);
    }
    if (this.checkbox) {
      this.checkbox.removeEventListener('change', this.handleCheckboxChange);
    }
    this.removeEventListener('click', this.handleCardClick);
    document.removeEventListener('price:change', this.handlePriceChange);
  }

  /**
   * Handle card click to toggle checkbox
   * @param {Event} event
   */
  handleCardClick(event) {
    // Ignore clicks on interactive elements
    if (event.target.closest('input, label, button, select')) return;

    if (!this.checkbox) return;
    
    // Check if disabled, abort if true
    if (this.checkbox.disabled) return;
    
    this.checkbox.checked = !this.checkbox.checked;
    this.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Fire price calculation when card is clicked
    document.dispatchEvent(new PriceChangeEvent(this.checkbox));
    
    // Update frequently bought section display
    this.updateFrequentlyBoughtDisplay();
  }

  /**
   * Handle price change events globally
   * @param {Event} event
   */
  handlePriceChange(event) {
    // Get the parent from the event detail
    const parent = event.detail?.parent;
    
    // If no parent, don't update anything
    if (!parent) return;
    
    // Find price element within the parent
    const priceEl = parent.querySelector('.total-price-display[data-price]');
    if (!priceEl) return;

    const total = event.detail.total;
    const currency = priceEl.dataset.currency || window.Shopify?.currency?.active || 'USD';
    const moneyFormat = window.theme?.moneyFormat || '${{amount}}';

    // Format using the imported utility. 
    // Purposefully omitting the appended currency text per instructions.
    priceEl.textContent = formatMoney(total, moneyFormat, currency);
  }

  /**
   * Update frequently bought section display based on checked addons
   */
  updateFrequentlyBoughtDisplay() {
    // Find the frequently bought section
    const section = this.closest('.frequently-bought-section');
    if (!section) return;
    
    // Find the total price element and no-chosen message
    const totalPriceEl = section.querySelector('.total-frequent-price');
    const noChosenEl = section.querySelector('.frequent-no-chosen');
    
    // Count checked addons within this section
    const checkedAddons = section.querySelectorAll('.addon-card input[type="checkbox"]:checked');
    
    if (checkedAddons.length > 0) {
      // Show total price, hide no-chosen message
      if (totalPriceEl) {
        totalPriceEl.removeAttribute('hidden');
      }
      if (noChosenEl) {
        noChosenEl.setAttribute('hidden', '');
      }
    } else {
      // Hide total price, show no-chosen message
      if (totalPriceEl) {
        totalPriceEl.setAttribute('hidden', '');
      }
      if (noChosenEl) {
        noChosenEl.removeAttribute('hidden');
      }
    }
  }

  /**
   * Handle variant selection from dropdown
   * @param {Event} event
   */
  handleVariantChange(event) {
    event.stopPropagation();
    
    const selectedOption = this.variantSelector.options[this.variantSelector.selectedIndex];
    const variantId = selectedOption.value;
    const isAvailable = selectedOption.dataset.available === 'true';
    const price = selectedOption.dataset.price;
    const imageUrl = selectedOption.dataset.imageUrl;
    
    // Update checkbox
    if (this.checkbox) {
      this.checkbox.value = variantId;
      this.checkbox.disabled = !isAvailable;
      this.checkbox.setAttribute('data-price', price);
      this.checkbox.setAttribute('data-variant-id', variantId);
      
      // Uncheck if variant is unavailable and was checked
      if (!isAvailable && this.checkbox.checked) {
        this.checkbox.checked = false;
        document.dispatchEvent(new PriceChangeEvent(this.checkbox));
        this.updateFrequentlyBoughtDisplay();
      }
    }
    
    // Update image - only if imageUrl exists and is valid
    if (this.imageElement && imageUrl && imageUrl !== '') {
      this.imageElement.src = imageUrl;
      this.imageElement.setAttribute('srcset', imageUrl);
    }
    
    // Update price display
    if (this.priceElement && price) {
      const formattedPrice = this.formatPrice(price);
      const currentText = this.priceElement.textContent;
      const hasPrefix = currentText.startsWith('+');
      this.priceElement.textContent = (hasPrefix ? '+' : '') + formattedPrice;
    }
    
    // Update sold out badge
    if (this.soldOutBadge) {
      if (isAvailable) {
        this.soldOutBadge.setAttribute('hidden', '');
      } else {
        this.soldOutBadge.removeAttribute('hidden');
      }
    }
    
    // Dispatch price change event if checkbox is checked
    if (this.checkbox && this.checkbox.checked) {
      document.dispatchEvent(new PriceChangeEvent(this.checkbox));
    }
    
    // Update card data attributes
    this.setAttribute('data-variant-id', variantId);
    if (selectedOption.dataset.comparePrice) {
      this.setAttribute('data-variant-compare-price', selectedOption.dataset.comparePrice);
    }
    this.setAttribute('data-variant-price', price);
    
    // Update current variant ID
    this.currentVariantId = variantId;
  }

  /**
   * Handle checkbox change
   * @param {Event} event
   */
  handleCheckboxChange(event) {
    event.stopPropagation();
    
    // If the variant is sold out, prevent checking
    if (this.checkbox.disabled) {
      event.preventDefault();
      this.checkbox.checked = false;
      return;
    }
    
    // Dispatch price change event when checkbox is toggled
    document.dispatchEvent(new PriceChangeEvent(this.checkbox));

    // Update frequently bought section display
    this.updateFrequentlyBoughtDisplay();
  }

  /**
   * Update variant state based on current selection
   */
  updateVariantState() {
    if (!this.currentVariantId || !this.variantSelector) return;
    
    const selectedOption = Array.from(this.variantSelector.options).find(
      option => option.value === this.currentVariantId
    );
    
    if (selectedOption) {
      const isAvailable = selectedOption.dataset.available === 'true';
      const price = selectedOption.dataset.price;
      const imageUrl = selectedOption.dataset.imageUrl;
      
      // Update image
      if (this.imageElement && imageUrl && imageUrl !== '') {
        this.imageElement.src = imageUrl;
        this.imageElement.setAttribute('srcset', imageUrl);
      }
      
      // Update price
      if (this.priceElement && price) {
        const formattedPrice = this.formatPrice(price);
        const currentText = this.priceElement.textContent;
        const hasPrefix = currentText.startsWith('+');
        this.priceElement.textContent = (hasPrefix ? '+' : '') + formattedPrice;
      }
      
      // Update sold out badge
      if (this.soldOutBadge) {
        if (isAvailable) {
          this.soldOutBadge.setAttribute('hidden', '');
        } else {
          this.soldOutBadge.removeAttribute('hidden');
        }
      }
      
      // Update checkbox
      if (this.checkbox) {
        this.checkbox.disabled = !isAvailable;
        this.checkbox.value = this.currentVariantId;
      }
    }
  }

  /**
   * Format price for display using the imported formatMoney utility
   * @param {string|number} price
   * @returns {string}
   */
  formatPrice(price) {
    const numericPrice = typeof price === 'string' ? parseInt(price, 10) : price;
    if (isNaN(numericPrice)) return '';
    
    const moneyFormat = window.theme?.moneyFormat || '${{amount}}';
    const currency = window.Shopify?.currency?.active || 'USD';
    
    return formatMoney(numericPrice, moneyFormat, currency);
  }
}

// Register the custom element
if (!customElements.get('addon-card')) {
  customElements.define('addon-card', AddonCard);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('.frequent-add-to-cart');
  if (!button) return;

  const frequentRow = button.closest('.frequent-row');
  if (!frequentRow) return;

  const checkedAddons = frequentRow.querySelectorAll('.checkbox__input:checked');
  if (checkedAddons.length === 0) return;

  const items = [];
  checkedAddons.forEach(addon => {
    items.push({
      id: parseInt(addon.value),
      quantity: 1
    });
  });

  // Get cart sections to update (matching product-form.js pattern)
  const cartItemsComponents = document.querySelectorAll('cart-items-component');
  const sections = [];
  cartItemsComponents.forEach(item => {
    if (item instanceof HTMLElement && item.dataset.sectionId) {
      sections.push(item.dataset.sectionId);
    }
  });

  const payload = {
    items,
    sections: sections.join(',')
  };

  // Trigger animations on the frequent button itself
  if (button.dataset.added !== 'true') {
    button.dataset.added = 'true';
    setTimeout(() => {
      button.removeAttribute('data-added');
    }, 800);
  }

  fetch(Theme.routes.cart_add_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(response => response.json())
    .then(data => {
      if (data.status) {
        // Error case
        console.error('Error adding to cart:', data);
        return;
      }

      // Trigger animations on existing add-to-cart components
      const allAddToCartContainers = document.querySelectorAll('add-to-cart-component');
      allAddToCartContainers.forEach(container => {
        if (container.animateAddToCart) {
          container.animateAddToCart();
        }
      });

      // Dispatch CartAddEvent with sections (matching product-form.js)
      document.dispatchEvent(
        new CartAddEvent({}, 'frequently-bought', {
          source: 'frequently-bought',
          itemCount: items.length,
          sections: data.sections
        })
      );
    })
    .catch(error => console.error('Failed to add to cart:', error));
});