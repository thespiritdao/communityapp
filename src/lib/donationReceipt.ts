/**
 * donationReceipt.ts
 *
 * Generates PDF donation receipts and sends them via Resend.
 * Two receipt types:
 *   1. SYSTEM — quid pro quo (8% tax-deductible, remainder is $SYSTEM token purchase)
 *   2. DIRECT — 100% tax-deductible charitable contribution
 *
 * PDF is built with raw PDF syntax (no external library), same pattern as
 * the website's artizen-webhook.js.
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Types ────────────────────────────────────────────────────────────────────

interface SystemDonationReceipt {
  type: 'system';
  donorName: string;
  donorEmail: string;
  donationDate: string;
  paymentId: string;
  fiatAmount: number;
  stripeFee: number;
  operationsFee: number;   // 4% ops
  communityFee: number;    // 4% community
  systemTokensMinted: number;
  communityTokensMinted: number;
  deductibleAmount: number; // fiat - systemTokensMinted
}

interface DirectDonationReceipt {
  type: 'direct';
  donorName: string;
  donorEmail: string;
  donationDate: string;
  paymentId: string;
  fiatAmount: number;
}

type DonationReceipt = SystemDonationReceipt | DirectDonationReceipt;

// ── PDF Generator ────────────────────────────────────────────────────────────

function escPdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

interface PdfLine {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
}

function buildPdf(lines: PdfLine[]): string {
  let stream = '';
  for (const line of lines) {
    const font = line.bold ? '/F2' : '/F1';
    stream += `BT ${font} ${line.size} Tf ${line.x} ${line.y} Td (${escPdf(line.text)}) Tj ET\n`;
  }

  const streamBytes = new TextEncoder().encode(stream);
  const streamLength = streamBytes.length;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>
endobj

4 0 obj
<< /Length ${streamLength} >>
stream
${stream}endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj

xref
0 7
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000${String(370 + streamLength).padStart(3, '0')} 00000 n
0000000${String(450 + streamLength).padStart(3, '0')} 00000 n

trailer
<< /Size 7 /Root 1 0 R >>
startxref
${530 + streamLength}
%%EOF`;

  // Encode to base64
  const bytes = new TextEncoder().encode(pdf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Receipt Builders ─────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(2);
}

function generateSystemReceiptPdf(r: SystemDonationReceipt): string {
  const lines: PdfLine[] = [
    { text: 'SPIRITDAO DONATION RECEIPT', x: 50, y: 750, size: 16, bold: true },
    { text: 'SpiritDAO — 501(c)(3) Nonprofit Organization', x: 50, y: 720, size: 11 },
    { text: 'EIN: 99-1308806', x: 50, y: 705, size: 11 },
    { text: '-----------------------------------------------------', x: 50, y: 688, size: 10 },

    { text: `Date: ${r.donationDate}`, x: 50, y: 665, size: 11 },
    { text: `Donor: ${r.donorName}`, x: 50, y: 648, size: 11 },
    { text: `Email: ${r.donorEmail}`, x: 50, y: 631, size: 11 },
    { text: `Payment ID: ${r.paymentId}`, x: 50, y: 614, size: 9 },
    { text: '-----------------------------------------------------', x: 50, y: 597, size: 10 },

    { text: 'TRANSACTION SUMMARY', x: 50, y: 574, size: 12, bold: true },
    { text: `Total amount:                   $${fmt(r.fiatAmount)} USD`, x: 50, y: 554, size: 11 },
    { text: `Processing fee:                -$${fmt(r.stripeFee)}`, x: 50, y: 537, size: 11 },
    { text: `Operations donation (4%):      -$${fmt(r.operationsFee)}`, x: 50, y: 520, size: 11 },
    { text: `Community fund donation (4%):  -$${fmt(r.communityFee)}`, x: 50, y: 503, size: 11 },
    { text: `$SYSTEM minted to you:          ${fmt(r.systemTokensMinted)} $SYSTEM`, x: 50, y: 486, size: 11, bold: true },
    { text: `Community pool (minted separately): ${fmt(r.communityTokensMinted)} $SYSTEM`, x: 50, y: 469, size: 10 },
    { text: '-----------------------------------------------------', x: 50, y: 452, size: 10 },

    { text: 'TAX DISCLOSURE (IRS Quid Pro Quo)', x: 50, y: 429, size: 12, bold: true },
    { text: 'In exchange for your donation, you received $SYSTEM tokens.', x: 50, y: 409, size: 11 },
    { text: '$SYSTEM is an intercommunity exchange token, backed 1:1 by fiat', x: 50, y: 392, size: 11 },
    { text: 'and redeemable for USD. It facilitates coordination within the', x: 50, y: 375, size: 11 },
    { text: 'SpiritDAO ecosystem (bounties, marketplace, events, and treasury).', x: 50, y: 358, size: 11 },
    { text: '', x: 50, y: 345, size: 11 },
    { text: `Estimated fair market value of tokens received: $${fmt(r.systemTokensMinted)}`, x: 50, y: 332, size: 11 },
    { text: `Per IRS quid pro quo rules, the tax-deductible portion is:`, x: 50, y: 315, size: 11 },
    { text: `$${fmt(r.fiatAmount)} - $${fmt(r.systemTokensMinted)} = $${fmt(r.deductibleAmount)}`, x: 70, y: 295, size: 13, bold: true },
    { text: '', x: 50, y: 278, size: 11 },
    { text: '8% of your donation (operations + community fund) is a charitable', x: 50, y: 265, size: 11 },
    { text: 'contribution. The remaining 92% (minus processing fees) was used to', x: 50, y: 248, size: 11 },
    { text: 'generate $SYSTEM tokens and is not tax-deductible.', x: 50, y: 231, size: 11 },
    { text: '-----------------------------------------------------', x: 50, y: 214, size: 10 },

    { text: 'Please retain this document as your official donation receipt.', x: 50, y: 191, size: 11 },
    { text: 'No goods or services beyond the $SYSTEM tokens described above', x: 50, y: 174, size: 11 },
    { text: 'were provided in connection with this contribution.', x: 50, y: 157, size: 11 },
    { text: '-----------------------------------------------------', x: 50, y: 140, size: 10 },
    { text: 'Questions? Contact us at community@spiritdao.org', x: 50, y: 117, size: 10 },
    { text: 'spiritdao.org', x: 50, y: 102, size: 10 },
  ];

  return buildPdf(lines);
}

function generateDirectReceiptPdf(r: DirectDonationReceipt): string {
  const lines: PdfLine[] = [
    { text: 'SPIRITDAO DONATION RECEIPT', x: 50, y: 750, size: 16, bold: true },
    { text: 'SpiritDAO — 501(c)(3) Nonprofit Organization', x: 50, y: 720, size: 11 },
    { text: 'EIN: 99-1308806', x: 50, y: 705, size: 11 },
    { text: '-----------------------------------------------------', x: 50, y: 688, size: 10 },

    { text: `Date: ${r.donationDate}`, x: 50, y: 665, size: 11 },
    { text: `Donor: ${r.donorName}`, x: 50, y: 648, size: 11 },
    { text: `Email: ${r.donorEmail}`, x: 50, y: 631, size: 11 },
    { text: `Payment ID: ${r.paymentId}`, x: 50, y: 614, size: 9 },
    { text: '-----------------------------------------------------', x: 50, y: 597, size: 10 },

    { text: 'DONATION SUMMARY', x: 50, y: 574, size: 12, bold: true },
    { text: `Amount: $${fmt(r.fiatAmount)} USD`, x: 50, y: 554, size: 13, bold: true },
    { text: 'Type: Direct Charitable Contribution', x: 50, y: 534, size: 11 },
    { text: '-----------------------------------------------------', x: 50, y: 517, size: 10 },

    { text: 'TAX RECEIPT', x: 50, y: 494, size: 12, bold: true },
    { text: 'This letter serves as your official receipt for tax purposes.', x: 50, y: 474, size: 11 },
    { text: 'SpiritDAO is a registered 501(c)(3) nonprofit organization.', x: 50, y: 457, size: 11 },
    { text: '', x: 50, y: 444, size: 11 },
    { text: `Your entire donation of $${fmt(r.fiatAmount)} is tax-deductible to the`, x: 50, y: 431, size: 11 },
    { text: 'full extent permitted by law.', x: 50, y: 414, size: 11 },
    { text: '', x: 50, y: 401, size: 11 },
    { text: '100% of this donation supports SpiritDAO operations, which', x: 50, y: 388, size: 11 },
    { text: 'provides free infrastructure for mission-driven and lifestyle', x: 50, y: 371, size: 11 },
    { text: 'communities around the world.', x: 50, y: 354, size: 11 },
    { text: '', x: 50, y: 341, size: 11 },
    { text: 'No goods or services were provided in exchange for this', x: 50, y: 328, size: 11 },
    { text: 'contribution.', x: 50, y: 311, size: 11 },
    { text: '-----------------------------------------------------', x: 50, y: 294, size: 10 },

    { text: 'Please retain this document as your official donation receipt.', x: 50, y: 271, size: 11 },
    { text: '-----------------------------------------------------', x: 50, y: 254, size: 10 },
    { text: 'Questions? Contact us at community@spiritdao.org', x: 50, y: 231, size: 10 },
    { text: 'spiritdao.org', x: 50, y: 216, size: 10 },
  ];

  return buildPdf(lines);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a PDF receipt (base64-encoded) for a donation.
 */
export function generateDonationReceiptPdf(receipt: DonationReceipt): string {
  if (receipt.type === 'system') {
    return generateSystemReceiptPdf(receipt);
  }
  return generateDirectReceiptPdf(receipt);
}

/**
 * Send a donation receipt email with PDF attachment.
 * Fire-and-forget — logs errors but never throws.
 */
export async function sendDonationReceiptEmail(receipt: DonationReceipt): Promise<void> {
  try {
    const pdfBase64 = generateDonationReceiptPdf(receipt);
    const dateSlug = receipt.donationDate.replace(/,?\s+/g, '-');

    const isSystem = receipt.type === 'system';

    const subject = isSystem
      ? `Your SpiritDAO donation receipt — $${fmt(receipt.fiatAmount)}`
      : `Your SpiritDAO donation receipt — $${fmt(receipt.fiatAmount)}`;

    const bodyText = isSystem
      ? buildSystemEmailBody(receipt)
      : buildDirectEmailBody(receipt);

    const { error } = await resend.emails.send({
      from: 'SpiritDAO Donations <donations@spiritdao.org>',
      to: receipt.donorEmail,
      subject,
      html: bodyText,
      attachments: [
        {
          filename: `SpiritDAO-DonationReceipt-${dateSlug}.pdf`,
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      console.error('[donationReceipt] Resend error:', error);
    } else {
      console.log(`[donationReceipt] Sent ${receipt.type} receipt to ${receipt.donorEmail}`);
    }
  } catch (err) {
    console.error('[donationReceipt] Failed to send receipt email:', err);
  }
}

// ── Email Body Builders ──────────────────────────────────────────────────────

function buildSystemEmailBody(r: SystemDonationReceipt): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Open Sans', Arial, sans-serif; color: #1F2D2A; max-width: 600px; margin: 0 auto; padding: 32px 24px;">

  <div style="border-bottom: 3px solid #2F5D50; padding-bottom: 20px; margin-bottom: 28px;">
    <p style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #8FAAA1; margin: 0 0 8px;">SpiritDAO Donation Receipt</p>
    <h1 style="font-size: 1.5rem; font-weight: 800; margin: 0; color: #1F2D2A;">Thank You for Your Donation</h1>
  </div>

  <p style="font-size: 1rem; color: #5F5A54; margin-bottom: 24px;">
    Dear ${r.donorName},<br><br>
    Thank you for your donation to SpiritDAO. Your $SYSTEM tokens have been minted and are now available in your wallet. Your official tax receipt is attached to this email as a PDF.
  </p>

  <div style="background-color: #F0ECE6; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
    <h2 style="font-size: 0.875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #8FAAA1; margin: 0 0 16px;">Transaction Summary</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #D8D2C8;">
        <td style="padding: 8px 0; font-size: 0.875rem; color: #5F5A54;">Donation amount</td>
        <td style="padding: 8px 0; font-size: 0.875rem; color: #1F2D2A; text-align: right; font-weight: 700;">$${fmt(r.fiatAmount)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #D8D2C8;">
        <td style="padding: 8px 0; font-size: 0.875rem; color: #5F5A54;">Processing fee</td>
        <td style="padding: 8px 0; font-size: 0.875rem; color: #8B3A3A; text-align: right;">-$${fmt(r.stripeFee)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #D8D2C8;">
        <td style="padding: 8px 0; font-size: 0.875rem; color: #5F5A54;">Operations donation (4%)</td>
        <td style="padding: 8px 0; font-size: 0.875rem; color: #8B3A3A; text-align: right;">-$${fmt(r.operationsFee)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #D8D2C8;">
        <td style="padding: 8px 0; font-size: 0.875rem; color: #5F5A54;">Community fund donation (4%)</td>
        <td style="padding: 8px 0; font-size: 0.875rem; color: #8B3A3A; text-align: right;">-$${fmt(r.communityFee)}</td>
      </tr>
      <tr style="border-top: 2px solid #D8D2C8;">
        <td style="padding: 12px 0 8px; font-size: 1rem; font-weight: 700; color: #2F5D50;">$SYSTEM minted to you</td>
        <td style="padding: 12px 0 8px; font-size: 1rem; font-weight: 700; color: #2F5D50; text-align: right;">${fmt(r.systemTokensMinted)} $SYSTEM</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #E8F1EE; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
    <h2 style="font-size: 0.875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #2F5D50; margin: 0 0 12px;">Tax Disclosure</h2>
    <p style="font-size: 0.875rem; color: #5F5A54; line-height: 1.7; margin: 0 0 12px;">
      In exchange for your donation, you received $SYSTEM tokens. $SYSTEM is an intercommunity exchange token, backed 1:1 by fiat and redeemable for USD. It facilitates coordination within the SpiritDAO ecosystem (bounties, marketplace, events, and treasury operations).
    </p>
    <p style="font-size: 0.875rem; color: #5F5A54; line-height: 1.7; margin: 0 0 12px;">
      Per IRS quid pro quo rules, 8% of your donation (operations + community fund) is a charitable contribution. The remaining 92% (minus processing fees) was used to generate $SYSTEM tokens and is not tax-deductible.
    </p>
    <p style="font-size: 1rem; font-weight: 700; color: #2F5D50; margin: 0;">
      Tax-deductible amount: $${fmt(r.deductibleAmount)}
    </p>
  </div>

  <div style="border-top: 1px solid #D8D2C8; margin-top: 32px; padding-top: 20px;">
    <p style="font-size: 0.75rem; color: #8FAAA1; margin: 0 0 8px;">
      SpiritDAO is a registered 501(c)(3) (EIN: 99-1308806)
    </p>
    <p style="font-size: 0.75rem; color: #8FAAA1; margin: 0;">
      Questions? Contact us at <a href="mailto:community@spiritdao.org" style="color: #8FAAA1;">community@spiritdao.org</a>
    </p>
  </div>

</body>
</html>`.trim();
}

function buildDirectEmailBody(r: DirectDonationReceipt): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Open Sans', Arial, sans-serif; color: #1F2D2A; max-width: 600px; margin: 0 auto; padding: 32px 24px;">

  <div style="border-bottom: 3px solid #2F5D50; padding-bottom: 20px; margin-bottom: 28px;">
    <p style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #8FAAA1; margin: 0 0 8px;">SpiritDAO Donation Receipt</p>
    <h1 style="font-size: 1.5rem; font-weight: 800; margin: 0; color: #1F2D2A;">Thank You for Your Donation</h1>
  </div>

  <p style="font-size: 1rem; color: #5F5A54; margin-bottom: 24px;">
    Dear ${r.donorName},<br><br>
    Thank you for your generous direct donation to SpiritDAO. Your official tax receipt is attached to this email as a PDF.
  </p>

  <div style="background-color: #F0ECE6; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #D8D2C8;">
        <td style="padding: 10px 0; font-size: 0.875rem; color: #5F5A54; font-weight: 600;">Amount</td>
        <td style="padding: 10px 0; font-size: 1rem; font-weight: 700; color: #2F5D50; text-align: right;">$${fmt(r.fiatAmount)} USD</td>
      </tr>
      <tr style="border-bottom: 1px solid #D8D2C8;">
        <td style="padding: 10px 0; font-size: 0.875rem; color: #5F5A54; font-weight: 600;">Type</td>
        <td style="padding: 10px 0; font-size: 0.875rem; color: #1F2D2A; text-align: right;">Direct Charitable Contribution</td>
      </tr>
      <tr style="border-bottom: 1px solid #D8D2C8;">
        <td style="padding: 10px 0; font-size: 0.875rem; color: #5F5A54; font-weight: 600;">Date</td>
        <td style="padding: 10px 0; font-size: 0.875rem; color: #1F2D2A; text-align: right;">${r.donationDate}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-size: 0.875rem; color: #5F5A54; font-weight: 600;">Receipt ID</td>
        <td style="padding: 10px 0; font-size: 0.8125rem; color: #5F5A54; text-align: right; font-family: monospace;">${r.paymentId}</td>
      </tr>
    </table>
  </div>

  <p style="font-size: 0.9375rem; color: #5F5A54; line-height: 1.7;">
    SpiritDAO is a registered 501(c)(3) nonprofit organization (EIN: 99-1308806). Your entire donation of <strong>$${fmt(r.fiatAmount)}</strong> is tax-deductible to the full extent permitted by law.
  </p>

  <p style="font-size: 0.9375rem; color: #5F5A54; line-height: 1.7;">
    100% of this donation supports SpiritDAO operations, providing free infrastructure for mission-driven and lifestyle communities around the world. No goods or services were provided in exchange for this contribution.
  </p>

  <div style="border-top: 1px solid #D8D2C8; margin-top: 32px; padding-top: 20px;">
    <p style="font-size: 0.75rem; color: #8FAAA1; margin: 0 0 8px;">
      SpiritDAO is a registered 501(c)(3) (EIN: 99-1308806)
    </p>
    <p style="font-size: 0.75rem; color: #8FAAA1; margin: 0;">
      Questions? Contact us at <a href="mailto:community@spiritdao.org" style="color: #8FAAA1;">community@spiritdao.org</a>
    </p>
  </div>

</body>
</html>`.trim();
}
