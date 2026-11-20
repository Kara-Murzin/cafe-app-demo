# Sunny Side — demo of an app for cafe guests

A demo concept of an app for a breakfast cafe. The Sunny Side cafe is fictional,
the menu and prices are made up. Orders, payments and bookings are not sent anywhere:
all data is stored in the browser (localStorage). The interface is in Russian.

Open: https://kara-murzin.github.io/cafe-app-demo/

## What is inside

- **Menu.** Kitchen and bar, search, jumping between sections.
- **Order.** Cart, pickup type (takeaway / in the cafe / delivery), time, paying with bonus points,
  a Kaspi payment button (simulated) and order status.
- **Bonuses.** Balance, the guest's QR code for the cashier, a "sixth coffee is free" card, history.
- **Cafe.** Table booking and contact buttons (in the demo they lead to the developer).

## Running

No build step is needed, these are static files.

```bash
python3 -m http.server 5178
```

Then open http://localhost:5178.

## Files

| File | What is in it |
|---|---|
| `menu.js` | Menu: sections, dishes, prices |
| `app.js` | Screens and logic: cart, order, bonuses, booking |
| `styles.css` | Styles |
| `index.html` | Page skeleton |

The bonus rules are set at the top of `app.js`: `BONUS_RATE` (the share returned as points)
and `STAMPS_FOR_GIFT` (which coffee in a row is free).

## What a real product would need

- a server and a guest database, sign-in by phone number;
- integration with the cafe's point-of-sale system (menu, stop list, orders);
- accepting payments through Kaspi;
- a panel for the owner: orders, bookings, promotions, statistics;
- push notifications.
