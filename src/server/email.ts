import nodemailer from "nodemailer";
import { site } from "../data/site.ts";

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

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Återställ ditt lösenord</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf8f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #faf8f3; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e7e2d7; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1a1917; padding: 28px 32px; text-align: center; border-bottom: 2px solid #d4af37;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #fbf9f4; letter-spacing: 0.05em; text-transform: uppercase;">
                Falken Restaurang & Pizzeria
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 11px; font-weight: 700; color: #d4af37; letter-spacing: 0.15em; text-transform: uppercase;">
                Personalportal • Säkerhetsmeddelande
              </p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #1c1917;">
                Hej ${recipientName}!
              </h2>
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #44403c; line-height: 1.6;">
                Vi har tagit emot en begäran om att återställa lösenordet för ditt administratörskonto på Falken Restaurang & Pizzeria.
              </p>
              <p style="margin: 0 0 28px 0; font-size: 14px; color: #44403c; line-height: 1.6;">
                Klicka på knappen nedan för att välja ett nytt lösenord. Länken är aktiv i <strong>30 minuter</strong>.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #d4af37; color: #1a1917; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 34px; border-radius: 12px; letter-spacing: 0.02em; text-transform: uppercase; box-shadow: 0 2px 8px rgba(212, 175, 55, 0.35);">
                      Återställ lösenord
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link -->
              <div style="background-color: #f7f5ef; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; border: 1px solid #eae5d9;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #57534e; font-weight: 600;">
                  Fungerar inte knappen? Kopiera och klistra in följande länk i webbläsaren:
                </p>
                <p style="margin: 0; font-size: 11px; word-break: break-all; color: #8c7625; font-family: monospace;">
                  <a href="${resetUrl}" target="_blank" style="color: #8c7625; text-decoration: underline;">
                    ${resetUrl}
                  </a>
                </p>
              </div>

              <!-- Security Notice -->
              <div style="border-top: 1px solid #f0ece3; padding-top: 18px;">
                <p style="margin: 0; font-size: 12px; color: #78716c; line-height: 1.5;">
                  <strong>Viktigt:</strong> Om du inte har begärt denna återställning kan du tryggt ignorera detta e-postmeddelande. Ditt nuvarande lösenord förblir oförändrat och säkert.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #faf8f3; padding: 20px 32px; text-align: center; border-top: 1px solid #e7e2d7;">
              <p style="margin: 0 0 4px 0; font-size: 11px; color: #78716c;">
                © ${new Date().getFullYear()} Falken Restaurang & Pizzeria • ${site.address.street}, ${site.address.city}
              </p>
              <p style="margin: 0; font-size: 11px; color: #a8a29e;">
                Detta är ett automatiskt systemmeddelande som inte kan besvaras.
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

Vi har tagit emot en begäran om att återställa lösenordet för ditt administratörskonto.

Klicka på länken nedan för att välja ett nytt lösenord (giltig i 30 minuter):
${resetUrl}

Om du inte har begärt denna återställning kan du ignorera detta meddelande.

Med vänliga hälsningar,
Falken Restaurang & Pizzeria
${site.address.street}, ${site.address.city}
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

