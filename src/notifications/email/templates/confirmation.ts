function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const FONT = "'Segoe UI', Helvetica, Arial, sans-serif";

function emailAsset(filename: string) {
  const configured = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const base = configured.startsWith("https://")
    ? configured
    : "https://backend.indianmasala.fr";
  return `${base}/email-assets/${filename}`;
}

const SOCIAL = [
  {
    file: "social-facebook.png",
    label: "Facebook",
    href: "https://www.facebook.com/share/1DC9LxWAMB/",
  },
  {
    file: "social-instagram.png",
    label: "Instagram",
    href: "https://www.instagram.com/indianmasala.saintjulien/",
  },
  {
    file: "social-website.png",
    label: "Website",
    href: "https://indianmasala.fr/",
  },
];

const MAPS_FALLBACK = "https://www.google.com/maps?q=46.1421536,6.0817529&z=18";

function mapsHref(address) {
  const text = String(address ?? "").trim();
  if (!text) return MAPS_FALLBACK;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

function telHref(phone) {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

function detailRow(label, value, isLast) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return `
    <tr>
      <td style="padding:12px 0;${isLast ? "" : "border-bottom:1px solid #EFE6DC;"}font-family:${FONT};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#D26F19;width:38%;vertical-align:middle;">
        ${escapeHtml(label)}
      </td>
      <td align="right" style="padding:12px 0;${isLast ? "" : "border-bottom:1px solid #EFE6DC;"}font-family:${FONT};font-size:15px;line-height:1.4;font-weight:600;color:#1A120E;vertical-align:middle;">
        ${escapeHtml(text)}
      </td>
    </tr>
  `;
}

function iconLink(item) {
  return `
    <td align="center" style="padding:0 8px;">
      <a href="${escapeHtml(item.href)}" style="text-decoration:none;">
        <img src="${escapeHtml(emailAsset(item.file))}" alt="${escapeHtml(item.label)}" width="36" height="36" style="display:block;border:0;outline:none;width:36px;height:36px;" />
      </a>
      <p style="margin:6px 0 0;font-family:${FONT};font-size:11px;line-height:1.2;color:#6B5A4E;">
        <a href="${escapeHtml(item.href)}" style="color:#6B5A4E;text-decoration:none;">${escapeHtml(item.label)}</a>
      </p>
    </td>
  `;
}

function footerLinks(address) {
  const location = {
    file: "social-location.png",
    label: "Location",
    href: mapsHref(address),
  };
  return [...SOCIAL, location].map(iconLink).join("");
}

function changeNote(phone) {
  const href = telHref(phone);
  const number = String(phone ?? "").trim();
  if (!href || !number) {
    return "Need a change? Call the restaurant.";
  }
  return `Need a change? Call the restaurant at <a href="${escapeHtml(href)}" style="color:#D26F19;font-weight:600;text-decoration:none;">${escapeHtml(number)}</a>.`;
}

type ConfirmationDetail = {
  label: string;
  value?: unknown;
};

export function confirmationEmailTemplate({
  eyebrow = "Indian Masala",
  title,
  greeting,
  message,
  details = [],
  companyName = "Indian Masala",
  companyPhone = "",
  companyAddress = "",
}: {
  eyebrow?: string;
  title: string;
  greeting: string;
  message: string;
  details?: ConfirmationDetail[];
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
}) {
  const filled = details.filter((item) => String(item.value ?? "").trim());
  const rows = filled
    .map((item, index) => detailRow(item.label, item.value, index === filled.length - 1))
    .join("");
  const brand = companyName || eyebrow || "Indian Masala";
  const mapUrl = mapsHref(companyAddress);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F6F1EA;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(title)} — ${escapeHtml(brand)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1EA;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;">
            <tr>
              <td align="center" style="padding:36px 36px 0;">
                <img src="${escapeHtml(emailAsset("nav_logo.png"))}" alt="${escapeHtml(brand)}" width="52" height="59" style="display:block;margin:0 auto 10px;border:0;outline:none;width:52px;height:auto;" />
                <p style="margin:0;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#D26F19;">
                  ${escapeHtml(brand)}
                </p>
                <h1 style="margin:18px 0 0;font-family:${FONT};font-size:28px;line-height:1.25;font-weight:700;letter-spacing:0.01em;color:#1A120E;">
                  ${escapeHtml(title)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px 4px;font-family:${FONT};font-size:15px;line-height:1.65;color:#3D2E24;">
                <p style="margin:0 0 8px;font-weight:600;color:#1A120E;">${escapeHtml(greeting)}</p>
                <p style="margin:0;color:#5C4A3A;">${escapeHtml(message)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 36px 28px;font-family:${FONT};font-size:13px;line-height:1.6;color:#6B5A4E;">
                ${changeNote(companyPhone)}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 28px 28px;background:#FBF8F4;">
                <p style="margin:0;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#D26F19;">
                  ${escapeHtml(brand)}
                </p>
                ${
                  companyPhone
                    ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:14px;font-weight:600;"><a href="${escapeHtml(telHref(companyPhone))}" style="color:#1A120E;text-decoration:none;">${escapeHtml(companyPhone)}</a></p>`
                    : ""
                }
                ${
                  companyAddress
                    ? `<p style="margin:4px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;"><a href="${escapeHtml(mapUrl)}" style="color:#6B5A4E;text-decoration:none;">${escapeHtml(companyAddress)}</a></p>`
                    : ""
                }
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto 0;">
                  <tr>
                    ${footerLinks(companyAddress)}
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
