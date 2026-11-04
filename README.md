# Reddit_N8N

Small, copyable examples for the n8n community.

## Chat orders to spreadsheet rows

[`Text_to_Sheets_query`](Text_to_Sheets_query) turns one chat message into n8n
items containing `Date`, `Item`, and `Quantity`. It runs locally inside a Code
node, needs no modules or credentials, and makes no network requests.

1. Supply one input item with a string field named `user_message`.
2. Add a **Code** node, choose **JavaScript**, and select **Run Once for All Items**.
3. Copy the JavaScript inside the fenced block in `Text_to_Sheets_query` (omit
   the opening and closing triple backticks).
4. Execute the node and inspect its rows. Map `Date`, `Item`, and `Quantity` to
   your Sheets or database columns. Route rows with `Quantity: null` to review
   before importing them; the parser never invents a missing quantity.

The node uses [`$input.all()`](https://docs.n8n.io/code/builtin/current-node-input/)
and retains the older `items` fallback. The
[Code node mode documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/)
explains why all-items mode is needed when one input produces several rows.
This snippet deliberately accepts **one message per execution**. If your upstream
node supplies several messages, process them one at a time before this node;
multiple inputs raise an error instead of silently ignoring all but the first.

### Example

Input `user_message` (blank lines are allowed):

```text
Date: 12 June 2025

Item: Green Apple
Qty: 2

Pear qty 1.5
3 x Orange
```

Output:

```json
[
  { "json": { "Date": "12 June 2025", "Item": "Green Apple", "Quantity": 2 } },
  { "json": { "Date": "12 June 2025", "Item": "Pear", "Quantity": 1.5 } },
  { "json": { "Date": "12 June 2025", "Item": "Orange", "Quantity": 3 } }
]
```

### Accepted input and review rules

| Input | Behaviour |
|---|---|
| `Item: Apple` followed by `Qty: 2` | One complete row; `Quantity` also works |
| `Qty: 2` followed by `Apple` | Quantity-first orders work |
| `Apple: 2`, `Apple - 2`, `Apple x 2`, `2 x Apple` | Inline pairs; use spaces around `x` |
| `Apple qty 2`, `Apple quantity: 2` | Inline labelled quantities |
| `Date: 12 June 2025` or bare `2025-06-12` | Date applies to following items |
| `12/06/2025`, `12-06-25`, `on 12 June 2025` | Other recognised date headings |
| `Apple` without a quantity | Visible row with `Quantity: null`, ready for review |
| Blank lines, CRLF, full-width colons, `×`, en/em dashes | Normalised without merging lines |

Dates are preserved as text, without calendar validation or a locale conversion.
An omitted date stays `""`. Put the date **before** its orders: changing the date
flushes a pending item with its original date and a null quantity. A pending item
also stays visible when a complete inline pair follows it.

Quantities may be zero or positive decimals using `.`. Explicit invalid quantities
(such as `Qty: -2` or `Apple qty two`), repeated quantities without an item, and
orphan quantities at a date boundary, complete order, or end of message raise an
error with the original line number. No partial rows are returned on an error.
Empty `Date:` and `Item:` labels also raise errors. Blank input produces `[]`.

This is a small format parser, not a natural-language model. Unrecognised text is
kept as an item with a missing quantity, so inspect output before writing it.
Use `Item:` for names that contain pair-like punctuation (for example `Item: B-12`)
and supply their quantity on a separate line. A trailing chat time such as
`04:57` is removed. Blank lines do not start a separate order or reset a date.

### Regression checks

With Node.js 18 or newer installed, run from this repository:

```sh
node --test
```

Tests execute the exact copyable snippet with fixture input and simulated n8n
input objects. They cover multiline parsing, every advertised pair format,
incomplete records, date boundaries, malformed quantities, and the output
contract. No dependencies need installing. These are offline parser checks;
they do not exercise a live n8n or Sheets connection.
