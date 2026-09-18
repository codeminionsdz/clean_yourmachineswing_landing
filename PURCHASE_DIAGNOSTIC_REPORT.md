# Meta Purchase Diagnostic Report

## Final Business Flow

```text
Customer submits valid order
-> POST /api/orders
-> create_order succeeds
-> status = new
-> meta_purchase_status = NULL
-> atomic claim: NULL -> pending
-> Server CAPI Purchase
-> pending -> sent
-> Browser Pixel Purchase
```

Browser and Server use the same `event_id = order_number` so Meta can deduplicate them.

## Purchase Triggers Found

There are two actual Purchase dispatch points:

1. Browser Pixel Purchase
2. Server CAPI Purchase

No other direct Purchase dispatch point was found in the repository.

## Browser Purchase

### Files and functions

- [components/meta-pixel.tsx](components/meta-pixel.tsx): `trackMetaPurchase()`
- [components/order-form.tsx](components/order-form.tsx): success effect after `/api/orders`

### Trigger

```text
successful POST /api/orders
-> created = true
-> state = success
-> confirmedPurchase is set
-> trackMetaPurchase(value, currency, order_number)
-> fbq('track', 'Purchase', ...)
```

The browser event uses:

```text
event_id = order_number
value = order.total_amount
currency = DZD
```

Client-side deduplication uses `Purchase:order_number`.

### Browser behavior for incomplete sessions

An abandoned form that only calls `/api/abandoned-orders` cannot call `trackMetaPurchase()`.

Page reloads, page visits, CTA clicks, `PageView`, `ViewContent`, and `InitiateCheckout` do not dispatch Purchase.

## Server CAPI Purchase

### Files and functions

- [app/api/orders/route.ts](app/api/orders/route.ts): order-creation trigger
- [lib/meta-events.ts](lib/meta-events.ts):
  - `buildPurchaseEvent()`
  - `claimMetaPurchaseSend()`
  - `sendPurchaseToConversionsApi()`
  - `markMetaPurchaseRequestSent()`
  - `markMetaPurchaseSent()`
  - `recordMetaPurchaseResult()`

### Call chain

```text
POST /api/orders
-> create_order()
-> created = true
-> buildPurchaseEvent()
-> claimMetaPurchaseSend()
-> claim_meta_purchase_delivery()
-> NULL -> pending
-> sendPurchaseToConversionsApi()
-> Graph API /events
-> pending -> sent
```

The CAPI payload is:

```text
event_name = Purchase
event_id = order_number
value = order.total_amount
currency = DZD
```

Existing `fbp`, `fbc`, `fbclid`, phone hashing, Pixel ID, and token handling remain unchanged.

### Server idempotency

The database function checks:

```sql
id = p_order_id
and order_number = p_event_id
and meta_purchase_status is null
```

The first request atomically changes:

```text
NULL -> pending
```

Repeated or concurrent requests cannot claim an order already in `pending` or `sent`.

`create_order` returns `created = true` only for a newly inserted order. A repeated `submission_id` returns `created = false`, so the route does not send another Server Purchase and the client does not dispatch another Browser Purchase.

## Abandoned-Order Path

### File

[app/api/abandoned-orders/route.ts](app/api/abandoned-orders/route.ts)

### Behavior

```text
POST /api/abandoned-orders
-> validate sessionId
-> upsert abandoned_orders
-> return saved
```

It does not call:

- `trackMetaPurchase`
- `buildPurchaseEvent`
- `claimMetaPurchaseSend`
- `claim_meta_purchase_delivery`
- `sendPurchaseToConversionsApi`
- Meta Graph API `/events`

The database trigger on `abandoned_orders` only updates `updated_at`.

Therefore:

```text
incomplete form only -> abandoned_orders -> no Purchase
```

## Admin Status Changes

[app/api/admin/orders/route.ts](app/api/admin/orders/route.ts) only updates order status.

Admin confirmation does not call:

- `deliverConfirmedPurchase`
- `claimMetaPurchaseSend`
- `sendPurchaseToConversionsApi`
- `trackMetaPurchase`

Therefore:

```text
new -> confirmed -> no additional Purchase
```

## Other Client Events

`components/product-story.tsx` sends only `InitiateCheckout` when a CTA is clicked.

The Meta Pixel initialization sends only:

- `PageView`
- `ViewContent`

None of these events calls or implies Purchase.

## Audit Endpoint

[app/api/meta/purchase-audit/route.ts](app/api/meta/purchase-audit/route.ts) only records a Browser audit after checking that `meta_purchase_status = sent`.

It does not send CAPI Purchase.

## Abandoned/Incomplete -> Purchase Path

**Does not exist in the current repository.**

An abandoned order can be marked `converted` later when a real order with the same submission session is created, but the abandoned-order save itself does not send Purchase.

## September 18 Observation

The observation was:

- 8 real/completed orders
- 18 incomplete/abandoned orders
- 17 Meta Purchase events

Those counts alone do not prove that abandoned orders generated Purchase.

The current repository shows that:

- abandoned-only sessions cannot generate Purchase;
- successful `/api/orders` submissions generate one Server Purchase and one Browser Purchase;
- the order remains `new`, by business design;
- Meta event IDs must be correlated with `orders`, `meta_purchase_attempts`, `meta_purchase_browser_calls`, and Meta event timestamps to explain the 17 events.

## Root Cause Status

**Not proven.**

The repository does not contain an abandoned-order-to-Purchase path. Any unexplained Meta events require production audit correlation or an external/old deployment source; the numerical relationship between 18 abandoned orders and 17 Purchases is insufficient evidence.

## Historical Context

Before commit `aa69953`, the old `/api/orders` route sent CAPI immediately after order creation. Commit `aa69953` moved delivery to admin confirmation. The final implementation in this workspace restores immediate delivery after successful creation and removes the admin Purchase trigger.

## Constraints

- No historical order, including `YM-20260918-0084`, is resent or modified.
- No code outside the Purchase flow was intentionally changed.
- No deployment was performed.
- No test event or test order was created.
- No `AddToCart` event was added.
- No second Meta integration was added.
