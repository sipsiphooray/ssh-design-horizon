import { Component } from '@theme/component';
import { fetchConfig, preloadImage, onAnimationEnd, yieldToMainThread, parseIntOrDefault } from '@theme/utilities';
import { cartPerformance } from '@theme/performance';
import { morph } from '@theme/morph';
import { CartLinesUpdateEvent, CartErrorEvent, ProductSelectEvent, StandardEvents } from '@shopify/events';
import { resolveVariantId } from '@theme/variant-resolution';
// Store customizations: legacy theme events consumed by custom.js / addon-products.js / cart-upsell.js,
// buy-button price sync, and addon (parent_id) cart submissions.
import { ThemeEvents, PriceChangeEvent, VariantUpdateEvent, CartAddEvent } from '@theme/events';
import { formatMoney } from '@theme/money-formatting';

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
 * @typedef {object} QueuedAddToCartItem
 * @property {number} quantity - The quantity captured when Add was clicked.
 * @property {number} generation - The variant-change generation active when Add was clicked.
 * @property {string | null} intendedVariantId - The selected option's data-variant-id, when present.
 * @property {Promise<unknown> | null} pendingVariantChange - The server-side section fetch for the clicked selection.
 * @property {string | null} variantResolutionUrl - A section-rendering URL that resolves the clicked selection.
 *
 * @typedef {object} QuantityConstraints
 * @property {string} min
 * @property {string | null} max
 * @property {string} step
 * @property {string | null} cartQuantity
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

  /** @type {number} */
  #variantChangeGeneration = 0;

  /**
   * Adds queued while a variant change is in flight. Each entry captures the selection state and
   * generation active when Add was clicked, then resolves that selection at drain time.
   * @type {QueuedAddToCartItem[]}
   */
  #addToCartQueue = [];

  /**
   * The in-flight variant-change section fetch promise. The queue drain awaits this before
   * reading the resolved variant id.
   * @type {Promise<unknown> | null}
   */
  #pendingVariantChange = null;

  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#abortController;
    const target = this.closest('.shopify-section, dialog, product-card');
    target?.addEventListener(StandardEvents.productSelect, this.#onProductSelect, { signal });

    // Listen for cart updates to sync data-cart-quantity
    document.addEventListener(StandardEvents.cartLinesUpdate, this.#onCartUpdate, { signal });

    // Store customization: keep buy-button line total and product price in sync with quantity
    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#onQuantitySelectorUpdateForPrices, { signal });
    requestAnimationFrame(() => this.#syncQuantityDependentPrices());
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
  }

  #getVariantIdInput() {
    return /** @type {HTMLInputElement | null} */ (this.querySelector('input[name="id"]'))?.value;
  }

  async #refreshCart() {
    /** @type {import('@theme/component-cart-items').CartItemsComponent | null} */
    const cartItemsComponent = document.querySelector('cart-items-component');

    if (cartItemsComponent) {
      await customElements.whenDefined('cart-items-component');
      return cartItemsComponent.fetchCartData();
    }

    // Fallback for pages without cart-items-component (e.g. page-based cart on product pages)
    return fetch(`${Theme.routes.cart_url}.json`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`Failed to fetch cart: ${response.status}`);
      return response.json();
    });
  }

  /**
   * Updates quantity selector with cart data for current variant
   * @param {Cart} cart - The cart object with items array
   */
  #updateCartQuantity(cart) {
    const variantIdInput = this.#getVariantIdInput();
    if (!variantIdInput) return;

    const cartItem = cart.items.find(
      /** @param {any} item */
      (item) => item.variant_id.toString() === variantIdInput.toString()
    );
    const cartQty = cartItem ? cartItem.quantity : 0;

    // Use public API to update quantity selector
    const quantitySelector =
      /** @type {import('@theme/component-cart-quantity-selector').CartQuantitySelectorComponent | null} */ (
        this.querySelector('quantity-selector-component')
      );

    if (quantitySelector?.setCartQuantity) {
      quantitySelector.setCartQuantity(cartQty);
    }

    // Update quantity label if it exists
    this.#updateQuantityLabel(cartQty);
  }

  /**
   * Updates data-cart-quantity when cart is updated from elsewhere
   * @param {CartLinesUpdateEvent} event
   */
  #onCartUpdate = async (event) => {
    if (!this.#getVariantIdInput()) return;

    event.promise
      ?.then(({ detail }) => {
        // Skip if this event came from this component
        if (detail?.sourceId === this.id || detail?.source === 'product-form-component') return;

        if (detail?.items) {
          this.#updateCartQuantity(/** @type {Cart} */ ({ items: detail.items }));
        } else {
          this.#refreshCart().then((cart) => this.#updateCartQuantity(cart));
        }
        this.#syncQuantityDependentPrices();
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[product-form] Event promise rejected:', error);
      });
  };

  /** @param {Event} event */
  handleSubmit(event) {
    event.preventDefault();

    if (this.#variantChangeInProgress) {
      this.#addToCartQueue.push(this.#createQueuedAddToCartItem());
      this.refs.addToCartButtonContainer?.animateAddToCart?.();
      return;
    }

    this.#processAddToCart(undefined, undefined, event);
  }

  /** @returns {number} */
  #getQuantity() {
    return Number(this.refs.quantitySelector?.getValue?.()) || Number(this.dataset.quantityDefault) || 1;
  }

  /** @returns {QueuedAddToCartItem} */
  #createQueuedAddToCartItem() {
    const picker = this.#getVariantPicker();
    const selectedOption = picker?.selectedOption;

    return {
      quantity: this.#getQuantity(),
      generation: this.#variantChangeGeneration,
      intendedVariantId: selectedOption?.dataset.variantId ?? null,
      pendingVariantChange: this.#pendingVariantChange,
      variantResolutionUrl: picker && selectedOption ? picker.buildRequestUrl(selectedOption) : null,
    };
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
          if (textNode) {
            textNode.textContent = errorMessage;
          } else {
            const newTextNode = document.createTextNode(errorMessage);
            addToCartTextError.appendChild(newTextNode);
          }

          this.#setLiveRegionText(errorMessage);

          if (this.#timeout) clearTimeout(this.#timeout);
          this.#timeout = setTimeout(() => {
            if (!addToCartTextError) return;
            addToCartTextError.classList.add('hidden');
            this.#clearLiveRegionText();
          }, ERROR_MESSAGE_DISPLAY_DURATION);
        }

        setTimeout(() => {
          for (const container of allAddToCartContainers) {
            container.enable();
          }
        }, ERROR_BUTTON_REENABLE_DELAY);

        return;
      }
    }

    // Store customization: use let so the addon logic below can rebuild the payload
    let formData = new FormData(form);

    if (overrideVariantId) {
      formData.set('id', overrideVariantId);
    }
    if (overrideQuantity !== undefined) {
      formData.set('quantity', overrideQuantity.toString());
    }

    // --- Store customization: ADDON LOGIC WITH PARENT_ID START ---
    const mainVariantId = /** @type {string} */ (formData.get('id')?.toString() || '');
    const mainQuantity = formData.get('quantity')?.toString() || this.dataset.quantityDefault || '1';
    let totalQuantityAdded = Number(mainQuantity) || 1;

    /** @type {Array<{id: string, quantity: number, parent_id: string, properties: Record<string, string>}>} */
    const addonItems = [];
    for (const [key, value] of formData.entries()) {
      // Find our checkbox addons
      if (key.startsWith('addon-') && value) {
        addonItems.push({
          id: value.toString(),
          quantity: 1, // Default addon quantity
          parent_id: mainVariantId,
          properties: {
            _parentProduct: mainVariantId,
          },
        });
      }
    }

    // If addons are checked, reconstruct formData into Shopify's multi-item array format
    if (addonItems.length > 0) {
      const itemsFormData = new FormData();
      totalQuantityAdded += addonItems.length;

      // 1. Add main product as items[0]
      itemsFormData.append('items[0][id]', mainVariantId);
      itemsFormData.append('items[0][quantity]', mainQuantity);

      // Extract and attach properties to main product if they exist
      for (const [key, value] of formData.entries()) {
        const propMatch = key.match(/^properties\[(.+)]$/);
        if (propMatch && propMatch[1]) {
          itemsFormData.append(`items[0][properties][${propMatch[1]}]`, value.toString());
        }
      }

      // 2. Add selected addon items with parent linking as items[1], items[2], etc.
      addonItems.forEach((addon, index) => {
        itemsFormData.append(`items[${index + 1}][id]`, addon.id);
        itemsFormData.append(`items[${index + 1}][quantity]`, addon.quantity.toString());

        if (addon.parent_id) {
          itemsFormData.append(`items[${index + 1}][parent_id]`, addon.parent_id);
        }

        Object.entries(addon.properties).forEach(([propKey, propValue]) => {
          itemsFormData.append(`items[${index + 1}][properties][${propKey}]`, propValue.toString());
        });
      });

      // 3. Copy other necessary form data (sections) while ignoring old ids/quantities
      for (const [key, value] of formData.entries()) {
        if (key !== 'id' && key !== 'quantity' && !key.startsWith('properties[') && !key.startsWith('addon-')) {
          itemsFormData.append(key, value);
        }
      }

      formData = itemsFormData; // Override original formData
    }
    // --- Store customization: ADDON LOGIC WITH PARENT_ID END ---

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    let cartItemComponentsSectionIds = [];
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        cartItemComponentsSectionIds.push(item.dataset.sectionId);
      }
      formData.append('sections', cartItemComponentsSectionIds.join(','));
    });

    const itemCount = totalQuantityAdded;
    const deferredEventPromise = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: [
          {
            merchandiseId: mainVariantId,
            quantity: Number(mainQuantity) || 1,
          },
          ...addonItems.map((addon) => ({
            merchandiseId: addon.id,
            quantity: addon.quantity,
          })),
        ],
        promise: deferredEventPromise.promise,
      })
    );

    const fetchCfg = fetchConfig('javascript', { body: formData });

    fetch(Theme.routes.cart_add_url, {
      ...fetchCfg,
      headers: {
        ...fetchCfg.headers,
        Accept: 'text/html',
      },
    })
      .then((response) => response.json())
      .then(async (response) => {
        if (response.status) {
          this.dispatchEvent(
            new CartErrorEvent({
              error: response.message || 'Add to cart failed',
              code: 'INVALID',
              detail: {
                description: response.description,
                errors: response.errors,
              },
            })
          );

          // Fetch the updated cart to get the actual total quantity for this variant
          this.#refreshCart()
            .then((ajaxCart) =>
              deferredEventPromise.resolve({
                cart: CartLinesUpdateEvent.createCartFromAjaxResponse(ajaxCart),
                detail: {
                  didError: true,
                  items: ajaxCart.items,
                  source: 'product-form-component',
                  sourceId: this.id.toString(),
                  itemCount,
                  productId: this.dataset.productId,
                },
              })
            )
            .catch(deferredEventPromise.reject);

          // Store customization: legacy cart:update event for pre-v4 listeners.
          // When we add more than the maximum amount of items to the cart, we still dispatch it
          // because our back-end still adds the max allowed amount to the cart.
          this.dispatchEvent(
            new CartAddEvent({}, this.id, {
              didError: true,
              source: 'product-form-component',
              itemCount: totalQuantityAdded,
              productId: this.dataset.productId,
            })
          );

          if (!addToCartTextError) return;
          addToCartTextError.classList.remove('hidden');

          // Reuse the text node if the user is spam-clicking
          const textNode = addToCartTextError.childNodes[2];
          if (textNode) {
            textNode.textContent = response.message;
          } else {
            const newTextNode = document.createTextNode(response.message);
            addToCartTextError.appendChild(newTextNode);
          }

          // Create or get existing error live region for screen readers
          this.#setLiveRegionText(response.message);

          this.#timeout = setTimeout(() => {
            if (!addToCartTextError) return;
            addToCartTextError.classList.add('hidden');

            // Clear the announcement
            this.#clearLiveRegionText();
          }, ERROR_MESSAGE_DISPLAY_DURATION);

          return;
        } else {
          // Store customization: formData may have been rebuilt into items[] format (addons),
          // so read the id captured before reconstruction.
          const id = mainVariantId;

          if (addToCartTextError) {
            addToCartTextError.classList.add('hidden');
            addToCartTextError.removeAttribute('aria-live');
          }

          if (!id) throw new Error('Form ID is required');

          // Add aria-live region to inform screen readers that the item was added
          // Get the added text from any add-to-cart button
          const anyAddToCartButton = allAddToCartContainers[0]?.refs.addToCartButton;
          if (anyAddToCartButton) {
            const addedTextElement = anyAddToCartButton.querySelector('.add-to-cart-text--added');
            const addedText = addedTextElement?.textContent?.trim() || Theme.translations.added;

            this.#setLiveRegionText(addedText);

            setTimeout(() => {
              this.#clearLiveRegionText();
            }, SUCCESS_MESSAGE_DISPLAY_DURATION);
          }

          // Fetch the updated cart to get the actual total quantity for this variant
          const cart = await this.#refreshCart()
            .then((ajaxCart) => {
              deferredEventPromise.resolve({
                cart: CartLinesUpdateEvent.createCartFromAjaxResponse(ajaxCart),
                detail: {
                  items: ajaxCart.items,
                  source: 'product-form-component',
                  sourceId: this.id.toString(),
                  itemCount,
                  productId: this.dataset.productId,
                  sections: response.sections,
                  didError: false,
                },
              });

              if (this.#getVariantIdInput()) {
                this.#updateCartQuantity(ajaxCart);
              }

              // Store customization: legacy cart:update event for pre-v4 listeners
              // (cart-upsell.js, custom.js protection buttons, addon-products.js).
              this.dispatchEvent(
                new CartAddEvent({}, id.toString(), {
                  source: 'product-form-component',
                  itemCount: totalQuantityAdded,
                  productId: this.dataset.productId,
                  sections: response.sections,
                })
              );

              return ajaxCart;
            })
            .catch(deferredEventPromise.reject);
        }
      })
      .catch((error) => {
        console.error(error);
        deferredEventPromise.reject(error);

        this.dispatchEvent(
          new CartErrorEvent({
            error: error?.message || 'Network error during add to cart',
            code: 'SERVICE_UNAVAILABLE',
          })
        );
      })
      .finally(() => {
        if (event) {
          cartPerformance.measureFromEvent('add:user-action', event);
        }
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

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const deferredEventPromise = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: items.map((item) => ({
          merchandiseId: item.variantId,
          quantity: item.quantity,
        })),
        promise: deferredEventPromise.promise,
      })
    );

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
            new CartErrorEvent({
              error: response.message || 'Add to cart failed',
              code: 'INVALID',
              detail: {
                description: response.description,
                errors: response.errors,
              },
            })
          );

          this.#refreshCart()
            .then((ajaxCart) =>
              deferredEventPromise.resolve({
                cart: CartLinesUpdateEvent.createCartFromAjaxResponse(ajaxCart),
                detail: {
                  didError: true,
                  items: ajaxCart.items,
                  source: 'product-form-component',
                  sourceId: this.id.toString(),
                  itemCount: totalQuantity,
                  productId: this.dataset.productId,
                },
              })
            )
            .catch(deferredEventPromise.reject);

          if (!addToCartTextError) return;
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

        const cart = await this.#refreshCart();
        deferredEventPromise.resolve({
          cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
          detail: {
            items: cart.items,
            source: 'product-form-component',
            sourceId: this.id.toString(),
            itemCount: totalQuantity,
            productId: this.dataset.productId,
            sections: response.sections,
            didError: false,
          },
        });
        this.#updateCartQuantity(cart);

        // Store customization: legacy cart:update event for pre-v4 listeners
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
        deferredEventPromise.reject(error);

        this.dispatchEvent(
          new CartErrorEvent({
            error: error?.message || 'Network error during add to cart',
            code: 'SERVICE_UNAVAILABLE',
          })
        );
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
   * Store customization: keeps add-to-cart line total, main product-price block, and addon totals in
   * sync with quantity.
   * @param {Event} event
   */
  #onQuantitySelectorUpdateForPrices = (event) => {
    if (event.type !== ThemeEvents.quantitySelectorUpdate) return;
    const ce = /** @type {CustomEvent<{ quantity?: number; cartLine?: number }>} */ (event);
    if (ce.detail?.cartLine != null) return;
    if (!(event.target instanceof Node) || !this.contains(event.target)) return;
    this.#syncQuantityDependentPrices();
  };

  /**
   * Store customization: updates button + block prices from unit data attributes and current
   * quantity; refreshes addon PriceChangeEvent.
   */
  #syncQuantityDependentPrices() {
    const priceEl = /** @type {HTMLElement | null} */ (this.querySelector('.total-price-display[data-price]'));
    if (!priceEl) return;

    const qty = Math.max(1, this.#getQuantity() || 1);
    const unit = Number(priceEl.dataset.unitPrice || priceEl.dataset.price);
    if (!Number.isFinite(unit) || unit < 0) return;

    const unitCompare = Number(priceEl.dataset.unitCompareAt || 0);
    const saleTotal = Math.round(unit * qty);
    const compareTotal = unitCompare > unit ? Math.round(unitCompare * qty) : 0;

    priceEl.dataset.price = String(saleTotal);

    const currency = priceEl.dataset.currency || window.Shopify?.currency?.active || 'USD';
    const moneyFormat = /** @type {{ theme?: { moneyFormat?: string } }} */ (window).theme?.moneyFormat || '${{amount}}';
    priceEl.textContent = formatMoney(saleTotal, moneyFormat, currency);

    const section = this.closest('.shopify-section');
    const productId = this.dataset.productId;
    const pp =
      section && productId
        ? /** @type {HTMLElement | null} */ (section.querySelector(`product-price[data-product-id="${productId}"]`))
        : null;

    if (pp && !pp.querySelector('[ref="volumePricingNote"]')) {
      const container = pp.querySelector('[ref="priceContainer"]');
      const priceSpan = container?.querySelector('.price');
      const compareSpan = container?.querySelector('.compare-at-price');
      if (priceSpan) priceSpan.textContent = formatMoney(saleTotal, moneyFormat, currency);
      if (compareSpan instanceof HTMLElement) {
        if (compareTotal > saleTotal) {
          compareSpan.textContent = formatMoney(compareTotal, moneyFormat, currency);
          compareSpan.hidden = false;
        } else {
          compareSpan.textContent = '';
          compareSpan.hidden = true;
        }
      }
    }

    document.dispatchEvent(new PriceChangeEvent(this));
  }

  /**
   * Store customization: section HTML can include several `product-form-component` nodes
   * (quick-add, upsells). Queries must target the main buy-buttons form for this product, not the
   * first match in the document.
   *
   * @param {Document | ParentNode} doc
   * @returns {ParentNode}
   */
  #getFetchedProductFormRoot(doc) {
    const productId = this.dataset.productId;
    if (!productId) return doc;
    const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(productId)) : String(productId);
    const mainForm = doc.querySelector(
      `product-form-component[data-product-id="${id}"]:not(.quick-add__product-form-component)`
    );
    return mainForm ?? doc;
  }

  /**
   * Store customization: Klaviyo BIS mutates the add-to-cart button after load; morphing its
   * children removes that markup. Fire hooks and best-effort global reinits (embed APIs vary by
   * version).
   */
  #notifyKlaviyoBisAfterCartButtonMorph() {
    const variantId = this.refs.variantId?.value ?? '';
    const run = () => {
      document.dispatchEvent(
        new CustomEvent('variant:change', {
          bubbles: true,
          detail: { variantId },
        })
      );
      document.dispatchEvent(
        new CustomEvent('klaviyo-bis:dom-updated', {
          bubbles: true,
          detail: { variantId },
        })
      );

      const w = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window));
      /**
       * @param {unknown} obj
       * @param {string} method
       */
      const tryCall = (obj, method) => {
        if (obj != null && typeof obj === 'object' && method in obj) {
          const fn = /** @type {Record<string, unknown>} */ (obj)[method];
          if (typeof fn === 'function') {
            try {
              /** @type {(this: unknown) => void} */ (fn).call(obj);
              return true;
            } catch {
              /* embed API varies */
            }
          }
        }
        return false;
      };

      for (const key of ['_klaviyo', '_klaviyoOnsite', 'KlaviyoOnsite', 'klaviyoOnsite', 'klaviyo', '__klaviyo']) {
        const mod = w[key];
        if (tryCall(mod, 'init')) break;
        if (tryCall(mod, 'reload')) break;
        if (tryCall(mod, 'refresh')) break;
      }
    };

    queueMicrotask(() => requestAnimationFrame(run));
    setTimeout(run, 200);
  }

  /**
   * @param {ProductSelectEvent} event
   */
  #onProductSelect = async (event) => {
    // Skip events from product-cards when this form is at the section level
    const sourceCard = /** @type {Element | null} */ (event.target)?.closest('product-card');
    if (sourceCard && !sourceCard.contains(this)) return;

    // Store customization: ignore variant selections that originate inside an addon card
    if (event.target instanceof Element && event.target.closest('.addon-card')) return;

    // Track generation to prevent a stale (aborted) call from clearing the flag
    // while a newer variant selection is still pending.
    const generation = ++this.#variantChangeGeneration;
    this.#variantChangeInProgress = true;
    // Hold the in-flight section-fetch promise so the queue drain can await it before reading the
    // resolved variant id.
    this.#pendingVariantChange = event.promise;

    try {
      const { detail } = await event.promise;
      if (!detail?.html) return;

      const { html, newProduct, productId, resource } = detail;

      // Update product context if new product loaded (combined listing)
      if (newProduct) {
        this.dataset.productId = newProduct.id;
      } else if (productId && productId !== this.dataset.productId) {
        return;
      }

      const { variantId } = this.refs;
      variantId.value = resource?.id ?? '';

      const { addToCartButtonContainer: currentAddToCartButtonContainer, acceleratedCheckoutButtonContainer } =
        this.refs;
      const currentAddToCartButton = currentAddToCartButtonContainer?.refs.addToCartButton;

      // Update state and text for add-to-cart button
      if (!currentAddToCartButtonContainer || (!currentAddToCartButton && !acceleratedCheckoutButtonContainer)) return;

      // Update the button state
      if (resource == null || resource.available == false) {
        currentAddToCartButtonContainer.disable();
      } else {
        currentAddToCartButtonContainer.enable();
      }

      // Store customization: scope fetched-HTML queries to this product's main form (section HTML
      // can contain quick-add / upsell product-form-components for other products).
      const fetchedRoot = this.#getFetchedProductFormRoot(html);
      const newAddToCartButton = fetchedRoot.querySelector('[ref="addToCartButton"]');
      if (newAddToCartButton && currentAddToCartButton) {
        morph(currentAddToCartButton, newAddToCartButton);
      }

      if (currentAddToCartButton?.classList.contains('klaviyo-bis-trigger')) {
        this.#notifyKlaviyoBisAfterCartButtonMorph();
      }

      if (acceleratedCheckoutButtonContainer) {
        if (resource == null || resource.available == false) {
          acceleratedCheckoutButtonContainer?.setAttribute('hidden', 'true');
        } else {
          acceleratedCheckoutButtonContainer?.removeAttribute('hidden');
        }
      }

      // Set the data attribute for the product variant media if it exists
      if (resource) {
        const productVariantMedia = resource.featured_media?.preview_image?.src;
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
        fetchedRoot.querySelector('quantity-selector-component input[ref="quantityInput"]')
      );

      if (quantitySelector?.updateConstraints && newQuantityInput) {
        quantitySelector.updateConstraints(newQuantityInput.min, newQuantityInput.max || null, newQuantityInput.step);
        // Keep data-quantity-default attribute in sync with new variant's minimum quantity
        this.dataset.quantityDefault = newQuantityInput.min || '1';
      }

      const newQuantityRules = fetchedRoot.querySelector('.quantity-rules');
      const isQuantityRulesChanging = !!quantityRules !== !!newQuantityRules;

      const newPricePerItem = fetchedRoot.querySelector('price-per-item');
      const isPricePerItemChanging = !!pricePerItem !== !!newPricePerItem;

      if ((isQuantityRulesChanging || isPricePerItemChanging) && quantitySelector) {
        // Store quantity value before morphing entire container
        const currentQuantityValue = quantitySelector.getValue?.();

        const newProductFormButtons = fetchedRoot.querySelector('.product-form-buttons');

        if (productFormButtons && newProductFormButtons) {
          morph(productFormButtons, newProductFormButtons);

          // Get the NEW quantity selector after morphing and update its constraints
          const newQuantityInputElement = /** @type {HTMLInputElement | null} */ (
            fetchedRoot.querySelector('quantity-selector-component input[ref="quantityInput"]')
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
            // Keep data-quantity-default attribute in sync with new variant's minimum quantity
            this.dataset.quantityDefault = newQuantityInputElement.min || '1';
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
          this.#morphOrUpdateElement(currentElement, fetchedRoot.querySelector(selector), fallback);
        }
      }

      // Morph volume pricing if it exists
      const currentVolumePricing = this.refs.volumePricing;
      const newVolumePricing = fetchedRoot.querySelector('volume-pricing');
      this.#morphOrUpdateElement(currentVolumePricing, newVolumePricing, this.refs.productFormButtons);

      const hasB2BFeatures =
        quantityRules ||
        newQuantityRules ||
        pricePerItem ||
        newPricePerItem ||
        currentVolumePricing ||
        newVolumePricing;

      if (hasB2BFeatures) {
        // Fetch and update cart quantity for the new variant
        this.#refreshCart().then((cart) => this.#updateCartQuantity(cart));
      }

      // Store customization: re-sync quantity-dependent prices after the buy button was morphed
      this.#syncQuantityDependentPrices();

      // Store customization: re-dispatch the legacy variant:update event for pre-v4 listeners
      // (custom.js free-shipping message, addon price sync, xb-product-variant attributes).
      const legacyEventTarget = event.target instanceof Element ? event.target : this;
      legacyEventTarget.dispatchEvent(
        new VariantUpdateEvent(resource ?? null, this.id ?? '', {
          html,
          productId: this.dataset.productId,
          newProduct,
        })
      );
    } finally {
      // Only clear the flag if no newer variant selection has started
      if (generation === this.#variantChangeGeneration) {
        this.#variantChangeInProgress = false;

        // Drain any queued add-to-cart requests that accumulated during the variant change
        await this.#drainAddToCartQueue();
      }
    }
  };

  /**
   * Drains the add-to-cart queue accumulated while a variant change was in flight.
   *
   * Each queued add resolves against the selection and generation that were active when Add was
   * clicked. If no variant resolves, that queued add is aborted so a stale, empty, or maxed
   * variant id is never sent. The add-to-cart button is already disabled for unavailable
   * selections in #onProductSelect, so no further UI change is needed.
   */
  async #drainAddToCartQueue() {
    if (this.#addToCartQueue.length === 0) return;

    const queuedItems = [...this.#addToCartQueue];
    this.#addToCartQueue = [];

    /** @type {Array<{variantId: string, quantity: number}>} */
    const resolvedItems = [];
    for (const item of queuedItems) {
      const resolvedItem = await this.#resolveQueuedAddToCartItem(item);
      if (resolvedItem) {
        resolvedItems.push(resolvedItem);
      }
    }

    this.#processBatchAddToCart(resolvedItems);
  }

  /**
   * @param {QueuedAddToCartItem} item
   * @returns {Promise<{variantId: string, quantity: number} | null>}
   */
  async #resolveQueuedAddToCartItem(item) {
    const { variantId, quantityConstraints } = await this.#resolveQueuedVariant(item);
    if (!variantId) return null;

    return {
      variantId,
      quantity: this.#normalizeQueuedQuantity(item.quantity, quantityConstraints),
    };
  }

  /**
   * @param {QueuedAddToCartItem} item
   * @returns {Promise<{variantId: string | null, quantityConstraints: QuantityConstraints | null}>}
   */
  async #resolveQueuedVariant(item) {
    /** @type {string | null} */
    let resolvedVariantId = null;
    /** @type {boolean | undefined} */
    let available;
    /** @type {QuantityConstraints | null} */
    let quantityConstraints = null;

    if (item.pendingVariantChange) {
      try {
        const result = /** @type {{detail?: {resource?: any, html?: Document | Element}}} */ (
          await item.pendingVariantChange
        );
        const resource = result?.detail?.resource;
        quantityConstraints = this.#getQuantityConstraintsFromHtml(result?.detail?.html);
        if (resource === null) {
          available = false;
        } else if (resource) {
          resolvedVariantId = resource.id != null ? String(resource.id) : null;
          available = resource.available !== false;
        }
      } catch {
        const resolvedVariant = await this.#resolveVariantFromUrl(item.variantResolutionUrl).catch(() => ({
          variantId: null,
          available: false,
          quantityConstraints: null,
        }));
        resolvedVariantId = resolvedVariant.variantId;
        available = resolvedVariant.available;
        quantityConstraints = resolvedVariant.quantityConstraints;
      }
    }

    const isLatestGeneration = item.generation === this.#variantChangeGeneration;
    const variantId = resolveVariantId({
      resolvedVariantId,
      intendedVariantId: item.intendedVariantId,
      hiddenInputValue: isLatestGeneration ? this.#getVariantIdInput() ?? null : null,
      available: available ?? (isLatestGeneration ? !this.#isAddToCartDisabled() : undefined),
    });

    return { variantId, quantityConstraints };
  }

  /**
   * @param {number} quantity
   * @param {QuantityConstraints | null} quantityConstraints
   * @returns {number}
   */
  #normalizeQueuedQuantity(quantity, quantityConstraints) {
    if (!quantityConstraints) return quantity;

    const min = parseIntOrDefault(quantityConstraints.min, 1);
    const max = parseIntOrDefault(quantityConstraints.max, null);
    const step = parseIntOrDefault(quantityConstraints.step, 1);
    const cartQuantity = parseIntOrDefault(quantityConstraints.cartQuantity, 0);
    const effectiveMax = max === null ? null : Math.max(max - cartQuantity, min);

    let normalizedQuantity = quantity;
    if ((quantity - min) % step !== 0) {
      normalizedQuantity = min + Math.floor((quantity - min) / step) * step;
    }

    return Math.max(min, Math.min(effectiveMax ?? Infinity, normalizedQuantity));
  }

  /**
   * @param {Document | Element | null | undefined} html
   * @returns {QuantityConstraints | null}
   */
  #getQuantityConstraintsFromHtml(html) {
    const quantityInput = /** @type {HTMLInputElement | null} */ (
      html?.querySelector?.('quantity-selector-component input[ref="quantityInput"]') ?? null
    );
    if (!quantityInput) return null;

    return {
      min: quantityInput.min,
      max: quantityInput.max || null,
      step: quantityInput.step,
      cartQuantity: quantityInput.getAttribute('data-cart-quantity'),
    };
  }

  /**
   * Resolves a queued selection using the server-side section renderer when the original in-flight
   * request was aborted by a later variant selection.
   * @param {string | null} variantResolutionUrl
   * @returns {Promise<{variantId: string | null, available: boolean | undefined, quantityConstraints: QuantityConstraints | null}>}
   */
  async #resolveVariantFromUrl(variantResolutionUrl) {
    if (!variantResolutionUrl) return { variantId: null, available: undefined, quantityConstraints: null };

    const response = await fetch(variantResolutionUrl, { credentials: 'same-origin' });
    if (!response.ok) return { variantId: null, available: false, quantityConstraints: null };

    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    const quantityConstraints = this.#getQuantityConstraintsFromHtml(html);
    const textContent = html.querySelector('variant-picker script[type="application/json"]')?.textContent;
    if (!textContent) return { variantId: null, available: false, quantityConstraints };

    const resource = JSON.parse(textContent);
    if (!resource || typeof resource !== 'object') return { variantId: null, available: false, quantityConstraints };

    return {
      variantId: resource.id != null ? String(resource.id) : null,
      available: resource.available !== false,
      quantityConstraints,
    };
  }

  /**
   * @returns {import('@theme/variant-picker').default | null}
   */
  #getVariantPicker() {
    const container = this.closest('product-card') ?? this.closest('dialog') ?? this.closest('.shopify-section');
    const pickers = /** @type {import('@theme/variant-picker').default[]} */ (
      Array.from(container?.querySelectorAll('variant-picker, swatches-variant-picker-component') ?? [])
    );
    const productId = this.dataset.productId;

    if (productId) {
      const matchingPicker = pickers.find((picker) => picker.dataset.productId === productId);
      if (matchingPicker) return matchingPicker;
    }

    return pickers.length === 1 ? pickers[0] ?? null : null;
  }

  /**
   * Whether the current selection's add-to-cart button is disabled (unavailable selection).
   * @returns {boolean}
   */
  #isAddToCartDisabled() {
    const containers = /** @type {NodeListOf<AddToCartComponent>} */ (this.querySelectorAll('add-to-cart-component'));
    return Array.from(containers).some((container) => container.refs.addToCartButton?.disabled);
  }
}

if (!customElements.get('product-form-component')) {
  customElements.define('product-form-component', ProductFormComponent);
}
