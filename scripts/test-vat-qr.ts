/**
 * Deterministic tests for the Nepali bill-QR interpreter. Run with node
 * (v23+ strips types natively):  node scripts/test-vat-qr.ts
 */
import assert from "node:assert/strict";
import { fiscalYearForBs, parsePrintedDate, parseVatQr } from "../lib/vat-qr.ts";

// 1. Official CBMS API payload shape (from IRD's documentation).
const cbms = parseVatQr(
  JSON.stringify({
    username: "Test_CBMS",
    seller_pan: "999999999",
    buyer_pan: "123456789",
    fiscal_year: "2073.074",
    invoice_number: "102",
    invoice_date: "2074.07.06",
    total_sales: 1130,
    taxable_sales_vat: 1000,
    vat: 130,
  }),
);
assert.equal(cbms.kind, "json");
assert.equal(cbms.fields.vendorPan, "999999999");
assert.equal(cbms.fields.billNumber, "102");
assert.equal(cbms.fields.billDateBs, "2074.07.06");
assert.equal(cbms.fields.fiscalYear, "2074/75");
assert.equal(cbms.fields.taxableAmount, 1000);
assert.equal(cbms.fields.vatAmount, 130);
assert.equal(cbms.fields.totalAmount, 1130);
assert.equal(cbms.vatMath?.ok, true);

// 2. Vendor-POS style JSON (camelCase keys seen on printed bills).
const vendor = parseVatQr(
  '{"SCBPR":0,"BPNM":"602123456","VNBUN":"SAHARA STORE PVT. LTD.","VNPN":"501234567",' +
    '"BBN":"INV-001","NSTOT":1000,"TXAMT":130,"TRTOT":1130,"IDT":"2082.05.12"}',
);
assert.equal(vendor.kind, "json");
assert.equal(vendor.fields.vendorName, "SAHARA STORE PVT. LTD.");
assert.equal(vendor.fields.vendorPan, "501234567");
assert.equal(vendor.fields.billNumber, "INV-001");
assert.equal(vendor.fields.billDateBs, "2082.05.12");
assert.equal(vendor.fields.fiscalYear, "2082/83");
assert.equal(vendor.vatMath?.ok, true);

// 3. Verification URL with the invoice data in query params.
const url = parseVatQr(
  "https://verifier.ird.gov.np/bill?pan=301234567&inv=12345&date=2082.05.12&taxable=5000&vat=650&total=5650",
);
assert.equal(url.kind, "url");
assert.equal(url.fields.vendorPan, "301234567");
assert.equal(url.fields.billNumber, "12345");
assert.equal(url.fields.taxableAmount, 5000);
assert.equal(url.fields.vatAmount, 650);
assert.equal(url.fields.totalAmount, 5650);

// 4. Plain "key: value" text QR.
const text = parseVatQr("Seller PAN: 301234567\nBill No: 5567\nMiti: 2082.05.12\nVAT: 130.00\nTotal: 1130");
assert.equal(text.kind, "text");
assert.equal(text.fields.vendorPan, "301234567");
assert.equal(text.fields.billNumber, "5567");
assert.equal(text.fields.billDateBs, "2082.05.12");
assert.equal(text.fields.vatAmount, 130);
assert.equal(text.fields.totalAmount, 1130);

// 5. EMVCo payment QR (Khalti/eSewa/Fonepay) — never tax data.
const payment = parseVatQr("0002010102110216A00000061501010108025104929530007485");
assert.equal(payment.kind, "payment");
assert.deepEqual(payment.fields, {});

// 6. Garbage degrades to "unknown" without throwing.
const junk = parseVatQr("hello world");
assert.equal(junk.kind, "unknown");
assert.deepEqual(junk.fields, {});
assert.equal(parseVatQr("").kind, "unknown");
assert.equal(parseVatQr("{not json at all").kind, "unknown");

// 7. VAT arithmetic cross-check flags a wrong VAT line.
const badMath = parseVatQr('{"seller_pan":"999999999","invoice_number":"1","taxable_sales_vat":1000,"vat":120,"total_sales":1120}');
assert.equal(badMath.vatMath?.ok, false);

// 8. Fiscal year boundaries: Shrawan (month 4) opens the FY; Ashadh (month 3) closes it.
assert.equal(fiscalYearForBs("2082.04.01"), "2082/83");
assert.equal(fiscalYearForBs("2082.03.32"), "2081/82");
assert.equal(fiscalYearForBs("2074.07.06"), "2074/75");
assert.equal(fiscalYearForBs("garbage"), undefined);

// 9. Date conventions: dot = BS; dash with a modern year = AD; dash with a
//    BS-era year = BS (no shop scans pre-2043 paper).
assert.deepEqual(parsePrintedDate("2074.07.06"), { bs: "2074.07.06" });
assert.deepEqual(parsePrintedDate("2026-09-19T10:30:00"), { ad: "2026-09-19" });
assert.deepEqual(parsePrintedDate("2082/5/12"), { bs: "2082.05.12" });
assert.deepEqual(parsePrintedDate("2015-03-02"), { ad: "2015-03-02" });

// 10. Messy numbers still parse.
const messy = parseVatQr('{"seller_pan":"9 digits only","invoice_number":"77","taxable_sales_vat":"1,000.00","vat":"Rs. 130.00","total_sales":" 1130 "}');
assert.equal(messy.fields.taxableAmount, 1000);
assert.equal(messy.fields.vatAmount, 130);
assert.equal(messy.fields.totalAmount, 1130);
assert.equal(messy.fields.vendorPan, undefined); // "9 digits only" → "9" is too short → dropped

console.log("vat-qr: all tests passed");
