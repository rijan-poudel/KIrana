# Milan Grocery — Production Roadmap

Everything a real, published shop product needs, in one list. We work through it
**one item at a time** — small, verified steps. Items marked ✅ are done and
verified; ☐ items are next, roughly in priority order within each phase.

---

## Phase 1 — Fix what was visibly broken ✅ (2026-09-13)

- ✅ **Camera barcode scanning did not work on the phone.** Root cause: browsers
  hide the camera on plain `http://` (insecure context) — the phone was opened
  over the LAN address. Fixes:
  - `npm run phone` — self-signed HTTPS proxy (`scripts/phone.mjs`) on
    `https://<PC-IP>:3443` so the phone gets a secure context (accept the
    one-time certificate warning). `npm run start:phone` for production.
  - Scanner rewritten: native `BarcodeDetector` on Android Chrome (fast, reads
    EAN barcodes reliably), html5-qrcode fallback elsewhere; rear camera at
    720p+; torch toggle; **dialog stays open** so a whole basket can be scanned
    without re-opening the camera; manual "type the barcode" fallback; clear
    error screen when on http:// explaining exactly what to run.
  - Same scanner fills the **barcode field** on the product form (Stock screen).
- ✅ **Reports had no daily view and nothing was editable.** Now: date
  navigation (prev/next/pick-a-date), per-transaction actions — **Void bill**
  (restocks items, reverses khata dues/payments atomically, writes VOID ledger
  rows) and **Print receipt again**.
- ✅ **UI sizing/overflow problems**: product-card price/badge clipping,
  placeholder truncation, tables unusable on phones (Stock → card list on
  mobile, Reports table columns collapse on small screens), counter cart
  unreachable on phones (sticky bottom checkout bar).
- ✅ **Customer favorites ("regulars")**: star a customer in Khata; favorites
  float to the top of the khata list and the checkout customer picker; per-person
  totals (billed / paid / visits) in their history.
- ✅ Stock screen: category + In stock/Low/Out filters.

## Phase 2 — Daily-driver completeness (all ✅ — items 1–7 done)

1. ✅ **Bill discounts** — flat (Rs.) or % bhaansi off a whole bill from the
   checkout dialog: tap Rs. off / % off, type the amount, optional note
   ("regular customer", "damaged pack"). The discount folds into the total
   before payment, so the counter total and the cash drawer always agree.
   Receipts print a DISCOUNT line above the net TOTAL; the day report shows a
   per-bill Disc column, a "Discounts Given" metric, and the note in the void
   dialog. Stored on the transaction (`discountAmount` + `discountNote`), so
   voids reverse exactly what was charged.
2. ✅ **Cost price per product + profit view** — `costPrice` on every product
   (entered on the product form, or auto-mantained by weighted average whenever
   you record a purchase and type the total cost). Reports gains a **Profit
   today** card (net sales − cost of goods sold, with a margin % and a warning
   when some products sold today have no cost price), and Stock value now shows
   the cost side too. The stock table shows cost + markup per product.
3. ✅ **Held / parked bills** — a "Hold" button parks the half-built bill
   (labelled by its top item, with total + time held) and clears the counter for
   the next customer. Parked bills sit in a Held-bills panel on the counter with
   one-tap **Restore** (it even auto-parks the current bill first so nothing is
   lost), plus a remove button. Bills and held bills both survive refreshes/
   crashes via localStorage.
4. ✅ **Regular-customer quick billing** — pin a regular on the counter before
   building the bill (a chip in the cart card). Every sale then goes to them:
   the checkout dialog skips the customer step entirely, shows "Selling to
   Ram" with their due-amount reminder, and records even cash sales in their
   khata history. The pin survives refreshes and stays until explicitly
   cleared, so a busy regular's consecutive bills take one tap each.
5. ✅ **Searchable customer picker** in checkout (Command palette) — type-ahead
   by name/phone/area with favourites on top, arrows + Enter, balance badges,
   and one-tap clear — replacing the unusable <select> both in checkout and on
   the counter pin. (Also fixed a latent bug: a server-action revalidation
   rebuilt the `customers` array mid-checkout and silently wiped a completed
   receipt — the dialog now only resets on a closed→open transition.)
6. ✅ **Edit a saved bill's lines** (beyond void + re-entry) — fix a wrong
   quantity/price without deleting the record. The edit dialog restores each
   line from what was *actually* charged — the billed rate per unit (not
   today's shelf price) and any per-line bhaansi embedded in the saved subtotal —
   and makes both editable in-sheet with a one-tap "use shelf price" reset. The
   whole bill (lines, per-line disc, bill bhaansi, customer) is rewritten in
   place under the same receipt number, reversing the original StockMove/SALE
   rows and applying the new deltas atomically, so stock, khata, and the
   reports ledger always agree with the corrected total.
7. ✅ **Day summary print** — "Print day summary" on Reports prints an A4
   closing sheet for the drawer reconciliation file: the day's totals (cash
   from sales, credit payments, total cash in hand, udharo added, bhaansi
   given, khata outstanding) plus every transaction of the selected day, with
   count-the-drawer / difference / signature lines. The sheet is portalled to
   <body> and everything else is display:none while printing, so it prints as
   exactly the summary (no app chrome, no stray pages) and never collides with
   the receipt reprint flow.

## Phase 3 — Reports & records a real shop needs (items 8–11 done)

8. ✅ **Date-range reports + monthly closing** (2026-09-20): `/reports?from=&to=`
    range mode — week / month / last-month / 30-days presets plus custom span
    pickers; the six metrics computed across the range; a Day-by-day closing
    table (per-day bills/sales/bhaansi/cash/udharo/credit-payments + totals,
    days with activity, clickable to that day's report); "Print range summary"
    A4 sheet (day-by-day + totals + Prepared by/Checked by lines) sharing the
    portalled `#print-sheet` print mechanism with the day summary.
9. ✅ **"What sold"** (2026-09-20): per-product qty/revenue/cogs across the
    range sorted by revenue, category sub-total chips, per-product gross profit
    when cost prices are set; top 25 on screen, full set in the Products CSV.
10. ✅ **CSV export** (2026-09-20): `GET /api/export?from=&to=` streams the full
    range (no screen cap) — Transactions CSV (gross/discount+note/net/paid/due/
    status + PAYMENT rows) and `&kind=products` What-sold CSV; BOM + CRLF +
    quoted cells so Excel opens it cleanly; buttons in the Reports header.
11. ✅ **Vendor bill records — QR capture & VAT inbox** (2026-09-20): the new
    `/bills` screen. Scan the QR printed on a vendor's VAT bill (camera /
    photo / pasted text — native `BarcodeDetector` + html5-qrcode, no AI),
    `lib/vat-qr.ts` reads seller PAN, bill number, BS date, taxable/VAT/total
    deterministically from the payload (CBMS JSON, verification URLs, plain
    `key: value` text; EMV payment QRs rejected), a confirm form shows the
    pre-filled fields with a 13%-VAT arithmetic check, and the record is saved
    with a duplicate guard on the CBMS identity (vendor PAN + bill number).
    BS dates kept as printed, fiscal year derived (2082/83), input-VAT totals
    per fiscal year, CSV export, manual entry for plain kachcha bills. The
    storage answer: records are ~300 bytes and permanent; photos are optional,
    client-compressed to ~100 KB WebP, stored on disk (`data/bill-photos/`,
    served via `/api/bill-photo/[id]`), auto-pruned by a retention setting
    (default keep 1 year) while records stay forever. Tests:
    `node scripts/test-vat-qr.ts`.
11b. ✅ **Purchases in range** (2026-09-20): the range view totals vendor bills
    captured in the span (amount, input VAT, count) with a link to `/bills`, and
    the range print sheet gains a "Purchases recorded" totals line. (A fuller
    purchase register from stock-move notes can build on the Bills data if the
    shop needs supplier-level detail later.)

## Phase 4 — Stock depth

12. ☐ Suppliers + purchase entries (supplier name/bill no. on PURCHASE moves,
    supplier payables = how much we owe).
13. ☐ Reorder sheet — everything at/below low stock with a suggested order qty.
14. ☐ Barcode shelf-label printing (name + price, 50×25mm sheet).
15. ☐ Fast stock-count screen (walk the shop, type counted qty per shelf).
16. ☐ Optional expiry/batch tracking for perishables (milk, snacks).

## Phase 5 — Khata depth

17. ☐ Customer statement: print/share full khata ledger (WhatsApp text export).
18. ☐ Payment reminder helper (pre-filled WhatsApp/SMS message with balance).
19. ☐ Advance (negative balance) flows polish — refund or adjust on next bill.

## Phase 6 — Deployment hardening (publish-ready)

20. ◐ **Auto-start on boot** — ✅ `scripts/install-service.sh` installs a
    systemd **user** unit (`scripts/milan-grocery.service`) that builds once,
    starts the production server on boot, and restarts on crashes, with the
    README runbook (2026-09-20). ☐ still to do on the actual shop PC: run the
    script once + `sudo loginctl enable-linger $USER` (needs the owner's sudo).
21. ◐ **Auto-backup** — ✅ automatic daily snapshot when Reports is opened,
    keeping the newest 30 files (2026-09-13). ☐ still missing: a visible
    "last backup: when" age badge and backups that survive the PC being off
    at closing time (systemd timer).
22. ☐ **PIN lock** — app-level PIN for sensitive actions (Reports, khata edits,
    voids) so helpers can bill but not fiddle the books.
23. ☐ **Audit trail** — record who/when/why for voids, price edits, stock
    corrections (single-user today, still worth writing down).
24. ☐ Restore-from-backup button (upload a .db → verify → swap with automatic
    safety copy), instead of the manual file copy.
25. ☐ Friendly error pages (500/offline) + a global error boundary that keeps
    the cart safe.
26. ☐ Optional mkcert flow for warning-free phone TLS.

## Phase 7 — Long-term quality

27. ☐ Automated tests: checkout math + void reversal unit tests; Playwright
    smoke of one full billing round-trip on every release.
28. ☐ Virtualize the product grid past ~200 products; keep the counter instant.
29. ☐ Nepali language toggle for labels (the shop's first language).
30. ☐ Dark mode (tokens already prepared).
31. ☐ App update runbook: version number shown in the sidebar, safe update steps.

---

### Working rules for this roadmap

- One item at a time; verify in the browser before moving on.
- shadcn/base-nova components everywhere — no bespoke styling that fights the
  kit; design tweaks come later as a theme change.
- Every schema change: `prisma db push` + regenerate + restart the dev server
  (a running server keeps the old Prisma client — this bit us once already).
- `npx tsc --noEmit` + `next build` before calling an item done.
