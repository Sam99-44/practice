import nodemailer from "nodemailer";

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export function getTransporter() {
  const host = requiredEnv("SMTP_HOST");     // smtp.gmail.com
  const port = Number(process.env.SMTP_PORT || 587);
  const user = requiredEnv("SMTP_USER");     // your gmail address
  const pass = requiredEnv("SMTP_PASS");     // 16-char app password (no spaces)

  const secure = port === 465; // 465 = SSL, 587 = STARTTLS

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },

    // Better defaults + fewer "it works locally but fails on host" issues
    requireTLS: port === 587, // force STARTTLS on 587
    tls: {
      // Gmail is fine with strict TLS; Render should also be fine.
      // If you still get TLS errors, set this to false TEMPORARILY for debugging.
      rejectUnauthorized: true
    }
  });

  return transporter;
}

// Optional: call this from a route to test SMTP
export async function verifySmtp() {
  const transporter = getTransporter();
  await transporter.verify();
  return true;
}

// Helper for sending mail (recommended so you always set "from")
export async function sendMail({ to, subject, html, text }) {
  const user = requiredEnv("SMTP_USER");
  const transporter = getTransporter();

  return transporter.sendMail({
    from: `Practice Online <${user}>`,
    to,
    subject,
    text,
    html
  });
}
