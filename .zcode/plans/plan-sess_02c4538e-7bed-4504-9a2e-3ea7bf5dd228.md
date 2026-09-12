Milan Grocery — Functional Rework Plan

Goal: make it client-ready functionally — proper stock management (cartons/packs), barcode support, phone use over WiFi, billing-first flow with minimal clicks, shadcn/ui as-is. Function first, styling later.

Concurrent-work rule: cline has been resetting this DB and killing servers mid-session. I'll `git init` + commit first so everything is recoverable, and commit at each phase. Please pause cline during this work.

━━━ Phase 0 — Safety net
- `git init`, initial commit (source only; DB and backups already gitignored).
- Verify npm registry reachable; then `npx shadcn@latest init` (Tailwind v3 + React 19 supported; defaults, light theme) and add: button, input, label, textarea, card, badge, dialog, table, tabs, select, command, popover, dropdown-menu, separator, sonner. If registry is unreachable, fall back to keeping hand-rolled components and skip shadcn (everything else proceeds identically).
- Migrate repeated inline success/error banners to sonner toasts as each page is rebuilt.

━━━ Phase 1 — Data model (stock + multi-unit)
Schema additions (prisma db push; existing data preserved — push adds columns with defaults):
- Product: + `baseUnit` (default = current unit value), `lowStockAt` (default 10). `stockQuantity` stays = stock in base units. `unit` column dropped after migration.
- New `ProductUnit`: { productId, name ("Carton"/"Pack"/"Dozen"/"gram"/"ml"...), factor (base units per 1: 30, 12, 0.001) } with unique [productId, name]. Base unit is implicit.
- New `StockMove` ledger: { productId, delta (base units, +in/−out), reason (PURCHASE | SALE | ADJUST | DAMAGE | RETURN | COUNT), note?, unitName?, quantity? (as entered), createdAt, refType?, refId? }.
- Server actions: `checkout` gains per-line `unitName` (resolves factor server-side, prices per base unit, line shows "1 Carton (30 pcs)"), writes one StockMove per line inside the same atomic transaction; `addStock` (PURCHASE), `adjustStock` (DAMAGE/RETURN/ADJUST, or COUNT = set absolute, delta computed); `listStockMoves` (recent, filterable by product); product CRUD updated for new fields (create accepts opening stock → PURCHASE move).
- types.ts updated; seed.js updated (e.g., Wai Wai gets Carton ×30, Pack ×12; Rice gets 5kg "Bora" ×5; gram/ml sub-units on kg/liter items).

━━━ Phase 2 — Counter (new home "/")
- Route swap: `/` = Counter Billing (billing page moves to `/`), old dashboard content merges into new `/reports` (Phase 4). Sidebar: Counter, Stock, Khata (Udharo), Deliveries, Reports.
- Search/scan bar always autofocused; instant results dropdown (shadcn Command in popover) with ↑↓/Enter; exact barcode match adds instantly (USB/BT scanners: they type + Enter — already works, kept).
- Quick-items chip row + tappable product grid retained below for touch use.
- Cart lines: qty stepper + unit dropdown (base unit + configured units; converting recalculates from per-base-unit price), line shows effective "× 30 pcs".
- Checkout dialog: big total; Cash / Partial / Udharo; cash quick-fill (exact, 500, 1000, 2000); searchable customer combobox + inline new-customer; success view with "Print receipt" (80mm-tuned @media print CSS) and auto-refocused search for the next sale. Keyboard: Enter=search/add, F2=checkout.
- Camera barcode scan button ("Scan") — client-only component using native BarcodeDetector when available, html5-qrcode fallback (dynamic import, no config keys).

━━━ Phase 3 — Stock/Inventory rebuild
- shadcn Table: product, category, barcode, stock shown in base units + helpful conversion ("450 pcs ≈ 15 Cartons"), retail/wholesale price, per-product low-stock badge (red out / amber ≤ lowStockAt).
- "Add Stock" dialog: qty + any unit, optional note (supplier) → PURCHASE move. "Adjust" dialog: Damage / Return to supplier / Correction (delta), or Count (set absolute) → ledger entry.
- Product create/edit dialog: adds baseUnit, lowStockAt, barcode (scanner-types into field), and a simple sell-units editor (name + factor rows, e.g., Carton 30). Opening stock only on create.
- "Recent stock movements" section: time, product, ±qty (as entered + base), reason, note — the audit trail that was missing.

━━━ Phase 4 — Reports page (replaces Dashboard + Night Closing)
- `/reports`: today's metric cards (cash collected, udharo added, credit payments, cash in drawer), today's transactions table, database backup panel (existing), plus a "Open on phone" panel showing the LAN URL with a QR code (qrcode npm package, server-generated) so the shopkeeper can pull the counter up on a phone instantly.
- Old `/` dashboard and `/closing` routes removed (redirects to `/reports` for stale links).

━━━ Phase 5 — Khata & Deliveries re-skin (shadcn, generic wording)
- Khata: same flow (list, history, record payment) rebuilt with Card/Dialog/Table + toasts. Udharo success in checkout links here.
- Deliveries: re-skinned list + dispatch dialog; status chips kept. Copy de-branded everywhere: "Honda Splendor Delivery Tracker"→"Deliveries", "Bhatta price"→"Wholesale", dashboard copy removed with the page. APP_NAME stays "Milan Grocery" (that's the shop itself).

━━━ Phase 6 — Phone access + finishing
- Scripts: `dev:lan` = `next dev -H 0.0.0.0` (works today on http://192.168.18.x:3000), `dev:phone` = `next dev -H 0.0.0.0 --experimental-https` (self-signed cert → accept the one-time phone warning) — camera scanning REQUIRES this secure context; without it the app still works from the phone, just no camera scan. Documented in README.
- Camera scan component also embedded in the product barcode field.
- Verification: stop dev server → `prisma db push` (data counts before/after) → `tsc --noEmit` → `next build` → restart dev + smoke-check every page and one full billing round-trip. README updated (phone setup, scanning, units).

Out of scope (later, per "function first"): visual theming beyond shadcn defaults, barcode label printing, supplier/purchase orders, multi-user auth, dark mode.