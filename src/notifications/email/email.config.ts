import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const ASSET_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "assets",
);

function assetAttachment(cid, filename) {
  const filePath = path.join(ASSET_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return {
    filename,
    path: filePath,
    cid,
  };
}

const INLINE_ASSETS = [
  ["indian-masala-logo", "nav_logo.png"],
  ["social-facebook", "social-facebook.png"],
  ["social-instagram", "social-instagram.png"],
  ["social-website", "social-website.png"],
  ["social-location", "social-location.png"],
];

function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export const sendEmail = async ({ to, subject, html, attachments }) => {
  const files = Array.isArray(attachments) ? [...attachments] : [];
  if (typeof html === "string") {
    for (const [cid, filename] of INLINE_ASSETS) {
      if (!html.includes(`cid:${cid}`)) continue;
      if (files.some((file) => file?.cid === cid)) continue;
      const asset = assetAttachment(cid, filename);
      if (asset) {
        files.push({
          ...asset,
          contentDisposition: "inline",
        });
      }
    }
  }

  const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    port: 587,
    auth: {
      user: process.env.NODE_MAILER_EMAIL,
      pass: process.env.NODE_MAILER_PASSWORD,
    },
  });

  await mailTransporter.sendMail({
    from: `"Indian Masala" <${process.env.NODE_MAILER_EMAIL}>`,
    to,
    subject,
    text: htmlToText(html),
    html,
    attachments: files,
  });
};
