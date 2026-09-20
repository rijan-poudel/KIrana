# HANDOFF — Milan Grocery (KIrana)

Resume prompt for the next agent session. Read `ROADMAP.md` + `README.md` too.

## What the app is

Offline shop-management web app (Next.js 15 / React 19 / TS / Tailwind v4 /
shadcn-base-nova / Prisma 6 / SQLite) for a Kirana & Wholesale shop in
Gaindakot, Nepal. One SQLite file (`prisma/shop.db`), no network needed.
Screens: Counter (home `/`), Stock, Khata (credit), Deliveries, Bills
(purchase/VAT records, `/bills`), Reports. Server Actions for all mutations.
Schema changes: `npm run db:push` (or `npx prisma db push`).

## Current design language (do not regress)

Duolingo-style "sticker" UI kit, applied app-wide in the latest redesign wave
(commits on `main`, see `git log --oneline -5`):
- White canvas, Eager Green **#58cc02** as the single accent.
- **12px radii, 2px solid borders** (thick, sticker-like — no hairline rings,
  no soft shadows), Nunito system-font stack. Buttons pill/44px with red focus.
- Counter redesign: the **bill is the star** — an S.No | Item | Qty | Rate |
  Disc. | Total sheet with sticky header, compact product shelf beside it.
- **Variable pricing**: every line's rate is editable in-sheet, auto-filled from
  the shelf price, and "the rate on the bill is the contract" — it flows through
  checkout to the ledger. Per-line rupee bhaansi clamped so lines never go
  negative.
- **PAN bill mode**: amber sheet + bill number.
- Base-UI `Select` needs an `items` map (value → label) or `SelectValue` shows
  the raw value — see the three selects on `/bills`.

Tallies: `npx tsc --noEmit` + `next build`, dev/prod builds in `.next-dev` /
`.next-prod`. Verify UI in the browser before calling anything done.

## Bills feature (latest, 2026-09-20)

`/bills` records every bill the shop RECEIVES (purchases). Flow: scan the QR
printed on the vendor's bill (camera / photo file / pasted text) →
`lib/vat-qr.ts` deterministically extracts seller PAN, bill number, BS date,
taxable/VAT/total (CBMS JSON, verification URLs, key:value text; EMV payment
QRs rejected — there is NO single official Nepali bill-QR spec, the parser
sniffs known shapes and always keeps the raw payload) → confirm form with a
13%-VAT arithmetic check → saved to `PurchaseBill` with dedupe on
(vendorPAN, billNumber) — the DB unique index means a PAN-identity duplicate
can never be forced, so "Save anyway" is offered only for name-only matches.
BS dates stay as printed; fiscal year (Shrawan–Ashadh) derived. Photos are
optional, client-compressed WebP (`lib/image-compress.ts`), stored on disk in
`data/bill-photos/` (gitignored), served by `/api/bill-photo/[id]`, auto-pruned
by a localStorage retention setting on page open. Tests: `node
scripts/test-vat-qr.ts` (runs on plain node — the lib is dependency-free).

## Roadmap state (ROADMAP.md is the source of truth)

- Phase 1 — all ✅ (camera/HTTPS phone proxy, reports any-day + void/reprint,
  favorites, mobile UI fixes, daily auto-backup).
- Phase 2 — items 1–6 ✅ (bhaansi discounts, cost price + profit, held bills,
  pinned regulars, searchable customer picker, edit saved-bill lines with
  editable per-line rates + bhaansi that respect the original contract).
  **Item 7 ☐ = next:**

  > 1. ☐ **Day summary print** — print the day's totals (cash/udharo/payments)
  >    for the drawer reconciliation file.
- Phase 3 — item 11 ✅ (vendor bill QR records — see above). Items 8–10, 11b ☐
  (date-range reports, sales-by-product, day-CSV, purchase report).
- Phase 4 ☐ (12–16: suppliers — note Bills already stores vendor names/PANs to
  build on; reorder sheet; shelf labels; fast count; expiry).
- Phase 5 ☐ (17–19: customer statement share, WhatsApp reminder, advances).
- Phase 6 ◐ (20–26: autostart, backup age badge/systemd timer, PIN lock, audit
  trail, restore-from-backup UI, error pages, mkcert).
- Phase 7 ☐ (27–31: tests, grid virtualization, Nepali toggle, dark mode, update
  runbook).

## Working rules (from ROADMAP.md)

- One roadmap item at a time; verify in the browser before moving on.
- shadcn/base-nova components everywhere — no bespoke styling that fights the kit.
- Any schema change: `prisma db push` + restart the dev server (a running server
  keeps the old Prisma client — has bitten us before).
- `npx tsc --noEmit` + `next build` before an item is done.

## Suggested first step

Pick **Phase 2 item 7** (day summary print) — the totals it needs are already
computed on `/reports`: cash from sales, udharo added, credit payments, total
cash in hand, discounts. Add a "Print day summary" action that prints the
metrics + the day's transaction list for the drawer reconciliation file, reusing
the existing receipt print bar (window.print + hidden print-only block).

## Gotchas

- SQLite = single writer: one running app instance at a time or the books
  complain.
- `.next-dev` vs `.next-prod` split exists so builds don't poison dev; delete
  both + restart if a page renders unstyled.
- `node scripts/clean-test-data.js` wipes test transactions/customers, keeps
  products. Deleting bills from `/bills` works in-app (test records: none left).
- **The ZCode in-app browser pane never fires `requestAnimationFrame`** (it
  doesn't paint), so Next's streamed-boundary reveal never runs and EVERY page
  hangs on "Loading…" forever — dev and prod, all routes. This is a pane quirk,
  not an app bug; in a real browser the app is fine (proven: full E2E of
  `/bills` worked after shimming rAF with a 16 ms setTimeout fallback injected
  via a temporary `<head>` script in `app/layout.tsx`). To browser-verify again
  in the pane, re-add that shim temporarily and remove it before committing.
- Keep this repo's UI design (the sticker kit above) — it was a deliberate
  rework, not a leftover.
