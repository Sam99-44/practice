// utils/mailer.js
import nodemailer from "nodemailer";

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export function getTransporter() {
  const host = requiredEnv("SMTP_HOST");       // smtp.gmail.com
  const user = requiredEnv("SMTP_USER");       // your gmail
  const pass = requiredEnv("SMTP_PASS");       // app password
  const port = Number(process.env.SMTP_PORT || 587);

  // 465 = SSL, 587 = STARTTLS
  const secure = port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  return transporter;
}

export async function verifySmtp() {
  const transporter = getTransporter();
  await transporter.verify();
  return true;
}
