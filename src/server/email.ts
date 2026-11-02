import nodemailer from "nodemailer";
import { mapsUrl, site } from "../data/site.ts";

export type SendResetEmailInput = {
  to: string;
  name?: string;
  resetUrl: string;
};

export type SendEmailResult = {
  sent: boolean;
  mode: "brevo" | "smtp" | "dev";
  resetUrl: string;
  error?: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const from =
    process.env.SMTP_FROM?.trim() ||
    (user ? `"Falken Restaurang & Pizzeria" <${user}>` : `"Falken Administration" <noreply@falkenrestaurang.se>`);

  const isConfigured = Boolean(host && user && pass);
  return { isConfigured, host, port, user, pass, secure, from };
}

export function generatePasswordResetEmailHtml(name: string, resetUrl: string): string {
  const recipientName = name.trim() || "Administratör";
  const origin = (() => {
    try {
      return new URL(resetUrl).origin;
    } catch {
      return site.url;
    }
  })();

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Återställ ditt lösenord – Falken Restaurang & Pizzeria</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0d10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0d10; background: #0b0d10 radial-gradient(circle at 50% 100px, #252019 0%, #131518 55%, #0b0d10 100%); padding: 36px 15px 44px 15px;">
    <tr>
      <td align="center">
        <!-- Top Brand Header (matches Admin Login icon & typography) -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin-bottom: 22px;">
          <tr>
            <td align="center" style="text-align: center;">
              <!-- Admin Falcon Emblem Badge (exact same icon from admin login page) -->
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto 12px auto;">
                <tr>
                  <td align="center" style="width: 56px; height: 56px; border-radius: 18px; background-color: #f7edd9; border: 1.5px solid #d5b46e; text-align: center; vertical-align: middle;">
                    <img
                      src="${origin}/images/falken-admin-emblem.png"
                      width="48"
                      height="48"
                      alt="Falken Emblem"
                      style="display: block; width: 48px; height: 48px; margin: 0 auto; border: 0;"
                    />
                  </td>
                </tr>
              </table>

              <!-- Brand Name -->
              <div style="font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: 600; color: #fbf9f4; letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 4px 0; text-align: center;">
                FALKEN
              </div>
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; font-weight: 600; color: #d4af37; letter-spacing: 0.35em; text-transform: uppercase; margin: 0 0 12px 0; text-align: center;">
                Restaurang &amp; Pizzeria
              </div>

              <!-- Italian Flag Accent Line -->
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td width="32" height="1" style="background-color: rgba(212, 175, 55, 0.45); line-height: 1px; font-size: 1px;">&nbsp;</td>
                  <td width="12" height="3" style="background-color: #009246; border-radius: 2px 0 0 2px; line-height: 3px; font-size: 1px;">&nbsp;</td>
                  <td width="12" height="3" style="background-color: #ffffff; line-height: 3px; font-size: 1px;">&nbsp;</td>
                  <td width="12" height="3" style="background-color: #ce2b37; border-radius: 0 2px 2px 0; line-height: 3px; font-size: 1px;">&nbsp;</td>
                  <td width="32" height="1" style="background-color: rgba(212, 175, 55, 0.45); line-height: 1px; font-size: 1px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Main Floating Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid rgba(212, 175, 55, 0.28); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);">
          <tr>
            <td style="padding: 36px 36px 32px 36px;">
              <!-- Lock Badge -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; width: 54px; height: 54px; border-radius: 50%; background-color: #faf6ed; border: 1px solid #ebd9b5; text-align: center; line-height: 52px;">
                      <span style="font-size: 24px; vertical-align: middle;">🔒</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="margin: 14px 0 0 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 700; color: #111111; text-align: center; letter-spacing: -0.01em;">
                Återställ lösenord
              </h1>

              <!-- Gold decorative underline -->
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin: 10px auto 26px auto;">
                <tr>
                  <td width="44" height="2" style="background-color: #c5a059; border-radius: 2px; line-height: 2px; font-size: 1px;">&nbsp;</td>
                </tr>
              </table>

              <!-- Greeting -->
              <h2 style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 17px; font-weight: 700; color: #111111;">
                Hej ${recipientName}!
              </h2>

              <p style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; color: #333333; line-height: 1.65;">
                Vi har tagit emot en begäran om att återställa lösenordet för ditt administratörskonto på Falken Restaurang &amp; Pizzeria.
              </p>
              <p style="margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14.5px; color: #333333; line-height: 1.65;">
                Klicka på knappen nedan för att välja ett nytt lösenord. Länken är aktiv i <strong>30 minuter</strong>.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 12px; background: #b88628; background: linear-gradient(135deg, #c79633 0%, #8f5f13 100%); box-shadow: 0 4px 14px rgba(143, 95, 19, 0.35);">
                          <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 15px 34px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.05em; text-transform: uppercase;">
                            <span style="display: inline-block; vertical-align: middle; margin-right: 8px; font-size: 16px;">🔑</span>
                            <span style="vertical-align: middle;">Återställ lösenord</span>
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link Card -->
              <div style="background-color: #faf8f3; border-radius: 12px; padding: 16px 18px; margin-bottom: 22px; border: 1px solid #ebd9b5;">
                <p style="margin: 0 0 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #444444; font-weight: 500;">
                  Fungerar inte knappen? Kopiera och klistra in följande länk i webbläsaren:
                </p>
                <div style="background-color: #ffffff; border-radius: 8px; padding: 10px 14px; border: 1px solid #e5ded2;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="font-family: Monaco, Consolas, 'Courier New', monospace; font-size: 12px; word-break: break-all; color: #8c6721; line-height: 1.5;">
                        <a href="${resetUrl}" target="_blank" style="color: #8c6721; text-decoration: none;">
                          ${resetUrl}
                        </a>
                      </td>
                      <td width="28" align="right" valign="middle" style="padding-left: 8px;">
                        <span style="font-size: 16px; color: #b88628;" title="Kopiera länk">&#128203;</span>
                      </td>
                    </tr>
                  </table>
                </div>
              </div>

              <!-- Security Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #f0ece3; padding-top: 18px;">
                <tr>
                  <td width="24" valign="top" style="padding-right: 10px; line-height: 1;">
                    <span style="display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; border: 1.5px solid #d4af37; color: #d4af37; font-weight: bold; font-size: 11px; font-family: sans-serif;">i</span>
                  </td>
                  <td valign="top" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12.5px; color: #444444; line-height: 1.5;">
                    <strong>Viktigt:</strong> Om du inte har begärt denna återställning kan du tryggt ignorera detta e-postmeddelande. Ditt nuvarande lösenord förblir oförändrat och säkert.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer Outside Card -->
        <table role="presentation" width="100%" style="max-width: 560px; margin-top: 24px;">
          <tr>
            <td align="center">
              <!-- Contact Links (Clickable: Maps, Call, Email) -->
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin-bottom: 14px;">
                <tr>
                  <!-- Location (Opens Google Maps) -->
                  <td align="center" style="padding: 4px 10px;">
                    <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #e5ded2; text-decoration: none;">
                      <span style="color: #d4af37; font-size: 14px; margin-right: 4px;">📍</span>
                      <span style="color: #e5ded2;">${site.address.street}, ${site.address.city}</span>
                    </a>
                  </td>
                  <td style="color: #665b4c; font-size: 12px; padding: 0 4px;">|</td>
                  <!-- Phone (Opens Call / tel:) -->
                  <td align="center" style="padding: 4px 10px;">
                    <a href="${site.phoneHref}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #e5ded2; text-decoration: none;">
                      <span style="color: #d4af37; font-size: 14px; margin-right: 4px;">📞</span>
                      <span style="color: #e5ded2;">${site.phone}</span>
                    </a>
                  </td>
                  <td style="color: #665b4c; font-size: 12px; padding: 0 4px;">|</td>
                  <!-- Email (Opens Mail client / mailto:) -->
                  <td align="center" style="padding: 4px 10px;">
                    <a href="mailto:${site.email}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #e5ded2; text-decoration: none;">
                      <span style="color: #d4af37; font-size: 14px; margin-right: 4px;">✉️</span>
                      <span style="color: #e5ded2;">${site.email}</span>
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Gold hairline divider -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 14px;">
                <tr>
                  <td align="center">
                    <div style="width: 88%; max-width: 480px; height: 1px; background-color: rgba(212, 175, 55, 0.25);"></div>
                  </td>
                </tr>
              </table>

              <!-- Copyright -->
              <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #9c9384; text-align: center;">
                &copy; ${new Date().getFullYear()} Falken Restaurang &amp; Pizzeria. Alla r&auml;ttigheter f&ouml;rbeh&aring;llna.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generatePasswordResetEmailText(name: string, resetUrl: string): string {
  const recipientName = name.trim() || "Administratör";
  return `FALKEN RESTAURANG & PIZZERIA - ÅTERSTÄLLNING AV LÖSENORD

Hej ${recipientName}!

Vi har tagit emot en begäran om att återställa lösenordet för ditt administratörskonto på Falken Restaurang & Pizzeria.

Klicka på länken nedan för att välja ett nytt lösenord (länken är aktiv i 30 minuter):
${resetUrl}

Om du inte har begärt denna återställning kan du tryggt ignorera detta meddelande. Ditt nuvarande lösenord förblir oförändrat och säkert.

Med vänliga hälsningar,
Falken Restaurang & Pizzeria
${site.address.street}, ${site.address.city}
Telefon: ${site.phone}
E-post: ${site.email}
Hitta hit: ${mapsUrl}
`;
}

export async function sendPasswordResetEmail(input: SendResetEmailInput): Promise<SendEmailResult> {
  const { to, name = "Administratör", resetUrl } = input;
  const smtp = getSmtpConfig();

  const html = generatePasswordResetEmailHtml(name, resetUrl);
  const text = generatePasswordResetEmailText(name, resetUrl);
  const subject = "Återställ ditt lösenord – Falken Administration";

  // 1. Direct Brevo REST API (Fastest and works on all hosts without port restrictions)
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  if (brevoKey) {
    const senderEmail =
      process.env.BREVO_SENDER_EMAIL?.trim() ||
      process.env.SMTP_USER?.trim() ||
      site.email;
    const senderName = process.env.BREVO_SENDER_NAME?.trim() || "Falken Restaurang & Pizzeria";

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevoKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: to, name }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo API ${response.status}: ${errorText}`);
      }

      console.log(`[EMAIL] Password reset email sent successfully to ${to} via Brevo API`);
      return { sent: true, mode: "brevo", resetUrl };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[EMAIL ERROR] Failed to send via Brevo API to ${to}:`, errorMsg);
      logDevResetBox(to, resetUrl, errorMsg);
      return { sent: true, mode: "dev", resetUrl, error: errorMsg };
    }
  }

  // 2. Standard SMTP (Supports Brevo SMTP relay or any provider)
  if (smtp.isConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      });

      await transporter.sendMail({
        from: smtp.from,
        to,
        subject,
        text,
        html,
      });

      console.log(`[EMAIL] Password reset email sent successfully to ${to} via SMTP (${smtp.host})`);
      return { sent: true, mode: "smtp", resetUrl };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[EMAIL ERROR] Failed to send via SMTP to ${to}:`, errorMsg);
      // Fallback: log the reset URL to console so developer/admin is never blocked
      logDevResetBox(to, resetUrl, errorMsg);
      return { sent: true, mode: "dev", resetUrl, error: errorMsg };
    }
  }

  // If SMTP is not yet configured, log cleanly to server terminal for instant local usage
  logDevResetBox(to, resetUrl);
  return { sent: true, mode: "dev", resetUrl };
}

function logDevResetBox(to: string, resetUrl: string, errorNotice?: string) {
  const border = "═".repeat(78);
  console.log(`
╔${border}╗
║                    FALKEN ADMIN - ÅTERSTÄLLNINGSLÄNK                         ║
╠${border}╣
║ Mottagare:  ${to.padEnd(65)}║
${errorNotice ? `║ OBS:        SMTP misslyckades (${errorNotice.slice(0, 50).padEnd(50)}) ║\n` : ""
}║ Reset URL:  ${resetUrl.padEnd(65)}║
║ Giltig i:   30 minuter                                                       ║
╚${border}╝
`);
}

