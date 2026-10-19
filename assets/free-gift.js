/**
 * Free gift with purchase.
 *
 * Settings live in the theme editor (Theme settings > Free gift with purchase):
 * on/off, the gift product, and the minimum cart subtotal. The gift is a $0
 * product carrying the real accessory SKU, so no discount is involved.
 *
 * Whenever the cart changes this keeps exactly one gift line in the cart while
 * the cart qualifies, and removes it when it stops qualifying, when the gift
 * product changes, or when the feature is switched off. Gift lines are marked
 * with the hidden line property `_free_gift`, so a gift left over from an
 * earlier week is still recognised and removed. After the optional "last day"
 * (YYYY-MM-DD, shopper's local date) the feature counts as switched off.
 */
import { CartLinesUpdateEvent, StandardEvents } from '@shopify/events';

const config = JSON.parse(document.getElementById('free-gift-config')?.textContent || '{}');
const GIFT_PROP = '_free_gift';
let busy = false;

const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
const expired = /^\d{4}-\d{2}-\d{2}$/.test(config.lastDay || '') && today > config.lastDay;

const isGiftLine = (item) => item.properties && item.properties[GIFT_PROP];

function sectionIds() {
  return Array.from(document.querySelectorAll('cart-items-component'))
    .map((el) => el instanceof HTMLElement && el.dataset.sectionId)
    .filter(Boolean)
    .join(',');
}

async function getCart() {
  const r = await fetch(`${Theme.routes.cart_url}.js`, { headers: { Accept: 'application/json' } });
  return r.json();
}

/** Post to the cart API and tell the theme, so the drawer and cart page redraw. */
async function cartRequest(url, body, action, lines) {
  const deferred = CartLinesUpdateEvent.createPromise();
  document.dispatchEvent(
    new CartLinesUpdateEvent({ action, context: 'cart', lines, promise: deferred.promise })
  );
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...body, sections: sectionIds(), sections_url: window.location.pathname }),
    });
    const res = await r.json();
    if (res.status || res.errors) throw new Error(res.description || res.message || 'free gift cart error');
    const cart = res.items && res.token ? res : await getCart();
    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
      detail: { sections: res.sections, items: cart.items, itemCount: cart.item_count, source: 'free-gift', didError: false },
    });
  } catch (error) {
    deferred.reject(error);
    console.warn('[free-gift]', error);
  }
}

async function reconcile() {
  if (busy) return;
  busy = true;
  try {
    const cart = await getCart();
    const giftLines = cart.items.filter(isGiftLine);
    const paidSubtotal = cart.items.filter((i) => !isGiftLine(i)).reduce((s, i) => s + i.final_line_price, 0);
    const qualifies =
      config.enabled && !expired && config.variantId && cart.items.some((i) => !isGiftLine(i)) && paidSubtotal >= config.minimum;

    for (const line of giftLines) {
      const keep = qualifies && line.variant_id === config.variantId;
      if (!keep || line.quantity !== 1) {
        await cartRequest(`${Theme.routes.cart_change_url}.js`, { id: line.key, quantity: keep ? 1 : 0 },
          keep ? 'update' : 'remove', [{ id: line.key, quantity: keep ? 1 : 0 }]);
        return; // the cart event we just sent runs reconcile again
      }
    }
    if (qualifies && !giftLines.some((l) => l.variant_id === config.variantId)) {
      await cartRequest(Theme.routes.cart_add_url,
        { items: [{ id: config.variantId, quantity: 1, properties: { [GIFT_PROP]: 'yes' } }] },
        'add', [{ merchandiseId: `gid://shopify/ProductVariant/${config.variantId}`, quantity: 1 }]);
    }
  } finally {
    busy = false;
  }
}

// Our own updates fire this too; the re-check then finds nothing to change.
document.addEventListener(StandardEvents.cartLinesUpdate, (event) => {
  Promise.resolve(event.promise).then(() => setTimeout(reconcile, 50), () => {});
});
reconcile();
