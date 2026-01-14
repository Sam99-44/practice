// utils/payfast.js
import crypto from "crypto";

function pfEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function generateSignature(data, passphrase) {
  const keys = Object.keys(data).filter(k => data[k] !== undefined && data[k] !== "");
  keys.sort();

  const paramString = keys
    .map(k => `${k}=${pfEncode(String(data[k]).trim())}`)
    .join("&");

  const finalString = passphrase
    ? `${paramString}&passphrase=${pfEncode(passphrase)}`
    : paramString;

  return crypto.createHash("md5").update(finalString).digest("hex");
}
