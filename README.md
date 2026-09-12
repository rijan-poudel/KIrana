# Milan Grocery — Offline Shop Management (Gaindakot)

A 100% offline, local desktop-grade web app for a family-run Kirana & Wholesale
shop in Gaindakot, Nepal. It replaces the paper workflow: daytime counter
bills, bulk bike deliveries, and the nighttime khata (credit ledger) closing.

Runs entirely on one computer. **No internet connection is ever needed** — all
data lives in a single local SQLite file (`prisma/shop.db`).

---

## Quick Start (first time)

Requires Node.js 18.18+ (tested on Node 22+).

```bash
npm install        # installs deps and generates the Prisma client
npm run db:push    # creates prisma/shop.db from the schema
npm run db:seed    # fills in 20 staple products (Rice, Oil, Dal, Sugar, Soap, Chiyapati…)
npm run dev        # start the app → http://localhost:3000
```

Daily start afterwards: just `npm run dev` and open http://localhost:3000.

> The app is optimized for a laptop browser in a bright shop: white backgrounds,
> large touch-friendly buttons, and instant search. The billing search bar also
> accepts a USB barcode scanner (scan → the item drops straight into the cart).

## The Six Screens

| Screen | Who / When | What it does |
|---|---|---|
| **Dashboard** (`/`) | Anyone, anytime | Live cash collected today, udharo added, outstanding khata total, stock value, low-stock alerts, recent bills. |
| **Counter Billing** (`/billing`) | Mother, at the counter | Tap-to-add product grid + quick staples grid, search/barcode box, **Retail ⇄ Wholesale** price switch, cart with +/− steppers, checkout modal with **Nagad/Cash**, **Partial**, or **Udharo** (instant customer creation). The cart survives accidental page refreshes (localStorage). |
| **Stock / Inventory** (`/inventory`) | Restocking time | Full add / edit / delete of products with **separate retail and wholesale prices**, unit (kg, pcs, packet, liter…), barcode, and low-stock badges (≤ 10 units). |
| **Udharo Khata** (`/khata`) | Credit tracking | Every customer's live outstanding balance, purchase history timeline, and a **Record Payment** modal for when they stop by to settle. |
| **Delivery Tracker** (`/delivery`) | Father, on dispatch days | Log goods loaded onto the Honda Splendor (client, items summary, value) and move them through **PENDING → DELIVERED → SETTLED**. |
| **Night Closing** (`/closing`) | End of day | Today's cash from sales, udharo added, credit payments received, total cash in hand, full transaction list — plus one-click database backups. |

## Data & Backups

- All data lives in **`prisma/shop.db`** (single SQLite file).
- **Night Closing → "Save Backup to backups/ Folder"** writes a timestamped,
  consistent snapshot (`VACUUM INTO`) into **`backups/`** — even mid-sale.
- **"Download Database Backup"** saves a copy into `backups/` *and* downloads
  it to the browser (API route `GET /api/backup`).
- Copy the whole project folder (or at least `prisma/shop.db` + `backups/`) to a
  pen drive at least once a week.

**Restore from a backup:** close the app, replace `prisma/shop.db` with a
backup file (rename it to `shop.db`), start the app again.

## How a Sale Works (under the hood)

The checkout runs in one **Prisma interactive transaction**: create the
transaction + items, verify and decrement stock for every product, and — for
udharo/partial — add the remaining due to the customer's `currentBalance`.
A power cut mid-bill can never leave the books half-written. Recorded khata
payments are stored as `PAYMENT` transactions so the night closing totals are
always auditable.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the app for daily use (http://localhost:3000) |
| `npm run build` && `npm start` | Optimized production mode (slightly faster pages) |
| `npm run db:push` | Apply schema changes to the database |
| `npm run db:seed` | Add the 20 staple starter products (skips if any exist) |
| `npm run db:studio` | Browse raw data in Prisma Studio (http://localhost:5555) |
| `node scripts/clean-test-data.js` | Wipe test transactions/customers, keep products |

## Troubleshooting

- **"Table does not exist" or empty screens** → run `npm run db:push`.
- **Weird Prisma errors after an update** → run `npm install` (regenerates the
  Prisma client), then restart.
- **Slow first page load in dev** → normal; Next.js compiles each screen once.
- **Two copies of the app running at once** → don't. SQLite allows one writer;
  close one instance before using the other.
- **Browser shows an old price/stock** → press F5 (the cart is never lost on
  refresh — only a completed sale clears it).

## Tech Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Prisma 6 ·
SQLite · lucide-react icons. Server Actions for all mutations. Zero runtime
network dependencies (system fonts only).
