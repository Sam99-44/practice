import nodemailer from "nodemailer";

export function getTransporter() {
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,         // mail.practiceonline.co.za
    port,                               // 465
    secure,                             // true for 465
    auth: {
      user: process.env.SMTP_USER,      // no-reply@practiceonline.co.za
      pass: process.env.SMTP_PASS       // your cPanel email password
    },
    tls: {
      // helps with some hosting setups
      rejectUnauthorized: false
    }
  });
}
