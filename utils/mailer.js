import nodemailer from "nodemailer";

export function getTransporter() {
  const port = Number(process.env.SMTP_PORT || 465);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,              // mail.practiceonline.co.za
    port,                                    // 465
    secure: port === 465,                    // true for 465 (SSL)
    auth: {
      user: process.env.SMTP_USER,           // no-reply@practiceonline.co.za
      pass: process.env.SMTP_PASS
    },
    // Optional but helps some hosts:
    tls: { rejectUnauthorized: false }
  });
}
