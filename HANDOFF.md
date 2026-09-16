# HANDOFF — Milan Grocery (KIrana)

Resume prompt for the next agent session. Read `ROADMAP.md` + `README.md` too.

## What the app is

Offline shop-management web app (Next.js 15 / React 19 / TS / Tailwind v4 /
shadcn-base-nova / Prisma 6 / SQLite) for a Kirana & Wholesale shop in
Gaindakot, Nepal. One SQLite file (`prisma/shop.db`), no network needed.
Screens: Counter (home `/`), Stock, Khata (credit), Deliveries, Reports. Server
Actions for all mutations. Add noves `prisma db push` (or `npm run db:push`).

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
- Prior design polish commits kept consistency: 2px borders everywhere, replaced
  the last `oklch` color, dropped soft tab shadow.

Tallies: `npx tsc --noEmit` + `next build`, dev/prod builds in `.next-dev` /
`.next-prod`. Verify UI in the browser before calling anything done.

## Roadmap state (ROADMAP.md is the source of truth)

- Phase 1 — all ✅ (camera/HTTPS phone proxy, reports any-day + void/reprint,
  favorites, mobile UI fixes, daily auto-backup).
- Phase 2 — items 1–5 ✅ (bhaansi discounts, cost price + profit, held bills,
  pinned regulars, searchable customer picker). **Items 6–7 ☐ = next:**

  > 1. ☐ **Edit a saved bill's lines** (beyond void + re-entry) — fix a wrong
  >    quantity/price without deleting the record.
  > 2. ☐ **Day summary print** — print the day's totals (cash/udharo/payments)
  >    for the drawer reconciliation file.

- Phase 3 ☐ (8–11: date-range reports, sales-by-product/category, CSV export,
  purchase report).
- Phase 4 ☐ (12–16: suppliers, reorder sheet, barcode shelf labels, fast count,
  expiry tracking).
- Phase 5 ☐ (17–19: customer statement share, WhatsApp reminder, advance flows).
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

Pick **Phase 2 item 6** (editable saved-bill lines) — the natural next task. It
touches the edit-bill machinery already present in `app/reports/edit-bill-dialog.tsx`;
extend it to edit
line quantities/prices and re-write the StockMove ledger deltas atomically (the
checkout transaction in `actions/shop-actions.ts` is the pattern to mirror, and
cost-price-weighted-average updates have the analogous atomicity), then reuse
the day-report totals already on `/reports` for item 7.

## Gotchas

- SQLite = single writer: one running app instance at a time or the books
  complain.
- `.next-dev` vs `.next-prod` split exists so builds don't poison dev; delete
  both + restart if a page renders unstyled.
- `node scripts/clean-test-data.js` wipes test transactions/customers, keeps
  products.
- Keep this repo's UI design (the sticker kit above) — it was a deliberate
  rework, not a leftover.