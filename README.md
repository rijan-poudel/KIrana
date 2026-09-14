# Milan Grocery — Offline Shop Management (Gaindakot)

A 100% offline web app for a family-run Kirana & Wholesale shop in Gaindakot,
Nepal. It replaces the paper workflow: counter bills, wholesale deliveries, and
the nightly khata (credit ledger) closing.

Runs entirely on one computer. **No internet connection is ever needed** — all
data lives in a single local SQLite file (`prisma/shop.db`). Phones on the same
WiFi can use it too (see *Using from a phone* below).

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

## The Five Screens

| Screen | Who / When | What it does |
|---|---|---|
| **Counter** (`/`) | Mother, at the counter — the home screen | One always-focused search/scan bar: type a name, **scan a barcode** (USB scanner types + Enter, or the camera button), and the item drops into the bill. Tappable product grid + top-sellers row for touch. **Retail ⇄ Wholesale** switch, per-line unit picker (pcs / Pack / Carton / Dozen…), checkout with **Cash**, **Partial**, or **Udharo**, cash quick-fill buttons, and a printable 80 mm receipt. The cart survives refreshes; `F2` opens checkout. |
| **Stock** (`/inventory`) | Restocking time | Product list with live stock in base units plus pack conversions ("≈ 15 Cartons"). **Add Stock** (purchases), **Damage / Return / Correction**, and **Count** (set exact shelf stock) — every change lands in the **stock movements ledger** below. Products define sell units like Carton ×30 or gram ×0.001; per-product low-stock alerts. |
| **Udharo Khata** (`/khata`) | Credit tracking | Every customer's live outstanding balance, purchase history timeline, and a **Record Payment** modal for when they stop by to settle. |
| **Deliveries** (`/delivery`) | Dispatch days | Log goods leaving the shop (client, items summary, value) and move them through **PENDING → DELIVERED → SETTLED**. |
| **Reports** (`/reports`) | End of day | Today's cash from sales, udharo added, credit payments received, total cash in hand, full transaction list, stock health — plus the **phone QR code** and one-click database backups. |

## Units: base units and packs

Stock is always counted in one **base unit** per product — `pcs`, `kg`, or
`liter`. Anything else is a **sell unit** with a conversion factor, configured
per product in Stock → Edit:

- Wai Wai Noodles: base `pcs`, sells in `Pack ×12` and `Carton ×30`
- Rice (Mansuli): base `kg`, sells in `Bora (25kg) ×25`
- Mustard Oil: base `liter`, sells in `Tin (15L) ×15`

Selling 1 Carton decrements 30 pcs of stock; prices are per base unit, so the
math always stays exact. Stock can also be *added* in packs (buy 2 Bora →
+50 kg).

## Barcode support

- **USB / Bluetooth scanner**: the counter search box is always focused — scan
  and the exact barcode match drops into the cart instantly.
- **Phone camera**: the "Scan camera" button on the Counter. The dialog stays
  open so a whole basket can be scanned without re-opening the camera; there is
  a torch toggle, and a "type the barcode" fallback when a code won't read.
  Uses the fast native `BarcodeDetector` on Android Chrome and html5-qrcode
  elsewhere. Camera access requires a secure context, so use HTTPS on the phone
  (below). The same scanner is available on the Stock screen to fill a
  product's barcode field.

## Using from a phone (same WiFi)

| Command | What you get |
|---|---|
| `npm run dev:lan` | App reachable at `http://<PC-IP>:3000` from any phone on the WiFi. Everything works except camera scanning (browsers block cameras on plain HTTP). |
| `npm run phone` | App (dev mode) behind a self-signed **HTTPS** proxy at `https://<PC-IP>:3443`. Accept the one-time certificate warning on the phone and camera scanning works. |
| `npm run start:phone` | Same HTTPS proxy for the production build (`npm run build` first). |

The Reports page shows a QR code with the LAN address — scan it from the phone
and open the counter there. The cart, stock and khata are shared live with the
PC (same database).

## Data & Backups

- All data lives in **`prisma/shop.db`** (single SQLite file).
- **Automatic daily backup**: opening the Reports page takes a safety snapshot
  if the last one is older than ~20 hours (the newest 30 backups are kept).
- **Reports → "Save backup to backups/ folder"** writes a timestamped,
  consistent snapshot (`VACUUM INTO`) into **`backups/`** — even mid-sale.
- **"Download database backup"** saves a copy into `backups/` *and* downloads
  it to the browser (API route `GET /api/backup`).
- Copy the whole project folder (or at least `prisma/shop.db` + `backups/`) to
  a pen drive at least once a week.

**Restore from a backup:** close the app, replace `prisma/shop.db` with a
backup file (rename it to `shop.db`), start the app again.

## How a Sale Works (under the hood)

The checkout runs in one **Prisma interactive transaction**: create the
transaction + items, verify and decrement stock for every line (writing a
`StockMove` ledger entry), and — for udharo/partial — add the remaining due to
the customer's `currentBalance`. A power cut mid-bill can never leave the books
half-written. Purchases, damage, corrections and counts go through the same
ledger, so Stock always reconciles. Recorded khata payments are stored as
`PAYMENT` transactions so the day report totals are always auditable.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the app for daily use (http://localhost:3000) |
| `npm run dev:lan` | Start reachable from other devices on the WiFi (HTTP) |
| `npm run phone` | HTTPS for phones — camera scanning works (one-time cert warning) |
| `npm run start:phone` | HTTPS for phones, production build |
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
- **Camera button says the camera is unavailable** → you are on plain HTTP.
  Run `npm run phone` and open the **https://…:3443** address it prints on the
  phone; accept the certificate warning once. Only the camera needs https —
  billing works on the http:// address.
- **Browser shows an old price/stock** → press F5 (the cart is never lost on
  refresh — only a completed sale clears it).
- Dev and production builds live in separate folders (`.next-dev` /
  `.next-prod`), so a `next build` can no longer corrupt the dev server's
  assets. If a page ever loads unstyled or buttons do nothing, delete both
  folders and restart.

## Tech Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui
(Base UI) · Prisma 6 · SQLite · lucide-react icons · html5-qrcode · qrcode.
Server Actions for all mutations. Zero runtime network dependencies (system
fonts only).
