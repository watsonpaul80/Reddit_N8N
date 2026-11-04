const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Exercise exactly what users paste into n8n; there is no second parser copy.
const snippet = readFileSync(join(__dirname, '..', 'Text_to_Sheets_query'), 'utf8');
const source = snippet.match(/^```javascript\s*\n([\s\S]*?)\n```\s*$/)[1];
const execute = new Function('items', '$input', source);
const parse = (message) => execute([{ json: { user_message: message } }]);
const row = (Item, Quantity, Date = '') => ({ json: { Date, Item, Quantity } });

test('keeps blank lines, indentation, CRLF and CR as record boundaries', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    assert.deepEqual(parse(['Date: 12 June 2025', '', '  Item: Apple', '', '\tQty: 2'].join(newline)),
      [row('Apple', 2, '12 June 2025')]);
  }
});

for (const input of ['Apple: 2', 'Apple - 2', 'Apple x 2', 'Apple × 2', '2 x Apple', '2 × Apple', 'Apple qty 2', 'Apple quantity: 2', 'Apple Qty. 2']) {
  test(`accepts inline pair: ${input}`, () => assert.deepEqual(parse(input), [row('Apple', 2)]));
}

test('accepts labels, Unicode punctuation, decimals, zero and trailing chat time', () => {
  assert.deepEqual(parse('Date：12 June 2025\nItem：Green\u200B  Apple\nQuantity：0 04:57\nPear — 1.5'),
    [row('Green Apple', 0, '12 June 2025'), row('Pear', 1.5, '12 June 2025')]);
});

test('quantity can precede its item, including zero', () => {
  assert.deepEqual(parse('Qty: 0\n\nItem: Apple\nQuantity: 2\nPear'), [row('Apple', 0), row('Pear', 2)]);
});

test('does not discard an incomplete item when an inline pair follows', () => {
  assert.deepEqual(parse('Item: Apple\nPear x 2\nItem: Orange'),
    [row('Apple', null), row('Pear', 2), row('Orange', null)]);
});

test('retains consecutive and trailing incomplete items', () => {
  assert.deepEqual(parse('Apple\nPear\nOrange'), [row('Apple', null), row('Pear', null), row('Orange', null)]);
});

test('date changes apply to following items and never relabel pending items', () => {
  assert.deepEqual(parse('Date: 2025-06-12\nItem: Apple\nDate: 2025-06-13\nPear x 2'),
    [row('Apple', null, '2025-06-12'), row('Pear', 2, '2025-06-13')]);
});

for (const date of ['12 June 2025', '12/06/2025', '12-06-25', '2025-06-12', '2025/06/12']) {
  test(`recognizes bare and on-prefixed dates before pair matching: ${date}`, () => {
    for (const prefix of ['', 'on ']) assert.deepEqual(parse(`${prefix}${date}\nApple x 2`), [row('Apple', 2, date)]);
  });
}

test('does not treat the x in Box as a multiplication separator', () => {
  assert.deepEqual(parse('Box 2\nQty: 3'), [row('Box 2', 3)]);
});

test('labelled item names preserve pair-like punctuation', () => {
  assert.deepEqual(parse('Item: B-12\nQty: 2\nItem: Apple x 2\nQty: 4'), [row('B-12', 2), row('Apple x 2', 4)]);
});

for (const message of ['Qty: 2', 'Qty: 2\nQty: 3', 'Qty: 2\nPear x 3', 'Qty: 2\nDate: tomorrow\nPear']) {
  test(`rejects an orphan quantity instead of losing it: ${JSON.stringify(message)}`, () => {
    assert.throws(() => parse(message), /Line 1: Quantity has no item/);
  });
}

for (const quantity of ['-2', 'two', '1,5', '2 kg', '', '9007199254740992', '9'.repeat(400)]) {
  test(`rejects invalid explicit quantity: ${quantity.slice(0, 30)}`, () => {
    assert.throws(() => parse(`\nItem: Apple\nQty: ${quantity}`), /Line 3: Quantity/);
    assert.throws(() => parse(`Apple qty ${quantity}`), /Line 1: Quantity/);
  });
}

test('rejects empty labels and non-string messages', () => {
  assert.throws(() => parse('Item:'), /Line 1: Item label/);
  assert.throws(() => parse('Date:'), /Line 1: Date label/);
  assert.throws(() => parse({ order: 'Apple' }), /user_message must be a string/);
});

test('negative inline quantities cannot become positive quantities', () => {
  for (const message of ['Apple: -2', 'Apple - -2', 'Apple x -2', '-2 x Apple']) {
    assert.throws(() => parse(message), /Line 1: Quantity must be a non-negative number/);
  }
});

test('empty input produces no rows', () => {
  for (const message of ['', '  \n\n ', null, undefined]) assert.deepEqual(parse(message), []);
  assert.deepEqual(execute([]), []);
});

test('supports the documented n8n $input.all API and legacy items contract', () => {
  const input = [{ json: { user_message: 'Apple qty 2' } }];
  assert.deepEqual(execute(undefined, { all: () => input }), execute(input));
});

test('rejects multiple input messages instead of silently ignoring later ones', () => {
  assert.throws(() => execute([{ json: { user_message: 'Apple x 1' } }, { json: { user_message: 'Pear x 2' } }]),
    /Expected one input message/);
});
