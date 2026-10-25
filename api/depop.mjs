import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const shop = 'w4vyd4vy';
const host = 'https://partnerapi.depop.com';

export function listing(product) {
  if (product.status !== 'STATUS_ONSALE' || !(product.quantity > 0)) return null;
  if (!product.slug || !product.product_id) throw new Error('A listing is missing its ID or slug');
  const price = Number(product.current_price ?? product.discount_price ?? product.price_amount);
  if (!Number.isFinite(price) || price < 0 || !/^[A-Z]{3}$/.test(product.price_currency)) throw new Error('A listing has invalid pricing');
  const image = product.pictures?.[0]?.url;
  if (!image || new URL(image).protocol !== 'https:') throw new Error('A listing has no valid photo');
  const description = String(product.description || '').trim();
  return {
    id: String(product.product_id),
    title: description.split('\n').find(line => line.trim()) || 'View on Depop',
    description,
    price,
    currency: product.price_currency,
    image,
    url: 'https://www.depop.com/products/' + encodeURIComponent(product.slug) + '/'
  };
}

export async function readShop(token, request = fetch) {
  if (!token?.trim()) throw new Error('Set DEPOP_API_KEY to an approved Depop API key');
  async function get(path) {
    let response;
    try {
      response = await request(host + path, {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
        redirect: 'error'
      });
    } catch {
      throw new Error('Depop request failed; the previous feed has been kept');
    }
    if (!response.ok) throw new Error('Depop returned HTTP ' + response.status + '; the previous feed has been kept');
    try { return await response.json(); } catch { throw new Error("Depop returned invalid JSON; the previous feed has been kept"); }
  }
  const seller = await get('/api/v1/shop/');
  if (seller.username?.toLowerCase() !== shop) throw new Error('The API key must belong to ' + shop);
  const items = new Map();
  const cursors = new Set();
  let cursor;
  for (let page = 0; page < 1000; page++) {
    const query = new URLSearchParams({ limit: '100', state: 'selling', sort_by: 'created_date_desc' });
    if (cursor) query.set('cursor', cursor);
    const batch = await get('/api/v1/products/?' + query);
    if (!Array.isArray(batch.data) || typeof batch.meta?.has_more !== 'boolean') throw new Error('Unexpected Depop response; the previous feed has been kept');
    for (const product of batch.data) {
      const item = listing(product);
      if (item) items.set(item.id, item);
    }
    if (!batch.meta.has_more) return { shop, updatedAt: new Date().toISOString(), items: [...items.values()] };
    cursor = batch.meta.cursor;
    if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) throw new Error('Depop pagination failed; the previous feed has been kept');
    cursors.add(cursor);
  }
  throw new Error('Depop pagination exceeded the limit; the previous feed has been kept');
}

export async function syncShop(token, output = new URL('./listings.json', import.meta.url), request = fetch) {
  const feed = await readShop(token, request);
  let previous;
  try { previous = JSON.parse(await readFile(output, 'utf8')); } catch {}
  if (previous?.updatedAt && Date.parse(previous.updatedAt) > Date.parse(feed.updatedAt)) throw new Error('A newer feed already exists');
  const target = output instanceof URL ? fileURLToPath(output) : resolve(output);
  await mkdir(dirname(target), { recursive: true });
  const temporary = target + '.tmp';
  await writeFile(temporary, JSON.stringify(feed, null, 2) + '\n');
  await rename(temporary, target);
  return feed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const feed = await syncShop(process.env.DEPOP_API_KEY);
    console.log('Synced ' + feed.items.length + ' active listings from ' + feed.shop);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
