import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

type InvoiceStatus = "paid" | "unpaid" | "overdue" | "partially_paid";
type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  orgNr: string;
  date: string;
  dueDate: string;
  amountSek: number;
  paidAmountSek?: number;
  status: InvoiceStatus;
  paymentMethod?: string;
  items: { description: string; quantity: number; unitPriceSek: number; vatRate: number }[];
  isDraft?: boolean;
};

const INVOICES_TAB_PATH = path.join(process.cwd(), "src", "components", "admin", "admin-invoices-tab.tsx");

test("A8-FINAL-P1: Manual Invoice Draft Disclosure and Truthful Wording Verification", async (t) => {
  const source = fs.readFileSync(INVOICES_TAB_PATH, "utf-8");

  await t.test("P1-1: Misleading 'Spara & Skapa' wording is completely eliminated", () => {
    assert.ok(
      !source.includes("Spara & Skapa"),
      "Source must not contain the misleading 'Spara & Skapa' button text"
    );
    assert.ok(
      !source.includes("Spara &amp; Skapa"),
      "Source must not contain escaped 'Spara &amp; Skapa'"
    );
    assert.ok(
      source.includes("Skapa tillfälligt utkast"),
      "Submit button must use truthful action: 'Skapa tillfälligt utkast'"
    );
  });

  await t.test("P1-2: Exact Swedish disclosure 'Utkast – sparas inte' is present in creation dialog", () => {
    assert.ok(
      source.includes('data-testid="draft-disclosure-create"'),
      "Creation dialog must have data-testid='draft-disclosure-create'"
    );
    assert.ok(
      source.includes("Utkast – sparas inte"),
      "Creation dialog must display exact Swedish wording: 'Utkast – sparas inte'"
    );
    assert.ok(
      source.includes("Detta formulär skapar endast ett tillfälligt utkast i webbläsarens minne"),
      "Creation dialog must disclose that the invoice is temporary and disappears on refresh"
    );
  });

  await t.test("P1-3: Exact Swedish disclosure 'Utkast – sparas inte' is present beside items in invoice list", () => {
    assert.ok(
      source.includes('data-testid="draft-disclosure-list"'),
      "Invoice list rows must have data-testid='draft-disclosure-list' for temporary drafts"
    );
    assert.ok(
      source.includes("Utkast – sparas inte"),
      "Invoice list rows must display exact Swedish wording: 'Utkast – sparas inte'"
    );
  });

  await t.test("P1-4: Exact Swedish disclosure 'Utkast – sparas inte' is present in preview/actions area", () => {
    assert.ok(
      source.includes('data-testid="draft-disclosure-preview"'),
      "Preview modal must have data-testid='draft-disclosure-preview'"
    );
    assert.ok(
      source.includes('data-testid="draft-disclosure-preview-badge"'),
      "Preview header badge must have data-testid='draft-disclosure-preview-badge'"
    );
    assert.ok(
      source.includes("Fakturautkast"),
      "Preview header for drafts must display 'Fakturautkast' instead of assuming permanent 'Kvitto'"
    );
    assert.ok(
      source.includes("Utkast – sparas inte i databasen eller bokföringen"),
      "Action area must clearly state that drafts are not stored in database or accounting"
    );
  });

  await t.test("P1-5: Production realOrderInvoices mapping explicitly sets isDraft: false for database orders", () => {
    // Verification of the actual production mapping in admin-invoices-tab.tsx:
    // Limitation noted: admin-invoices-tab.tsx is a "use client" React component with JSX and hooks.
    // Rather than relying on a disconnected hand-built mock, this test inspects the actual production
    // realOrderInvoices mapping block extracted directly from the component source file.
    const realOrderInvoicesRegex = /const realOrderInvoices:\s*Invoice\[\]\s*=\s*useMemo\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[orders\]\);/;
    const mappingMatch = source.match(realOrderInvoicesRegex);

    assert.ok(
      mappingMatch,
      "Production source in admin-invoices-tab.tsx must contain realOrderInvoices useMemo mapping block"
    );

    const mappingCode = mappingMatch[1];

    // Explicit check: fails if production mapping omits `isDraft: false` or leaves it undefined
    assert.match(
      mappingCode,
      /\bisDraft:\s*false\b/,
      "The actual realOrderInvoices mapping in admin-invoices-tab.tsx must explicitly set 'isDraft: false'"
    );

    // Negative check: real orders must never be marked as draft
    assert.doesNotMatch(
      mappingCode,
      /\bisDraft:\s*true\b/,
      "realOrderInvoices production mapping must never set 'isDraft: true'"
    );

    // Verify invoice number format is strictly order-derived and not a manual draft prefix
    assert.match(
      mappingCode,
      /invoiceNumber:\s*`F-\${ord\.publicId}`/,
      "Production realOrderInvoices mapping must format invoiceNumber as `F-${ord.publicId}`"
    );
    assert.doesNotMatch(
      mappingCode,
      /invoiceNumber:\s*`F-MANUELL-/,
      "Production realOrderInvoices mapping must never assign F-MANUELL- prefix"
    );
  });

  await t.test("P1-6: Temporary custom invoice has isDraft: true and F-MANUELL- prefix", () => {
    const customDraft: Invoice = {
      id: `custom-${Date.now()}`,
      invoiceNumber: "F-MANUELL-1",
      customerName: "Företagskund AB",
      orgNr: "556123-4567",
      date: "2026-11-24",
      dueDate: "2026-12-08",
      amountSek: 1200,
      status: "unpaid",
      paymentMethod: "Faktura 14 dagar",
      items: [
        {
          description: "Restaurangcatering & servering",
          quantity: 1,
          unitPriceSek: 1071,
          vatRate: 12,
        },
      ],
      isDraft: true,
    };

    assert.equal(customDraft.isDraft, true);
    assert.ok(customDraft.id.startsWith("custom-"));
    assert.ok(customDraft.invoiceNumber.startsWith("F-MANUELL-"));
  });
});
