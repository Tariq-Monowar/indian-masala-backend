function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

export function getPublicBaseUrl(request?: {
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
}) {
  const configured = (
    process.env.PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    process.env.API_BASE_URL ||
    ""
  ).trim();
  if (configured) return stripTrailingSlash(configured);

  if (!request) return "";

  const headers = request.headers || {};
  const forwardedProto = headers["x-forwarded-proto"];
  const forwardedHost = headers["x-forwarded-host"];
  const protoHeader = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  const hostHeader = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return "";

  const proto =
    (typeof protoHeader === "string" && protoHeader.split(",")[0].trim()) ||
    request.protocol ||
    "http";

  return `${proto}://${host}`;
}

export function toUploadUrl(
  filename: string | null | undefined,
  request?: {
    protocol?: string;
    headers?: Record<string, string | string[] | undefined>;
  },
) {
  if (typeof filename !== "string") return null;
  const value = filename.trim();
  if (!value) return null;
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("/")
  ) {
    return value;
  }

  const base = getPublicBaseUrl(request);
  const encoded = value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  if (!base) return `/uploads/${encoded}`;
  return `${base}/uploads/${encoded}`;
}

type UploadImageRow = {
  id?: string;
  image?: string | null;
};

export function mapUploadImages(
  images: unknown,
  request?: {
    protocol?: string;
    headers?: Record<string, string | string[] | undefined>;
  },
) {
  if (!Array.isArray(images)) return [];
  const next: Array<{ id: string; image: string; url: string }> = [];
  for (const entry of images) {
    const row = entry as UploadImageRow | null | undefined;
    if (!row?.id || typeof row.image !== "string" || !row.image.trim()) continue;
    const stored = row.image.trim();
    const url = toUploadUrl(stored, request);
    if (!url) continue;
    next.push({
      id: row.id,
      image: stored,
      url,
    });
  }
  return next;
}

export function sanitizeUploadFilename(originalName: string) {
  const base = pathBasename(originalName)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "");
  return base || "file";
}

function pathBasename(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || value;
}
