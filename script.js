const listings = document.querySelector('#listings');
const status = document.querySelector('#status');
let lastCheck;

function depopLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.depop.com' && url.pathname.startsWith('/products/');
  } catch {
    return false;
  }
}

async function loadShop() {
  try {
    const response = await fetch('api/listings.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Feed unavailable');
    const shop = await response.json();
    if (shop.shop !== 'w4vyd4vy' || !Array.isArray(shop.items)) throw new Error('Invalid feed');
    if (!shop.updatedAt) {
      status.textContent = 'See the latest listings in the Depop shop above.';
      return;
    }
    const checked = new Date(shop.updatedAt);
    if (!Number.isFinite(checked.getTime())) throw new Error('Invalid date');
    const cards = document.createDocumentFragment();
    for (const item of shop.items) {
      if (!depopLink(item.url)) continue;
      const card = document.createElement('a');
      card.className = 'listing';
      card.href = item.url;
      if (typeof item.image === 'string' && item.image.startsWith('https://')) {
        const image = document.createElement('img');
        image.src = item.image;
        image.alt = item.title;
        image.loading = 'lazy';
        card.append(image);
      }
      const title = document.createElement('h2');
      title.textContent = item.title;
      const price = document.createElement('p');
      price.textContent = new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency }).format(item.price);
      card.append(title, price);
      cards.append(card);
    }
    listings.replaceChildren(cards);
    lastCheck = checked;
    const old = Date.now() - checked.getTime() > 2 * 60 * 60 * 1000;
    const count = listings.children.length;
    status.textContent = (count ? count + ' listing' + (count === 1 ? '' : 's') : 'No active listings at last check') + ' · ' + (old ? 'Last checked ' : 'Checked ') + checked.toLocaleString() + '. Confirm availability on Depop.';
  } catch {
    status.textContent = lastCheck
      ? 'Could not refresh. Showing listings checked ' + lastCheck.toLocaleString() + '. Confirm availability on Depop.'
      : 'Listings are unavailable right now. Visit the Depop shop above.';
  }
}

loadShop();
setInterval(() => { if (!document.hidden) loadShop(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadShop(); });
