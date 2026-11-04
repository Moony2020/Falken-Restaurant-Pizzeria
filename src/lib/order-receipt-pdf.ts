export type ReceiptPdfInput = {
  orderNumber: string;
  customerName: string;
  phone?: string;
  date: string;
  paymentMethod: string;
  paymentStatus: string;
  totalSek: number;
  items: { description: string; quantity: number; unitPriceSek: number }[];
};

function sanitizePdfText(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/×/g, "x")
    .replace(/[·•]/g, "-")
    .replace(/å/g, "\\345")
    .replace(/ä/g, "\\344")
    .replace(/ö/g, "\\366")
    .replace(/Å/g, "\\305")
    .replace(/Ä/g, "\\304")
    .replace(/Ö/g, "\\326")
    .replace(/é/g, "\\351");
}

function estimatePdfTextWidth(text: string, fontSize: number, isBold = false): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);
    if (code === 32) {
      width += 0.278 * fontSize;
    } else if (code >= 48 && code <= 57) {
      width += (isBold ? 0.6 : 0.556) * fontSize;
    } else if (code >= 65 && code <= 90) {
      if (char === "I" || char === "J") width += 0.33 * fontSize;
      else if (char === "M" || char === "W") width += 0.85 * fontSize;
      else width += (isBold ? 0.72 : 0.67) * fontSize;
    } else if (code >= 97 && code <= 122) {
      if (char === "i" || char === "l") width += 0.25 * fontSize;
      else if (char === "m" || char === "w") width += 0.78 * fontSize;
      else if (char === "r" || char === "t" || char === "f") width += 0.35 * fontSize;
      else width += (isBold ? 0.58 : 0.52) * fontSize;
    } else if (char === ":" || char === "." || char === ",") {
      width += 0.278 * fontSize;
    } else if (char === "-") {
      width += 0.35 * fontSize;
    } else {
      width += 0.5 * fontSize;
    }
  }
  return width;
}

function pushPdfRoundedRect(
  ops: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  mode: "f" | "s" | "B"
): void {
  const k = 0.552284749831 * r;
  const x0 = x + r;
  const x1 = x + w - r;
  const y0 = y + r;
  const y1 = y + h - r;
  ops.push(
    `${x0} ${y} m ` +
    `${x1} ${y} l ` +
    `${x + w - r + k} ${y} ${x + w} ${y + r - k} ${x + w} ${y0} c ` +
    `${x + w} ${y1} l ` +
    `${x + w} ${y + h - r + k} ${x + w - r + k} ${y + h} ${x1} ${y + h} c ` +
    `${x0} ${y + h} l ` +
    `${x + r - k} ${y + h} ${x} ${y + h - r + k} ${x} ${y1} c ` +
    `${x} ${y0} l ` +
    `${x} ${y + r - k} ${x + r - k} ${y} ${x0} ${y} c ` +
    mode
  );
}

export function downloadReceiptPdf(input: ReceiptPdfInput): void {
  const cleanOrderNumber = input.orderNumber.replace(/^#/, "");
  const isPaid = input.paymentStatus.toLowerCase().includes("betald") || input.paymentStatus.toLowerCase() === "paid";
  const docTitle = isPaid ? `Kvitto ${cleanOrderNumber}` : `Orderbekräftelse ${cleanOrderNumber}`;
  const statusLabel = isPaid ? "Betald" : "Väntar på betalning";

  // Standard A4 dimensions in points: 595.28 x 841.89
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  // Card width matches printed 90mm exactly (90mm / 25.4 * 72 = 255.1 pt)
  const cardWidth = 255;
  const cardLeft = Math.round((pageWidth - cardWidth) / 2); // 170 pt
  const cardRight = cardLeft + cardWidth; // 425 pt
  const innerPad = 14;
  const leftX = cardLeft + innerPad; // 184 pt
  const rightX = cardRight - innerPad; // 411 pt

  const streamOps: string[] = [];

  // Calculate dynamic card height with generous padding matching printout
  const itemsCount = Math.max(1, input.items.length);
  const cardHeight = 315 + itemsCount * 17 + (input.phone ? 15 : 0);
  const cardTop = 780;
  const cardBottom = cardTop - cardHeight;

  // Background card: clean white with dashed border [3 3] and rounded corners r=8 matching print style
  streamOps.push("q");
  streamOps.push("1 1 1 rg");
  streamOps.push("0.73 0.73 0.73 RG 0.85 w [3 3] 0 d");
  pushPdfRoundedRect(streamOps, cardLeft, cardBottom, cardWidth, cardHeight, 8, "B");
  streamOps.push("Q");

  const pushCentered = (text: string, font: string, size: number, y: number, r = 0, g = 0, b = 0) => {
    const w = estimatePdfTextWidth(text, size, font === "/F1");
    const x = Math.round(cardLeft + (cardWidth - w) / 2);
    streamOps.push(`BT ${font} ${size} Tf ${r} ${g} ${b} rg 1 0 0 1 ${x} ${y} Tm (${sanitizePdfText(text)}) Tj ET`);
  };

  const pushRow = (
    leftText: string,
    rightText: string,
    font: string,
    size: number,
    y: number,
    isBoldRight = false,
    textR = 0.2,
    textG = 0.2,
    textB = 0.2
  ) => {
    const rw = estimatePdfTextWidth(rightText, size, isBoldRight);
    const rx = Math.round(rightX - rw);
    streamOps.push(`BT ${font} ${size} Tf ${textR} ${textG} ${textB} rg 1 0 0 1 ${leftX} ${y} Tm (${sanitizePdfText(leftText)}) Tj ET`);
    const rFont = isBoldRight ? "/F1" : font;
    streamOps.push(`BT ${rFont} ${size} Tf 0.12 0.14 0.16 rg 1 0 0 1 ${rx} ${y} Tm (${sanitizePdfText(rightText)}) Tj ET`);
  };

  const pushDashedLine = (y: number) => {
    streamOps.push(`0.75 w [2 2] 0 d 0.82 0.79 0.74 RG ${leftX} ${y} m ${rightX} ${y} l S [] 0 d`);
  };

  let curY = cardTop - 22;

  // Header branding in gold
  pushCentered("FALKEN RESTAURANG & PIZZERIA", "/F1", 10.5, curY, 0.64, 0.53, 0.29);
  curY -= 14;
  pushCentered("Kungsbacka - Tel: 0300-123 45", "/F2", 8, curY, 0.49, 0.51, 0.55);
  curY -= 16;

  // Pill badge background & text with rounded corners r=8
  const badgeText = docTitle;
  const badgeWidth = estimatePdfTextWidth(badgeText, 9, true) + 18;
  const badgeLeft = Math.round(cardLeft + (cardWidth - badgeWidth) / 2);
  streamOps.push("q");
  streamOps.push("0.95 0.93 0.88 rg");
  pushPdfRoundedRect(streamOps, badgeLeft, curY - 3, badgeWidth, 16, 8, "f");
  streamOps.push("Q");
  pushCentered(badgeText, "/F1", 9, curY + 2, 0.12, 0.14, 0.16);
  curY -= 15;

  // Dashed divider
  pushDashedLine(curY);
  curY -= 15;

  // Metadata
  pushRow("Datum:", input.date, "/F2", 8.5, curY, true);
  curY -= 15;
  pushRow("Kund:", input.customerName, "/F2", 8.5, curY, true);
  curY -= 15;
  if (input.phone) {
    pushRow("Telefon:", input.phone, "/F2", 8.5, curY, true);
    curY -= 15;
  }
  pushRow("Betalsätt:", input.paymentMethod, "/F2", 8.5, curY, true);
  curY -= 15;
  pushRow("Status:", statusLabel, "/F2", 8.5, curY, true);
  curY -= 13;

  // Dashed divider
  pushDashedLine(curY);
  curY -= 15;

  // Items header
  streamOps.push(`BT /F1 8 Tf 0.55 0.51 0.48 rg 1 0 0 1 ${leftX} ${curY} Tm (${sanitizePdfText("BESTÄLLDA ARTIKLAR")}) Tj ET`);
  curY -= 15;

  // Items
  for (const it of input.items) {
    const cleanDesc = it.description.replace(/^\d+\s*[x×]\s*/i, "");
    const lineText = `${it.quantity}x ${cleanDesc}`;
    const priceText = `${it.quantity * it.unitPriceSek} kr`;
    pushRow(lineText, priceText, "/F2", 8.5, curY, true);
    curY -= 15;
  }

  // Dashed divider
  pushDashedLine(curY);
  curY -= 15;

  // Totals
  const vatAmount = Math.round(input.totalSek * 0.1071);
  const subtotalExcl = input.totalSek - vatAmount;
  pushRow("Delsumma (exkl. moms):", `${subtotalExcl} kr`, "/F2", 8, curY, false, 0.49, 0.51, 0.55);
  curY -= 14;
  pushRow("Moms (12%):", `${vatAmount} kr`, "/F2", 8, curY, false, 0.49, 0.51, 0.55);
  curY -= 16;

  // Grand Total
  pushRow("Totalt att betala:", `${input.totalSek} kr`, "/F1", 10.5, curY, true, 0.12, 0.14, 0.16);
  curY -= 15;

  // Dashed divider
  pushDashedLine(curY);
  curY -= 18;

  // Footer note
  pushCentered("Tack för din beställning hos Falken!", "/F2", 8, curY, 0.49, 0.51, 0.55);
  curY -= 12;
  pushCentered("Godkänd för F-skatt - Org.nr 556123-4567", "/F2", 7, curY, 0.63, 0.6, 0.56);

  const streamContent = streamOps.join("\n");
  const streamLen = new TextEncoder().encode(streamContent).length;

  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj",
    "6 0 obj\n<< /Length " + streamLen + " >>\nstream\n" + streamContent + "\nendstream\nendobj",
  ];

  const header = "%PDF-1.4\n";
  const offsets: number[] = [];
  let currentOffset = new TextEncoder().encode(header).length;

  for (const obj of objs) {
    offsets.push(currentOffset);
    currentOffset += new TextEncoder().encode(obj + "\n").length;
  }

  const startXref = currentOffset;
  let xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
  for (const off of offsets) {
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }

  const trailer =
    "trailer\n<< /Size " +
    (objs.length + 1) +
    " /Root 1 0 R >>\nstartxref\n" +
    startXref +
    "\n%%EOF\n";

  const fullPdfString = header + objs.join("\n") + "\n" + xref + trailer;
  const pdfBytes = new TextEncoder().encode(fullPdfString);

  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kvitto_${cleanOrderNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printOrderReceipt(input: ReceiptPdfInput): void {
  const cleanOrderNumber = input.orderNumber.replace(/^#/, "");
  const isPaid = input.paymentStatus.toLowerCase().includes("betald") || input.paymentStatus.toLowerCase() === "paid";
  const docTitle = isPaid ? `Kvitto ${cleanOrderNumber}` : `Orderbekräftelse ${cleanOrderNumber}`;
  const statusLabel = isPaid ? "Betald" : "Väntar på betalning";
  const vatAmount = Math.round(input.totalSek * 0.1071);
  const subtotalExcl = input.totalSek - vatAmount;
  const suggestedFileName = `kvitto_${cleanOrderNumber}`;

  const itemsHtml = input.items
    .map((it) => {
      const cleanDesc = it.description.replace(/^\d+\s*[x×]\s*/i, "");
      return `
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px dashed #eee; font-weight: 500; color: #1f2328;">${it.quantity}x ${cleanDesc}</td>
        <td style="padding: 5px 0; border-bottom: 1px dashed #eee; text-align: right; font-weight: 600; white-space: nowrap; color: #1f2328;">${it.quantity * it.unitPriceSek} kr</td>
      </tr>`;
    })
    .join("");

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowDateFormatted = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const printHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>${suggestedFileName}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 0 !important;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #1f2328;
        font-size: 12px;
        line-height: 1.4;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .page-wrap {
        width: 100%;
        margin: 0;
        padding-top: 10mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        box-sizing: border-box;
        position: relative;
      }
      .print-meta-date {
        position: absolute;
        top: 3.5mm;
        left: 10mm;
        font-size: 11px;
        color: #4b5563;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .container {
        width: 90mm;
        max-width: 90mm;
        margin: 0 auto;
        border: 1px dashed #bbb;
        border-radius: 8px;
        padding: 16px 14px;
        background: #ffffff;
        box-shadow: none;
      }
      .header {
        text-align: center;
        border-bottom: 1px dashed #dcd5c7;
        padding-bottom: 12px;
        margin-bottom: 12px;
      }
      .restaurant-name {
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.8px;
        color: #a3884b;
        text-transform: uppercase;
        margin: 0 0 2px;
      }
      .subtitle {
        font-size: 10.5px;
        color: #7c828d;
        margin: 0 0 8px;
      }
      .doc-badge {
        display: inline-block;
        padding: 2px 12px;
        background: #f3ece0;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        color: #1f2328;
      }
      .meta {
        font-size: 11.5px;
        margin-bottom: 12px;
        border-bottom: 1px dashed #dcd5c7;
        padding-bottom: 10px;
      }
      .meta-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 4px;
        color: #555a64;
      }
      .meta-row span:last-child {
        color: #1f2328;
        font-weight: 600;
        text-align: right;
      }
      .items-header {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: #8c827a;
        margin: 0 0 6px;
      }
      .items {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 10px;
        font-size: 11.5px;
      }
      .totals {
        border-top: 1px dashed #dcd5c7;
        padding-top: 10px;
        margin-top: 6px;
        font-size: 11.5px;
      }
      .total-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 4px;
        color: #7c828d;
      }
      .grand-total {
        font-size: 14px;
        font-weight: 700;
        color: #1f2328;
        margin-top: 6px;
        border-top: 1px solid #eee;
        padding-top: 6px;
      }
      .grand-total span:last-child {
        color: #837147;
      }
      .footer {
        text-align: center;
        font-size: 10px;
        color: #8c827a;
        margin-top: 14px;
        border-top: 1px dashed #dcd5c7;
        padding-top: 10px;
      }
      .footer p {
        margin: 2px 0;
      }
      @media print {
        @page {
          size: A4 portrait;
          margin: 0 !important;
        }
        html, body {
          background: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .page-wrap {
          margin: 0 !important;
          padding-top: 10mm !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: flex-start !important;
          position: relative !important;
        }
        .print-meta-date {
          display: block !important;
          position: absolute !important;
          top: 3.5mm !important;
          left: 10mm !important;
        }
        .container {
          width: 90mm !important;
          max-width: 90mm !important;
          margin: 0 auto !important;
          border: 1px dashed #bbb !important;
          border-radius: 8px !important;
          box-shadow: none !important;
          background: #ffffff !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="page-wrap">
      <div class="print-meta-date">${nowDateFormatted}</div>
      <div class="container">
        <div class="header">
          <p class="restaurant-name">Falken Restaurang &amp; Pizzeria</p>
          <p class="subtitle">Kungsbacka · Tel: 0300-123 45</p>
          <div class="doc-badge">${docTitle}</div>
        </div>
        <div class="meta">
          <div class="meta-row"><span>Datum:</span><span>${input.date}</span></div>
          <div class="meta-row"><span>Kund:</span><span>${input.customerName}</span></div>
          ${input.phone ? `<div class="meta-row"><span>Telefon:</span><span>${input.phone}</span></div>` : ""}
          <div class="meta-row"><span>Betalsätt:</span><span>${input.paymentMethod}</span></div>
          <div class="meta-row"><span>Status:</span><span>${statusLabel}</span></div>
        </div>
        <p class="items-header">Beställda artiklar</p>
        <table class="items">
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="totals">
          <div class="total-row"><span>Delsumma (exkl. moms):</span><span>${subtotalExcl} kr</span></div>
          <div class="total-row"><span>Moms (12%):</span><span>${vatAmount} kr</span></div>
          <div class="total-row grand-total"><span>Totalt att betala:</span><span>${input.totalSek} kr</span></div>
        </div>
        <div class="footer">
          <p style="font-style: italic;">Tack för din beställning hos Falken!</p>
          <p style="font-size: 9.5px; color: #a09a90;">Godkänd för F-skatt · Org.nr 556123-4567</p>
        </div>
      </div>
    </div>
  </body>
  </html>`;

  const prevTitle = typeof document !== "undefined" ? document.title : "";

  // Hidden iframe: prints directly without opening an about:blank window or tab in Chrome
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.opacity = "0";
  iframe.style.zIndex = "-1";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(printHtml);
    doc.close();

    // Set title for suggested filename when saving as PDF
    if (typeof document !== "undefined") {
      document.title = suggestedFileName;
    }
    if (iframe.contentDocument) {
      iframe.contentDocument.title = suggestedFileName;
    }

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (typeof document !== "undefined" && prevTitle) {
          document.title = prevTitle;
        }
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  }
}
