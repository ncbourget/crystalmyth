import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listing, readShop, syncShop } from '../api/depop.mjs';

function shirt(id, changes = {}) {
  return {
    product_id: id,
    slug: 'shirt-' + id,
    status: 'STATUS_ONSALE',
    quantity: 1,
    description: 'Printed shirt\nSize large',
    price_amount: '30.00',
    current_price: '25.00',
    price_currency: 'USD',
    pictures: [{ url: 'https://example.com/shirt.jpg' }],
    address: { country_code: 'US', state: 'Private address' },
    ...changes
  };
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('only available products are published, with current prices and public fields', () => {
  const item = listing(shirt(1));
  assert.equal(item.price, 25);
  assert.equal(item.title, 'Printed shirt');
  assert.equal(item.url, 'https://www.depop.com/products/shirt-1/');
  assert.equal('address' in item, false);
  for (const status of ['STATUS_PURCHASED', 'STATUS_MARKED_AS_SOLD', 'STATUS_DELETED', 'STATUS_PRODUCT_BANNED_ONSALE']) {
    assert.equal(listing(shirt(1, { status })), null);
  }
  assert.equal(listing(shirt(1, { quantity: 0 })), null);
  assert.throws(() => listing(shirt(1, { price_amount: 'bad', current_price: 'bad' })));
});

test('checks the seller, follows all pages, deduplicates and filters sold stock', async () => {
  const calls = [];
  const feed = await readShop('test-key', async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    if (url.endsWith('/shop/')) return reply({ username: 'w4vyd4vy' });
    const query = new URL(url).searchParams;
    assert.equal(query.get('state'), 'selling');
    if (!query.has('cursor')) return reply({ meta: { has_more: true, cursor: 'next-page' }, data: [shirt(1)] });
    assert.equal(query.get('cursor'), 'next-page');
    return reply({ meta: { has_more: false }, data: [shirt(1), shirt(2), shirt(3, { status: 'STATUS_PURCHASED' })] });
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(feed.items.map(item => item.id), ['1', '2']);
  assert.ok(Number.isFinite(Date.parse(feed.updatedAt)));
});

test('rejects missing credentials and credentials for another shop', async () => {
  await assert.rejects(readShop(''), /DEPOP_API_KEY/);
  let calls = 0;
  await assert.rejects(readShop('test-key', async () => {
    calls++;
    return reply({ username: 'someone-else' });
  }), /must belong to/);
  assert.equal(calls, 1);
});

test('stops repeated cursors instead of publishing an incomplete feed', async () => {
  await assert.rejects(readShop('test-key', async url => url.endsWith('/shop/')
    ? reply({ username: 'w4vyd4vy' })
    : reply({ meta: { has_more: true, cursor: 'same' }, data: [shirt(1)] })), /pagination/);
});

test('a failed later page preserves the previous feed', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'depop-test-'));
  const output = join(folder, 'listings.json');
  const previous = '{"shop":"w4vyd4vy","updatedAt":"2026-01-01T00:00:00Z","items":[]}\n';
  await writeFile(output, previous);
  try {
    await assert.rejects(syncShop('test-key', output, async url => {
      if (url.endsWith('/shop/')) return reply({ username: 'w4vyd4vy' });
      if (!new URL(url).searchParams.has('cursor')) return reply({ meta: { has_more: true, cursor: 'page2' }, data: [shirt(1)] });
      return reply({ error: 'unavailable' }, 503);
    }), /HTTP 503/);
    assert.equal(await readFile(output, 'utf8'), previous);
  } finally {
    await rm(folder, { recursive: true });
  }
});

test('a successful empty shop removes previously listed stock', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'depop-test-'));
  const output = join(folder, 'listings.json');
  await writeFile(output, JSON.stringify({ items: [listing(shirt(1))] }));
  try {
    await syncShop('test-key', output, async url => url.endsWith('/shop/')
      ? reply({ username: 'w4vyd4vy' })
      : reply({ meta: { has_more: false }, data: [] }));
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')).items, []);
  } finally {
    await rm(folder, { recursive: true });
  }
});
