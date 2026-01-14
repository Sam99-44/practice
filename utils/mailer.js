import nodemailer from "nodemailer";

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export function getTransporter() {
  const host = requiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT || 587);
  const user = requiredEnv("SMTP_USER");
  const pass = requiredEnv("SMTP_PASS");

  const secure = port === 465; // 465 = SSL, 587 = STARTTLS

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      // keep strict in production; if your provider has cert issues you can set false (not recommended)
      rejectUnauthorized: true
    }
  });
}

// Optional: call this from a route to test SMTP
export async function verifySmtp() {
  const transporter = getTransporter();
  await transporter.verify();
  return true;
}
