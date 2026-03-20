import { Component } from '@theme/component';
import { fetchConfig, preloadImage, onAnimationEnd, yieldToMainThread } from '@theme/utilities';
import { ThemeEvents, CartAddEvent, CartErrorEvent, CartUpdateEvent, VariantUpdateEvent } from '@theme/events';
import { cartPerformance } from '@theme/performance';
import { morph } from '@theme/morph';

// Error message display duration - gives users time to read the message
const ERROR_MESSAGE_DISPLAY_DURATION = 10000;

// Button re-enable delay after error - prevents rapid repeat attempts
const ERROR_BUTTON_REENABLE_DELAY = 1000;

// Success message display duration for screen readers
const SUCCESS_MESSAGE_DISPLAY_DURATION = 5000;

/**
 * @typedef {HTMLElement & {
 *   source: Element,
 *   destination: Element,
 *   useSourceSize: string | boolean
 * }} FlyToCart
 */

/**
 * A custom element that manages an add to cart button.
 *
 * @typedef {object} AddToCartRefs
 * @property {HTMLButtonElement} addToCartButton - The add to cart button.
 * @extends Component<AddToCartRefs>
 */
export class AddToCartComponent extends Component {
  requiredRefs = ['addToCartButton'];

  /** @type {number[] | undefined} */
  #resetTimeouts = /** @type {number[]} */ ([]);

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('pointerenter', this.#preloadImage);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this.#resetTimeouts) {
      this.#resetTimeouts.forEach(/** @param {number} timeoutId */ (timeoutId) => clearTimeout(timeoutId));
    }
    this.removeEventListener('pointerenter', this.#preloadImage);
  }

  /**
   * Disables the add to cart button.
   */
  disable() {
    this.refs.addToCartButton.disabled = true;
  }

  /**
   * Enables the add to cart button.
   */
  enable() {
    this.refs.addToCartButton.disabled = false;
  }

  /**
   * Handles the click event for the add to cart button.
   * @param {MouseEvent & {target: HTMLElement}} event - The click event.
   */
  handleClick(event) {
    const form = this.closest('form');
    if (!form?.checkValidity()) return;

    // Check if adding would exceed max before animating
    const productForm = /** @type {ProductFormComponent | null} */ (this.closest('product-form-component'));
    const quantitySelector = productForm?.refs.quantitySelector;
    if (quantitySelector?.canAddToCart) {
      const validation = quantitySelector.canAddToCart();
      // Don't animate if it would exceed max
      if (!validation.canAdd) {
        return;
      }
    }
    if (this.refs.addToCartButton.dataset.puppet !== 'true') {
      const animationEnabled = this.dataset.addToCartAnimation === 'true';
      if (animationEnabled && !event.target.closest('.quick-add-modal')) {
        this.#animateFlyToCart();
      }
      this.animateAddToCart();
    }
  }

  #preloadImage = () => {
    const image = this.dataset.productVariantMedia;

    if (!image) return;

    preloadImage(image);
  };

  /**
   * Animates the fly to cart animation.
   */
  #animateFlyToCart() {
    const { addToCartButton } = this.refs;
    const cartIcon = document.querySelector('.header-actions__cart-icon');

    const image = this.dataset.productVariantMedia;

    if (!cartIcon || !addToCartButton || !image) return;

    const flyToCartElement = /** @type {FlyToCart} */ (document.createElement('fly-to-cart'));

    let flyToCartClass = addToCartButton.classList.contains('quick-add__button')
      ? 'fly-to-cart--quick'
      : 'fly-to-cart--main';

    flyToCartElement.classList.add(flyToCartClass);
    flyToCartElement.style.setProperty('background-image', `url(${image})`);
    flyToCartElement.style.setProperty('--start-opacity', '0');
    flyToCartElement.source = addToCartButton;
    flyToCartElement.destination = cartIcon;

    document.body.appendChild(flyToCartElement);
  }

  /**
   * Animates the add to cart button.
   */
  animateAddToCart = async function () {
    const { addToCartButton } = this.refs;

    // Initialize the array if it doesn't exist
    if (!this.#resetTimeouts) {
      this.#resetTimeouts = [];
    }

    // Clear all existing timeouts
    this.#resetTimeouts.forEach(/** @param {number} timeoutId */ (timeoutId) => clearTimeout(timeoutId));
    this.#resetTimeouts = [];

    if (addToCartButton.dataset.added !== 'true') {
      addToCartButton.dataset.added = 'true';
    }

    // The onAnimationEnd can trigger a style recalculation so we yield to the main thread first.
    await yieldToMainThread();
    await onAnimationEnd(addToCartButton);

    // Create new timeout and store it in the array
    const timeoutId = setTimeout(() => {
      addToCartButton.removeAttribute('data-added');

      // Remove this timeout from the array
      const index = this.#resetTimeouts.indexOf(timeoutId);
      if (index > -1) {
        this.#resetTimeouts.splice(index, 1); 
      }
    }, 800);

    this.#resetTimeouts.push(timeoutId);
  };
}

if (!customElements.get('add-to-cart-component')) {
  customElements.define('add-to-cart-component', AddToCartComponent);
}

/**
 * A custom element that manages a product form.
 *
 * @typedef {{items: Array<{quantity: number, variant_id: number}>}} Cart
 *
 * @typedef {object} ProductFormRefs
 * @property {HTMLInputElement} variantId - The form input for submitting the variant ID.
 * @property {AddToCartComponent | undefined} addToCartButtonContainer - The add to cart button container element.
 * @property {HTMLElement | undefined} addToCartTextError - The add to cart text error.
 * @property {HTMLElement | undefined} acceleratedCheckoutButtonContainer - The accelerated checkout button container element.
 * @property {HTMLElement} liveRegion - The live region.
 * @property {HTMLElement | undefined} quantityLabelCartCount - The quantity label cart count element.
 * @property {HTMLElement | undefined} quantityRules - The quantity rules element.
 * @property {HTMLElement | undefined} productFormButtons - The product form buttons container.
 * @property {HTMLElement | undefined} volumePricing - The volume pricing component.
 * @property {any | undefined} quantitySelector - The quantity selector component.
 * @property {HTMLElement | undefined} quantitySelectorWrapper - The quantity selector wrapper element.
 * @property {HTMLElement | undefined} quantityLabel - The quantity label element.
 * @property {HTMLElement | undefined} pricePerItem - The price per item component.
 *
 * @extends Component<ProductFormRefs>
 */
class ProductFormComponent extends Component {
  requiredRefs = ['variantId', 'liveRegion'];
  #abortController = new AbortController();

  /** @type {number | undefined} */
  #timeout;

  /** @type {boolean} */
  #variantChangeInProgress = false;

  /** @type {Array<{variantId: string, quantity: number}>} */
  #addToCartQueue = [];

  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#abortController;
    const target = this.closest('.shopify-section, dialog, product-card');
    target?.addEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdate, { signal });
    target?.addEventListener(ThemeEvents.variantSelected, this.#onVariantSelected, { signal });

    // Listen for cart updates to sync data-cart-quantity
    document.addEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate, { signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
  }

  /**
   * Updates quantity selector with cart data for current variant
   * @param {Cart} cart - The cart object with items array
   * @returns {number} The cart quantity for the current variant
   */
  #updateCartQuantityFromData(cart) {
    const variantIdInput = /** @type {HTMLInputElement | null} */ (this.querySelector('input[name="id"]'));
    if (!variantIdInput?.value || !cart?.items) return 0;

    const cartItem = cart.items.find((item) => item.variant_id.toString() === variantIdInput.value.toString());
    const cartQty = cartItem ? cartItem.quantity : 0;

    // Use public API to update quantity selector
    const quantitySelector = /** @type {any | undefined} */ (this.querySelector('quantity-selector-component'));
    if (quantitySelector?.setCartQuantity) {
      quantitySelector.setCartQuantity(cartQty);
    }

    // Update quantity label if it exists
    this.#updateQuantityLabel(cartQty);

    return cartQty;
  }

  /**
   * Fetches cart and updates quantity selector for current variant
   * @returns {Promise<number>} The cart quantity for the current variant
   */
  async #fetchAndUpdateCartQuantity() {
    const variantIdInput = /** @type {HTMLInputElement | null} */ (this.querySelector('input[name="id"]'));
    if (!variantIdInput?.value) return 0;

    try {
      const response = await fetch('/cart.js');
      const cart = await response.json();

      return this.#updateCartQuantityFromData(cart);
    } catch (error) {
      console.error('Failed to fetch cart quantity:', error);
      return 0;
    }
  }

  /**
   * Updates data-cart-quantity when cart is updated from elsewhere
   * @param {CartUpdateEvent|CartAddEvent} event
   */
  #onCartUpdate = async (event) => {
    // Skip if this event came from this component
    if (event.detail?.sourceId === this.id || event.detail?.data?.source === 'product-form-component') return;

    const cart = /** @type {Cart} */ (event.detail?.resource);
    if (cart?.items) {
      this.#updateCartQuantityFromData(cart);
    } else {
      await this.#fetchAndUpdateCartQuantity();
    }
  };

  /** @param {Event} event */
  handleSubmit(event) {
    event.preventDefault();

    if (this.#variantChangeInProgress) {
      const intendedVariantId = this.#getIntendedVariantId();
      const quantity = this.#getQuantity();

      if (intendedVariantId) {
        this.#addToCartQueue.push({ variantId: intendedVariantId, quantity });
      }

      this.refs.addToCartButtonContainer?.animateAddToCart?.();
      return;
    }

    this.#processAddToCart(undefined, undefined, event);
  }

  /** @returns {string | undefined} */
  #getIntendedVariantId() {
    return new URL(window.location.href).searchParams.get('variant') || this.refs.variantId?.value || undefined;
  }

  /** @returns {number} */
  #getQuantity() {
    return Number(this.refs.quantitySelector?.getValue?.()) || Number(this.dataset.quantityDefault) || 1;
  }

  /**
   * @param {string} [overrideVariantId]
   * @param {number} [overrideQuantity]
   * @param {Event} [event]
   */
  #processAddToCart(overrideVariantId, overrideQuantity, event) {
    const { addToCartTextError } = this.refs;

    if (this.#timeout) clearTimeout(this.#timeout);

    const allAddToCartContainers = /** @type {NodeListOf<AddToCartComponent>} */ (
      this.querySelectorAll('add-to-cart-component')
    );

    if (!overrideVariantId) {
      const anyButtonDisabled = Array.from(allAddToCartContainers).some(
        (container) => container.refs.addToCartButton?.disabled
      );
      if (anyButtonDisabled) return;
    }

    const form = this.querySelector('form');
    if (!form) throw new Error('Product form element missing');

    if (!overrideVariantId && this.refs.quantitySelector?.canAddToCart) {
      const validation = this.refs.quantitySelector.canAddToCart();

      if (!validation.canAdd) {
        for (const container of allAddToCartContainers) {
          container.disable();
        }

        const errorTemplate = this.dataset.quantityErrorMax || '';
        const errorMessage = errorTemplate.replace('{{ maximum }}', validation.maxQuantity?.toString() || '');
        if (addToCartTextError) {
          addToCartTextError.classList.remove('hidden');
          const textNode = addToCartTextError.childNodes[2];
          if (textNode) textNode.textContent = errorMessage;
          else addToCartTextError.appendChild(document.createTextNode(errorMessage));

          this.#setLiveRegionText(errorMessage);

          if (this.#timeout) clearTimeout(this.#timeout);
          this.#timeout = setTimeout(() => {
            if (!addToCartTextError) return;
            addToCartTextError.classList.add('hidden');
            this.#clearLiveRegionText();
          }, ERROR_MESSAGE_DISPLAY_DURATION);
        }

        setTimeout(() => {
          for (const container of allAddToCartContainers) container.enable();
        }, ERROR_BUTTON_REENABLE_DELAY);

        return;
      }
    }

    // Use let so we can overwrite it if addons are present
    let formData = new FormData(form);

    if (overrideVariantId) formData.set('id', overrideVariantId);
    if (overrideQuantity !== undefined) formData.set('quantity', overrideQuantity.toString());

    // --- ADDON LOGIC WITH PARENT_ID START ---
    const mainVariantId = formData.get('id');
    const mainQuantity = formData.get('quantity') || this.dataset.quantityDefault || '1';
    let totalQuantityAdded = Number(mainQuantity);

    const addon_items = [];
    for (const [key, value] of formData.entries()) {
      // Find our checkbox addons
      if (key.startsWith('addon-') && value) {
        addon_items.push({ 
          id: value.toString(), 
          quantity: 1, // Default addon quantity
          parent_id: mainVariantId,
          properties: {
            '_parentProduct': mainVariantId
          }
        });
      }
    }
debugger
    // If addons are checked, reconstruct formData into Shopify's multi-item array format
    if (addon_items.length > 0) {
      const itemsFormData = new FormData();
      totalQuantityAdded += addon_items.length;

      // 1. Add main product as items[0]
      itemsFormData.append('items[0][id]', mainVariantId.toString());
      itemsFormData.append('items[0][quantity]', mainQuantity.toString());

      // Extract and attach properties to main product if they exist
      for (const [key, value] of formData.entries()) {
        const propMatch = key.match(/^properties\[(.+)]$/);
        if (propMatch && propMatch[1]) {
          itemsFormData.append(`items[0][properties][${propMatch[1]}]`, value.toString());
        }
      }

      // 2. Add selected addon items with parent linking as items[1], items[2], etc.
      addon_items.forEach((addon, index) => {
        itemsFormData.append(`items[${index + 1}][id]`, addon.id);
        itemsFormData.append(`items[${index + 1}][quantity]`, addon.quantity.toString());
        
        if (addon.parent_id) {
          itemsFormData.append(`items[${index + 1}][parent_id]`, addon.parent_id.toString());
        }
        
        if (addon.properties) {
          Object.entries(addon.properties).forEach(([key, value]) => {
            itemsFormData.append(`items[${index + 1}][properties][${key}]`, value.toString());
          });
        }
      });

      // 3. Copy other necessary form data (sections) while ignoring old ids/quantities
      for (const [key, value] of formData.entries()) {
        if (key !== 'id' && key !== 'quantity' && !key.startsWith('properties[') && !key.startsWith('addon-')) {
          itemsFormData.append(key, value);
        }
      }

      formData = itemsFormData; // Override original formData
    }
    // --- ADDON LOGIC WITH PARENT_ID END ---

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    let cartItemComponentsSectionIds = [];
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        cartItemComponentsSectionIds.push(item.dataset.sectionId);
      }
      formData.append('sections', cartItemComponentsSectionIds.join(','));
    });

    const fetchCfg = fetchConfig('javascript', { body: formData });

    fetch(Theme.routes.cart_add_url, {
      ...fetchCfg,
      headers: { ...fetchCfg.headers, Accept: 'text/html' },
    })
      .then((response) => response.json())
      .then(async (response) => {
        if (response.status) {
          this.dispatchEvent(new CartErrorEvent(form.getAttribute('id') || '', response.message, response.description, response.errors));

          if (!addToCartTextError) return;
          addToCartTextError.classList.remove('hidden');

          const textNode = addToCartTextError.childNodes[2];
          if (textNode) textNode.textContent = response.message;
          else addToCartTextError.appendChild(document.createTextNode(response.message));

          this.#setLiveRegionText(response.message);

          this.#timeout = setTimeout(() => {
            if (!addToCartTextError) return;
            addToCartTextError.classList.add('hidden');
            this.#clearLiveRegionText();
          }, ERROR_MESSAGE_DISPLAY_DURATION);

          this.dispatchEvent(
            new CartAddEvent({}, this.id, {
              didError: true,
              source: 'product-form-component',
              itemCount: totalQuantityAdded,
              productId: this.dataset.productId,
            })
          );
          return;
        } else {
          if (addToCartTextError) {
            addToCartTextError.classList.add('hidden');
            addToCartTextError.removeAttribute('aria-live');
          }

          if (!mainVariantId) throw new Error('Form ID is required');

          const anyAddToCartButton = allAddToCartContainers[0]?.refs.addToCartButton;
          if (anyAddToCartButton) {
            const addedTextElement = anyAddToCartButton.querySelector('.add-to-cart-text--added');
            const addedText = addedTextElement?.textContent?.trim() || Theme.translations.added;

            this.#setLiveRegionText(addedText);

            setTimeout(() => {
              this.#clearLiveRegionText();
            }, SUCCESS_MESSAGE_DISPLAY_DURATION);
          }

          await this.#fetchAndUpdateCartQuantity();

          this.dispatchEvent(
            new CartAddEvent({}, mainVariantId.toString(), {
              source: 'product-form-component',
              itemCount: totalQuantityAdded,
              productId: this.dataset.productId,
              sections: response.sections,
            })
          );
        }
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (event) cartPerformance.measureFromEvent('add:user-action', event);
      });
  }

  /** @param {Array<{variantId: string, quantity: number}>} items */
  #processBatchAddToCart(items) {
    if (items.length === 0) return;

    const { addToCartTextError } = this.refs;

    if (this.#timeout) clearTimeout(this.#timeout);

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const cartItemComponentsSectionIds = [];
    for (const item of cartItemsComponents) {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        cartItemComponentsSectionIds.push(item.dataset.sectionId);
      }
    }

    const payload = {
      items: items.map((item) => ({
        id: Number(item.variantId),
        quantity: item.quantity,
      })),
      sections: cartItemComponentsSectionIds.join(','),
    };

    fetch(Theme.routes.cart_add_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json())
      .then(async (response) => {
        if (response.status) {
          this.dispatchEvent(
            new CartErrorEvent(this.id, response.message, response.description, response.errors)
          );

          if (addToCartTextError) {
            addToCartTextError.classList.remove('hidden');
            const textNode = addToCartTextError.childNodes[2];
            if (textNode) {
              textNode.textContent = response.message;
            } else {
              addToCartTextError.appendChild(document.createTextNode(response.message));
            }
            this.#setLiveRegionText(response.message);

            this.#timeout = setTimeout(() => {
              addToCartTextError.classList.add('hidden');
              this.#clearLiveRegionText();
            }, ERROR_MESSAGE_DISPLAY_DURATION);
          }

          this.dispatchEvent(
            new CartAddEvent({}, this.id, {
              didError: true,
              source: 'product-form-component',
              itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
              productId: this.dataset.productId,
            })
          );
          return;
        }

        if (addToCartTextError) {
          addToCartTextError.classList.add('hidden');
          addToCartTextError.removeAttribute('aria-live');
        }

        const allAddToCartContainers = /** @type {NodeListOf<AddToCartComponent>} */ (
          this.querySelectorAll('add-to-cart-component')
        );
        const anyAddToCartButton = allAddToCartContainers[0]?.refs.addToCartButton;
        if (anyAddToCartButton) {
          const addedTextElement = anyAddToCartButton.querySelector('.add-to-cart-text--added');
          const addedText = addedTextElement?.textContent?.trim() || Theme.translations.added;
          this.#setLiveRegionText(addedText);
          setTimeout(() => this.#clearLiveRegionText(), SUCCESS_MESSAGE_DISPLAY_DURATION);
        }

        await this.#fetchAndUpdateCartQuantity();

        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        this.dispatchEvent(
          new CartAddEvent({}, this.id, {
            source: 'product-form-component',
            itemCount: totalQuantity,
            productId: this.dataset.productId,
            sections: response.sections,
          })
        );
      })
      .catch((error) => {
        console.error(error);
      });
  }

  /**
   * Updates the quantity label with the current cart quantity
   * @param {number} cartQty - The quantity in cart
   */
  #updateQuantityLabel(cartQty) {
    const quantityLabel = this.refs.quantityLabelCartCount;
    if (quantityLabel) {
      const inCartText = quantityLabel.textContent?.match(/\((\d+)\s+(.+)\)/);
      if (inCartText && inCartText[2]) {
        quantityLabel.textContent = `(${cartQty} ${inCartText[2]})`;
      }

      // Show/hide based on quantity
      quantityLabel.classList.toggle('hidden', cartQty === 0);
    }
  }

  /**
   * @param {*} text
   */
  #setLiveRegionText(text) {
    const liveRegion = this.refs.liveRegion;
    liveRegion.textContent = text;
  }

  #clearLiveRegionText() {
    const liveRegion = this.refs.liveRegion;
    liveRegion.textContent = '';
  }

  /**
   * Morphs or removes/adds an element based on current and new element states
   * @param {Element | null | undefined} currentElement - The current element in the DOM
   * @param {Element | null | undefined} newElement - The new element from the server response
   * @param {Element | null} [insertReferenceElement] - Element to insert before if adding new element
   */
  #morphOrUpdateElement(currentElement, newElement, insertReferenceElement = null) {
    if (currentElement && newElement) {
      morph(currentElement, newElement);
    } else if (currentElement && !newElement) {
      currentElement.remove();
    } else if (!currentElement && newElement && insertReferenceElement) {
      insertReferenceElement.insertAdjacentElement('beforebegin', /** @type {Element} */ (newElement.cloneNode(true)));
    }
  }

  /**
   * @param {VariantUpdateEvent} event
   */
  #onVariantUpdate = async (event) => {
    if (event.detail.data.newProduct) {
      this.dataset.productId = event.detail.data.newProduct.id;
    } else if (event.detail.data.productId !== this.dataset.productId) {
      return;
    }

    const { variantId } = this.refs;
    variantId.value = event.detail.resource?.id ?? '';

    this.#variantChangeInProgress = false;

    if (this.#addToCartQueue.length > 0) {
      const queuedItems = [...this.#addToCartQueue];
      this.#addToCartQueue = [];
      this.#processBatchAddToCart(queuedItems);
    }

    const { addToCartButtonContainer: currentAddToCartButtonContainer, acceleratedCheckoutButtonContainer } = this.refs;
    const currentAddToCartButton = currentAddToCartButtonContainer?.refs.addToCartButton;

    // Update state and text for add-to-cart button
    if (!currentAddToCartButtonContainer || (!currentAddToCartButton && !acceleratedCheckoutButtonContainer)) return;

    // Update the button state
    if (event.detail.resource == null || event.detail.resource.available == false) {
      currentAddToCartButtonContainer.disable();
    } else {
      currentAddToCartButtonContainer.enable();
    }

    const newAddToCartButton = event.detail.data.html.querySelector('product-form-component [ref="addToCartButton"]');
    if (newAddToCartButton && currentAddToCartButton) {
      morph(currentAddToCartButton, newAddToCartButton);
    }

    if (acceleratedCheckoutButtonContainer) {
      if (event.detail.resource == null || event.detail.resource.available == false) {
        acceleratedCheckoutButtonContainer?.setAttribute('hidden', 'true');
      } else {
        acceleratedCheckoutButtonContainer?.removeAttribute('hidden');
      }
    }

    // Set the data attribute for the product variant media if it exists
    if (event.detail.resource) {
      const productVariantMedia = event.detail.resource.featured_media?.preview_image?.src;
      if (productVariantMedia) {
        this.refs.addToCartButtonContainer?.setAttribute(
          'data-product-variant-media',
          productVariantMedia + '&width=100'
        );
      }
    }

    // Check if quantity rules, price-per-item, or add-to-cart are appearing/disappearing (causes layout shift)
    const {
      quantityRules,
      pricePerItem,
      quantitySelector,
      productFormButtons,
      quantityLabel,
      quantitySelectorWrapper,
    } = this.refs;

    // Update quantity selector's min/max/step attributes and cart quantity for the new variant
    const newQuantityInput = /** @type {HTMLInputElement | null} */ (
      event.detail.data.html.querySelector('quantity-selector-component input[ref="quantityInput"]')
    );

    if (quantitySelector?.updateConstraints && newQuantityInput) {
      quantitySelector.updateConstraints(newQuantityInput.min, newQuantityInput.max || null, newQuantityInput.step);
    }

    const newQuantityRules = event.detail.data.html.querySelector('.quantity-rules');
    const isQuantityRulesChanging = !!quantityRules !== !!newQuantityRules;

    const newPricePerItem = event.detail.data.html.querySelector('price-per-item');
    const isPricePerItemChanging = !!pricePerItem !== !!newPricePerItem;

    if ((isQuantityRulesChanging || isPricePerItemChanging) && quantitySelector) {
      // Store quantity value before morphing entire container
      const currentQuantityValue = quantitySelector.getValue?.();

      const newProductFormButtons = event.detail.data.html.querySelector('.product-form-buttons');

      if (productFormButtons && newProductFormButtons) {
        morph(productFormButtons, newProductFormButtons);

        // Get the NEW quantity selector after morphing and update its constraints
        const newQuantityInputElement = /** @type {HTMLInputElement | null} */ (
          event.detail.data.html.querySelector('quantity-selector-component input[ref="quantityInput"]')
        );

        if (this.refs.quantitySelector?.updateConstraints && newQuantityInputElement && currentQuantityValue) {
          // Temporarily set the old value so updateConstraints can snap it properly
          this.refs.quantitySelector.setValue(currentQuantityValue);
          // updateConstraints will snap to valid increment if needed
          this.refs.quantitySelector.updateConstraints(
            newQuantityInputElement.min,
            newQuantityInputElement.max || null,
            newQuantityInputElement.step
          );
        }
      }
    } else {
      // Update elements individually when layout isn't changing
      /** @type {Array<[string, HTMLElement | undefined, HTMLElement | undefined]>} */
      const morphTargets = [
        ['.quantity-label', quantityLabel, quantitySelector],
        ['.quantity-rules', quantityRules, this.refs.productFormButtons],
        ['price-per-item', pricePerItem, quantitySelectorWrapper],
      ];

      for (const [selector, currentElement, fallback] of morphTargets) {
        this.#morphOrUpdateElement(currentElement, event.detail.data.html.querySelector(selector), fallback);
      }
    }

    // Morph volume pricing if it exists
    const currentVolumePricing = this.refs.volumePricing;
    const newVolumePricing = event.detail.data.html.querySelector('volume-pricing');
    this.#morphOrUpdateElement(currentVolumePricing, newVolumePricing, this.refs.productFormButtons);

    const hasB2BFeatures =
      quantityRules || newQuantityRules || pricePerItem || newPricePerItem || currentVolumePricing || newVolumePricing;

    if (!hasB2BFeatures) return;

    // Fetch and update cart quantity for the new variant
    await this.#fetchAndUpdateCartQuantity();
  };

  /** @param {import('./events').VariantSelectedEvent} _event */
  #onVariantSelected = (_event) => {
    this.#variantChangeInProgress = true;
  };
}

if (!customElements.get('product-form-component')) {
  customElements.define('product-form-component', ProductFormComponent);
}
