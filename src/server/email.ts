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
  // Images in emails must always resolve to a public HTTPS host because webmail clients (Gmail, Outlook, etc.)
  // proxy images through cloud servers and cannot reach localhost.
  const assetOrigin = (() => {
    const configuredSite = process.env.SITE_URL?.trim();
    if (configuredSite && !configuredSite.includes("localhost") && !configuredSite.includes("127.0.0.1")) {
      return configuredSite.replace(/\/$/, "");
    }
    return "https://falkenrestaurant.onrender.com";
  })();

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Återställ ditt lösenord – Falken Restaurang & Pizzeria</title>
  <style>
    /* Mobile Responsive Optimizations */
    @media only screen and (max-width: 540px) {
      .email-wrapper {
        padding: 14px 6px 24px 6px !important;
      }
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .email-card {
        border-radius: 18px !important;
      }
      .email-card-content {
        padding: 22px 14px 20px 14px !important;
      }
      .email-heading {
        font-size: 20px !important;
        line-height: 1.25 !important;
        white-space: nowrap !important;
      }
      .email-btn {
        padding: 13px 18px !important;
        font-size: 13px !important;
        white-space: nowrap !important;
      }
      .email-btn-text {
        white-space: nowrap !important;
      }
      /* Responsive Footer - stack on mobile cleanly without broken text lines */
      .email-footer-table,
      .email-footer-table tbody,
      .email-footer-table tr {
        display: block !important;
        width: 100% !important;
      }
      .email-footer-cell {
        display: block !important;
        width: 100% !important;
        padding: 5px 0 !important;
        text-align: center !important;
      }
      .email-footer-sep {
        display: none !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f4ed; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-wrapper" style="background-color: #f7f4ed; padding: 26px 10px 36px 10px; margin: 0; width: 100%;">
    <tr>
      <td align="center">
        <!-- Top Brand Header (matches Admin Login icon & typography) -->
        <table role="presentation" width="100%" class="email-container" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; margin: 0 auto 18px auto;">
          <tr>
            <td align="center" style="text-align: center;">
              <!-- Admin Falcon Emblem Badge (exact same icon from admin login page) -->
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto 14px auto;">
                <tr>
                  <td align="center" style="width: 76px; height: 76px; border-radius: 22px; background-color: #faf6ed; border: 1.5px solid #d5b46e; text-align: center; vertical-align: middle; box-shadow: 0 3px 12px rgba(60, 45, 20, 0.08);">
                    <img
                      src="${assetOrigin}/images/falken-admin-emblem.png"
                      width="66"
                      height="66"
                      alt="Falken Emblem"
                      style="display: block; width: 66px; height: 66px; margin: 0 auto; border: 0; outline: none; text-decoration: none;"
                    />
                  </td>
                </tr>
              </table>

              <!-- Brand Name -->
              <div style="font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: 600; color: #1c1917; letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 4px 0; text-align: center;">
                FALKEN
              </div>
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; font-weight: 600; color: #a17826; letter-spacing: 0.35em; text-transform: uppercase; margin: 0 0 12px 0; text-align: center;">
                Restaurang &amp; Pizzeria
              </div>

              <!-- Italian Flag Accent Line -->
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td width="32" height="1" style="background-color: #d5b46e; line-height: 1px; font-size: 1px;">&nbsp;</td>
                  <td width="12" height="3" style="background-color: #009246; border-radius: 2px 0 0 2px; line-height: 3px; font-size: 1px;">&nbsp;</td>
                  <td width="12" height="3" style="background-color: #ffffff; line-height: 3px; font-size: 1px;">&nbsp;</td>
                  <td width="12" height="3" style="background-color: #ce2b37; border-radius: 0 2px 2px 0; line-height: 3px; font-size: 1px;">&nbsp;</td>
                  <td width="32" height="1" style="background-color: #d5b46e; line-height: 1px; font-size: 1px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Main Floating Card -->
        <table role="presentation" width="100%" class="email-container email-card" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 22px; overflow: hidden; border: 1px solid #ebd9b5; box-shadow: 0 8px 30px rgba(60, 45, 20, 0.08); margin: 0 auto;">
          <tr>
            <td class="email-card-content" style="padding: 30px 24px 26px 24px;">
              <!-- Lock Badge -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; width: 50px; height: 50px; border-radius: 50%; background-color: #faf6ed; border: 1px solid #ebd9b5; text-align: center; line-height: 48px;">
                      <span style="font-size: 22px; vertical-align: middle;">🔒</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Heading (Strictly one line on desktop and mobile) -->
              <h1 class="email-heading" style="margin: 12px 0 0 0; font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-size: 23px; font-weight: 700; color: #111111; text-align: center; letter-spacing: -0.01em; white-space: nowrap;">
                Återställ lösenord
              </h1>

              <!-- Gold decorative underline -->
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin: 8px auto 22px auto;">
                <tr>
                  <td width="44" height="2" style="background-color: #c5a059; border-radius: 2px; line-height: 2px; font-size: 1px;">&nbsp;</td>
                </tr>
              </table>

              <!-- Greeting -->
              <h2 style="margin: 0 0 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16.5px; font-weight: 700; color: #111111;">
                Hej ${recipientName}!
              </h2>

              <p style="margin: 0 0 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #333333; line-height: 1.6;">
                Vi har tagit emot en begäran om att återställa lösenordet för ditt administratörskonto på Falken Restaurang &amp; Pizzeria.
              </p>
              <p style="margin: 0 0 24px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #333333; line-height: 1.6;">
                Klicka på knappen nedan för att välja ett nytt lösenord. Länken är aktiv i <strong>30 minuter</strong>.
              </p>

              <!-- CTA Button (Single line on mobile & desktop) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 12px; background: #b88628; background: linear-gradient(135deg, #c79633 0%, #8f5f13 100%); box-shadow: 0 4px 14px rgba(143, 95, 19, 0.35);">
                          <a href="${resetUrl}" target="_blank" class="email-btn" style="display: inline-block; padding: 13px 22px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13.5px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;">
                            <span style="display: inline-block; vertical-align: middle; margin-right: 6px; font-size: 15px;">🔑</span>
                            <span class="email-btn-text" style="vertical-align: middle; white-space: nowrap;">Återställ lösenord</span>
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link Card -->
              <div style="background-color: #faf8f3; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; border: 1px solid #ebd9b5;">
                <p style="margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12.5px; color: #444444; font-weight: 500;">
                  Fungerar inte knappen? Kopiera och klistra in följande länk i webbläsaren:
                </p>
                <div style="background-color: #ffffff; border-radius: 8px; padding: 10px 12px; border: 1px solid #e5ded2;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="font-family: Monaco, Consolas, 'Courier New', monospace; font-size: 11.5px; word-break: break-all; color: #8c6721; line-height: 1.5;">
                        <a href="${resetUrl}" target="_blank" style="color: #8c6721; text-decoration: none;">
                          ${resetUrl}
                        </a>
                      </td>
                      <td width="26" align="right" valign="middle" style="padding-left: 6px;">
                        <span style="font-size: 15px; color: #b88628;" title="Kopiera länk">&#128203;</span>
                      </td>
                    </tr>
                  </table>
                </div>
              </div>

              <!-- Security Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #f0ece3; padding-top: 16px;">
                <tr>
                  <td width="24" valign="top" style="padding-right: 8px; line-height: 1;">
                    <span style="display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; border: 1.5px solid #d4af37; color: #d4af37; font-weight: bold; font-size: 11px; font-family: sans-serif;">i</span>
                  </td>
                  <td valign="top" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #444444; line-height: 1.5;">
                    <strong>Viktigt:</strong> Om du inte har begärt denna återställning kan du tryggt ignorera detta e-postmeddelande. Ditt nuvarande lösenord förblir oförändrat och säkert.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer Outside Card (Responsive on Mobile) -->
        <table role="presentation" width="100%" class="email-container" style="max-width: 600px; width: 100%; margin: 20px auto 0 auto;">
          <tr>
            <td align="center">
              <!-- Contact Links (Responsive: side-by-side on desktop, cleanly stacked on mobile) -->
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" class="email-footer-table" style="margin-bottom: 12px; text-align: center;">
                <tr>
                  <!-- Location (Opens Google Maps) -->
                  <td class="email-footer-cell" align="center" style="padding: 4px 8px;">
                    <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12.5px; color: #4a4237; text-decoration: none; white-space: nowrap;">
                      <span style="color: #b88628; font-size: 13px; margin-right: 4px;">📍</span>
                      <span>${site.address.street}, ${site.address.city}</span>
                    </a>
                  </td>
                  <td class="email-footer-sep" style="color: #c7beaf; font-size: 12px; padding: 0 4px;">•</td>
                  <!-- Phone (Opens Call / tel:) -->
                  <td class="email-footer-cell" align="center" style="padding: 4px 8px;">
                    <a href="${site.phoneHref}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12.5px; color: #4a4237; text-decoration: none; white-space: nowrap;">
                      <span style="color: #b88628; font-size: 13px; margin-right: 4px;">📞</span>
                      <span>${site.phone}</span>
                    </a>
                  </td>
                  <td class="email-footer-sep" style="color: #c7beaf; font-size: 12px; padding: 0 4px;">•</td>
                  <!-- Email (Opens Mail client / mailto:) -->
                  <td class="email-footer-cell" align="center" style="padding: 4px 8px;">
                    <a href="mailto:${site.email}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12.5px; color: #4a4237; text-decoration: none; word-break: break-all;">
                      <span style="color: #b88628; font-size: 13px; margin-right: 4px;">✉️</span>
                      <span>${site.email}</span>
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Gold hairline divider -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 12px;">
                <tr>
                  <td align="center">
                    <div style="width: 88%; max-width: 560px; height: 1px; background-color: #dfd7c7;"></div>
                  </td>
                </tr>
              </table>

              <!-- Copyright -->
              <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #8c8273; text-align: center;">
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

    let response: Response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
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
    } catch {
      console.error(`[EMAIL ERROR] Failed to send via Brevo API to ${to}: code=brevo_network_error`);
      return { sent: false, mode: "brevo", resetUrl, error: "brevo_network_error" };
    }

    if (!response.ok) {
      const statusCode = response.status;
      console.error(`[EMAIL ERROR] Failed to send via Brevo API to ${to}: code=brevo_http_error_${statusCode}`);
      return { sent: false, mode: "brevo", resetUrl, error: `brevo_http_error_${statusCode}` };
    }

    console.log(`[EMAIL] Password reset email sent successfully to ${to} via Brevo API`);
    return { sent: true, mode: "brevo", resetUrl };
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
    } catch {
      console.error(`[EMAIL ERROR] Failed to send via SMTP to ${to}: code=smtp_send_error`);
      return { sent: false, mode: "smtp", resetUrl, error: "smtp_send_error" };
    }
  }

  // 3. Fallback when no provider is configured
  // Production environments MUST fail closed
  if (process.env.NODE_ENV === "production") {
    console.error(`[EMAIL ERROR] Password reset delivery failed for ${to}: code=no_provider_configured`);
    return { sent: false, mode: "dev", resetUrl, error: "no_provider_configured" };
  }

  // Local development only: log cleanly to server terminal for instant local usage
  logDevResetBox(to, resetUrl);
  return { sent: true, mode: "dev", resetUrl };
}

function logDevResetBox(to: string, resetUrl: string) {
  if (process.env.NODE_ENV === "production") return;
  const border = "═".repeat(78);
  console.log(`
╔${border}╗
║                    FALKEN ADMIN - ÅTERSTÄLLNINGSLÄNK                         ║
╠${border}╣
║ Mottagare:  ${to.padEnd(65)}║
║ Reset URL:  ${resetUrl.padEnd(65)}║
║ Giltig i:   30 minuter                                                       ║
╚${border}╝
`);
}

