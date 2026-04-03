import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';

export class CartUpsell extends Component {
  constructor() {
    super();
    document.addEventListener(ThemeEvents.cartUpdate, this.handleCartUpdate.bind(this));
  }

  handleCartUpdate(event) {
    // Get the HTML for the cart-upsell section from the event
    const sections = event.detail?.data?.sections;
    if (!sections) return;
    
    // Find the cart-upsell element
    const cartUpsellElement = document.querySelector('cart-upsell');
    
    // Look for cart-upsell HTML in each section
    for (const sectionId in sections) {
      const sectionHtml = sections[sectionId];
      
      // Create a temporary container to parse the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = sectionHtml;

      // Check if this section contains cart-upsell
      const newCartUpsell = tempDiv.querySelector('cart-upsell');
      
      if (newCartUpsell && cartUpsellElement) {
        
        // Replace the entire cart-upsell element
        cartUpsellElement.replaceWith(newCartUpsell);
        break;
      }
    }
  }
}

customElements.define('cart-upsell', CartUpsell);