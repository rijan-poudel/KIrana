/**
 * Deterministic interpreter for the QR codes printed on Nepali bills.
 *
 * There is no single official QR serialization for Nepali tax invoices — each
 * billing software prints its own payload (CBMS-style JSON, verification URLs,
 * plain "key: value" text). This file sniffs the known shapes with pure string
 * and number handling: no AI, no network, no randomness — the same payload
 * always produces the same result. Whatever it cannot confidently read is
 * handed to the review form untouched, with the raw payload kept on the record.
 *
 * Kept dependency-free and import-free so node can run its tests directly
 * (node strips types natively): `node scripts/test-vat-qr.ts`.
 */

export type VatQrFields = {
  vendorName?: string;
  vendorPan?: string;
  billNumber?: string;
  /** Bikram Sambat date as printed, normalized "YYYY.MM.DD". */
  billDateBs?: string;
  /** Gregorian date as ISO "YYYY-MM-DD" when the payload states one. */
  billDateAd?: string;
  /** Nepali fiscal year "YYYY/YY" (Shrawan–Ashadh). */
  fiscalYear?: string;
  taxableAmount?: number;
  vatAmount?: number;
  totalAmount?: number;
  serviceChargePercent?: number;
};

export type VatQrKind = "json" | "url" | "text" | "payment" | "unknown";

export type VatQrResult = {
  kind: VatQrKind;
  fields: VatQrFields;
  /** Deterministic 13% VAT arithmetic cross-check, null when undecidable. */
  vatMath: { ok: boolean; note: string } | null;
  raw: string;
};

const VAT_RATE = 0.13;

/* ------------------------------------------------------------------ */
/* Field aliases                                                       */
/* ------------------------------------------------------------------ */

/** The logical fields an alias row maps onto. "billDate" is handled specially
 *  (it fills billDateBs/billDateAd), the rest name VatQrFields keys directly. */
type AliasField =
  | "vendorName"
  | "vendorPan"
  | "billNumber"
  | "billDate"
  | "fiscalYear"
  | "taxableAmount"
  | "vatAmount"
  | "totalAmount"
  | "serviceChargePercent";

/** Key aliases per logical field, most specific first. Matched case- and
 *  separator-insensitively ("SellerPAN", "seller_pan" both hit "sellerpan"). */
const ALIASES: { field: AliasField; keys: string[] }[] = [
  {
    field: "vendorPan",
    keys: ["sellerpan", "vendorpan", "sellerpannumber", "vendorpannumber", "vnpn", "vnpan", "vnmp", "panno", "pannumber", "pan"],
  },
  {
    field: "vendorName",
    keys: ["sellername", "vendorname", "vnbun", "businessname", "companyname", "suppliername", "seller", "vendor"],
  },
  {
    field: "billNumber",
    keys: ["invoicenumber", "invoiceno", "billnumber", "billno", "invno", "invnumber", "invoicenum", "billnum", "bbn", "invoice", "inv", "bill"],
  },
  {
    field: "billDate",
    keys: ["invoicedate", "billdate", "transactiondate", "billmiti", "invoicemit", "datetimeclient", "date", "miti", "idt", "vndt"],
  },
  { field: "fiscalYear", keys: ["fiscalyear", "fy"] },
  {
    field: "taxableAmount",
    keys: ["taxablesalesvat", "taxableamount", "taxablesales", "taxableamt", "taxable", "nstot", "nettotal", "netamount", "subtotal"],
  },
  {
    field: "vatAmount",
    keys: ["vatamount", "vatamt", "taxamount", "taxamt", "txamt", "vat", "tax"],
  },
  {
    field: "totalAmount",
    keys: ["totalsales", "totalamount", "grandtotal", "trtot", "billamount", "total"],
  },
  { field: "serviceChargePercent", keys: ["servicechargepercent", "scbpr", "servicecharge"] },
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-./]/g, "");
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

/** "Rs. 1,130.00" / " 1130 " → 1130; anything unparseable stays undefined. */
function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/rs\.?/gi, "").replace(/[,\s]/g, "").trim();
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/**
 * Normalize a printed date. Convention on Nepali bills (per the CBMS API spec):
 * dot-separated "2074.07.06" is Bikram Sambat; dash/slash with a modern AD year
 * is Gregorian. Years 2043–2100 with dash/slash are read as BS — no shop scans
 * bills from before ~2043 BS, and the review form lets the entry be corrected.
 */
export function parsePrintedDate(input: string): { bs?: string; ad?: string } {
  const match = input.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return {};
  const [, yRaw, mRaw, dRaw] = match;
  const year = Number(yRaw);
  const month = Number(mRaw);
  const day = Number(dRaw);
  const bs = `${yRaw}.${mRaw.padStart(2, "0")}.${dRaw.padStart(2, "0")}`;
  if (input.includes(".")) return { bs };
  if (year >= 2043 && year <= 2100) return { bs };
  if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) return { ad: `${yRaw}-${mRaw.padStart(2, "0")}-${dRaw.padStart(2, "0")}` };
  return { bs };
}

/** Nepali fiscal year (Shrawan 1 – Ashadh end) for a BS date "YYYY.MM.DD".
 *  Months 4–12 (Shrawan–Chaitra) of BS year Y fall in FY Y/Y+1; months 1–3
 *  (Baishakh–Ashadh) close the previous FY. */
export function fiscalYearForBs(bs: string): string | undefined {
  const match = bs.match(/^(\d{4})\.(\d{2})\./);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = month >= 4 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "2073.074" / "2080-81" / "2074/75" → "2073/74". */
function normalizeFiscalYear(input: string): string | undefined {
  const match = input.trim().match(/^(\d{4})[\s.\-/]?(\d{2})$/);
  if (!match) return undefined;
  return `${match[1]}/${match[2]}`;
}

/* ------------------------------------------------------------------ */
/* Shape sniffing                                                      */
/* ------------------------------------------------------------------ */

/**
 * EMVCo payment QRs (Khalti / eSewa / Fonepay store codes) start with a
 * length-prefixed "00" tag — they carry payment routing, never tax data.
 */
function looksLikePaymentQr(raw: string): boolean {
  return /^00(1[0-9]|2[0-9])010[12]/.test(raw.trim()) || raw.includes("A000000615") || raw.includes("A000000626");
}

function extractFields(record: Record<string, unknown>): VatQrFields {
  const lowered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) lowered[normalizeKey(key)] = value;

  const fields: VatQrFields = {};
  for (const { field, keys } of ALIASES) {
    if (field === "taxableAmount" || field === "vatAmount" || field === "totalAmount" || field === "serviceChargePercent") {
      const value = toNumber(firstString(lowered, keys));
      if (value !== undefined) fields[field] = value;
    } else if (field === "billDate") {
      const rawDate = firstString(lowered, keys);
      if (rawDate) {
        const parsed = parsePrintedDate(rawDate);
        if (parsed.bs) fields.billDateBs = parsed.bs;
        if (parsed.ad) fields.billDateAd = parsed.ad;
      }
    } else if (field === "fiscalYear") {
      const raw = firstString(lowered, keys);
      const normalized = raw ? normalizeFiscalYear(raw) : undefined;
      if (normalized) fields.fiscalYear = normalized;
    } else {
      const value = firstString(lowered, keys);
      if (value) fields[field] = value;
    }
  }

  // PAN sanity: the CBMS system keys on a digit string; drop obvious junk but
  // keep anything plausible (9 digits today, some older PANs differ).
  if (fields.vendorPan) {
    const digits = fields.vendorPan.replace(/\D/g, "");
    fields.vendorPan = digits.length >= 6 && digits.length <= 12 ? digits : undefined;
  }

  // Prefer the fiscal year implied by the printed bill date; fall back to the
  // payload's own fiscal_year field (some softwares round it oddly).
  if (fields.billDateBs) {
    const derived = fiscalYearForBs(fields.billDateBs);
    if (derived) fields.fiscalYear = derived;
  }
  return fields;
}

function vatMathCheck(fields: VatQrFields): VatQrResult["vatMath"] {
  const { taxableAmount, vatAmount } = fields;
  if (taxableAmount === undefined || vatAmount === undefined || taxableAmount <= 0) return null;
  const expected = taxableAmount * VAT_RATE;
  // One rupee of rounding slack per bill — thermal printers round per line.
  const tolerance = Math.max(1, expected * 0.01);
  const ok = Math.abs(expected - vatAmount) <= tolerance;
  return {
    ok,
    note: ok
      ? `VAT ${vatAmount.toFixed(2)} ≈ 13% of ${taxableAmount.toFixed(2)}`
      : `13% of ${taxableAmount.toFixed(2)} is about ${expected.toFixed(2)} — the bill says ${vatAmount.toFixed(2)}`,
  };
}

function fromRecord(record: Record<string, unknown>, raw: string, kind: VatQrKind): VatQrResult {
  const fields = extractFields(record);
  return { kind, fields, vatMath: vatMathCheck(fields), raw };
}

/** Top-level interpreter for a decoded QR string. Never throws. */
export function parseVatQr(raw: string): VatQrResult {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return { kind: "unknown", fields: {}, vatMath: null, raw: "" };

  if (looksLikePaymentQr(trimmed)) {
    return { kind: "payment", fields: {}, vatMath: null, raw: trimmed };
  }

  // JSON payloads (CBMS posts this exact shape; vendor softwares add their own keys).
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const record = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown> | null;
      if (record && typeof record === "object" && !Array.isArray(record)) {
        return fromRecord(record, trimmed, "json");
      }
    } catch {
      // Fall through to looser shapes.
    }
  }

  // Verification links — params carry the invoice data; some softwares wrap a
  // whole JSON payload inside a `data=`/`payload=` param.
  if (/^https?:\/\//i.test(trimmed)) {
    const query = trimmed.slice(trimmed.indexOf("?") + 1);
    const params: Record<string, unknown> = {};
    for (const pair of query.split("&")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const key = safeDecode(pair.slice(0, eq));
      const value = safeDecode(pair.slice(eq + 1));
      if (key) params[key] = value;
    }
    for (const wrapper of ["data", "payload", "q"]) {
      const wrapped = params[wrapper];
      if (typeof wrapped === "string" && wrapped.trim().startsWith("{")) {
        try {
          const inner = JSON.parse(wrapped) as Record<string, unknown>;
          return fromRecord(inner, trimmed, "url");
        } catch {
          // Not JSON after all — treat as plain params.
        }
      }
    }
    return fromRecord(params, trimmed, "url");
  }

  // Plain-text bills: "Seller PAN: 301234567" / "VAT = 130" lines.
  const lines: Record<string, unknown> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:=-]{2,40}?)\s*[:=]\s*(.+?)\s*$/);
    if (match) lines[match[1]] = match[2];
  }
  if (Object.keys(lines).length > 0) {
    return fromRecord(lines, trimmed, "text");
  }

  return { kind: "unknown", fields: {}, vatMath: null, raw: trimmed };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
