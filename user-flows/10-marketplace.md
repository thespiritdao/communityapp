# Flow 10 — Marketplace / Shopping

## Who This Is For
Community members purchasing products, and order managers fulfilling orders.

---

## Shopper Journey

```
USER navigates to Market / Marketplace
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MARKETPLACE                               │
│                                                                 │
│  🔍 Search products...                     🛒 Cart (2)          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  📗 Book     │  │  🎽 T-Shirt  │  │  🖼 Print    │          │
│  │  $18.00      │  │  $35.00      │  │  $25.00      │          │
│  │  [ Add 🛒 ]  │  │  [ Add 🛒 ]  │  │  [ Add 🛒 ]  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  🌱 Sticker  │  │  🎵 Album    │  │  🕯 Candle   │          │
│  │  $5.00       │  │  $12.00      │  │  $22.00      │          │
│  │  [ Add 🛒 ]  │  │  [ Add 🛒 ]  │  │  [ Add 🛒 ]  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Shopping Cart

```
USER TAPS 🛒 Cart icon
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  YOUR CART                                                      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📗 Book                                 $18.00                 │
│  Qty: [ − 1 + ]                          [ 🗑 Remove ]          │
│                                                                 │
│  🎽 T-Shirt (Size: M)                    $35.00                 │
│  Qty: [ − 1 + ]                          [ 🗑 Remove ]          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Subtotal:                               $53.00                 │
│  Shipping:                               $5.00                  │
│  Total:                                  $58.00                 │
│                                                                 │
│  [ Continue Shopping ]      [ Checkout → ]                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Checkout Flow

```
USER TAPS [ Checkout → ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1 — SHIPPING                                              │
│                                                                 │
│  Full Name:     [ _________________________ ]                   │
│  Address:       [ _________________________ ]                   │
│  City:          [ _________________ ]                           │
│  State/Zip:     [ _______ ] [ _______ ]                         │
│  Country:       [ _________________ ]                           │
└─────────────────────────────────────────────────────────────────┘
                            [ Next → ]
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2 — PAYMENT                                               │
│                                                                 │
│  Card Number:   [ ____ ____ ____ ____ ]                         │
│  Expiry:        [ MM/YY ]  CVV: [ ___ ]                         │
│                                                                 │
│  Total: $58.00                                                  │
└─────────────────────────────────────────────────────────────────┘
                            [ Place Order → ]
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│             ✅ ORDER CONFIRMED!                                 │
│                                                                 │
│  Order #12847                                                   │
│  Thank you for your purchase!                                   │
│                                                                 │
│  You'll receive a confirmation email.                           │
│  Track your order in My Orders.                                 │
│                                                                 │
│  [ View My Orders ]          [ Continue Shopping ]              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Order Tracking (Buyer)

```
USER navigates to My Orders  (/marketplace/my-orders)
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  MY ORDERS                                                      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Order #12847 · Mar 10, 2026                         $58.00     │
│  📗 Book  ·  🎽 T-Shirt                                         │
│  Status: 🟡 Processing                                          │
│  [ View Details ]                                               │
│                                                                 │
│  Order #12601 · Feb 22, 2026                         $25.00     │
│  🖼 Print                                                        │
│  Status: ✅ Delivered  ·  Mar 1                                 │
│  [ View Details ]                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Order Status Flow

```
ORDER PLACED
    │
    ▼
🟡 PROCESSING (order received, being prepared)
    │
    ▼
📦 PREPARING (being packaged)
    │
    ▼
🚚 SHIPPED (tracking number available)
    │
    ▼
✅ DELIVERED (complete)
```

---

## Order Manager Journey (Admin / Exec)

```
ORDER MANAGER navigates to /marketplace/orders
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  ALL ORDERS                          🔍 Search  [ Filter ▼ ]   │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  #12847  @sam      📗 Book + 🎽 T-Shirt    $58   🟡 Processing  │
│  #12846  @jordan   🖼 Print                $25   🟡 Processing  │
│  #12845  @riley    🌱 Sticker x3           $15   📦 Preparing   │
│  #12844  @alex     🎵 Album                $12   🚚 Shipped      │
│                                                                 │
│  [ View ] each order → update status → add tracking → notify   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Demo Highlights

- **Full e-commerce flow** — browse, cart, checkout, tracking
- **Real-time status** — buyers always know where their order is
- **Admin tools** — order managers can update status and add tracking
- **Community-connected** — revenue supports the DAO treasury
