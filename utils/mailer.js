// utils/mailer.js
import nodemailer from "nodemailer";

export function getTransporter() {
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure, // ✅ true for 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Helps some hosts with TLS
    tls: {
      servername: process.env.SMTP_HOST,
    },
  });
}
