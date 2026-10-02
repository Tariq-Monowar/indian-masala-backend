import { confirmationEmailTemplate } from "./confirmation";

function formatWhen(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatClock(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

type CompanyEmailInfo = {
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
};

async function loadCompany(db): Promise<CompanyEmailInfo> {
  try {
    const rows = await db.company_info
      .select("company_name", "company_phone", "address")
      .limit(1)
      .all();
    const info = rows?.[0];
    if (!info) return {};
    const address =
      typeof info.address === "string" ? info.address.trim() : "";
    const storedPhone =
      typeof info.company_phone === "string" ? info.company_phone.trim() : "";
    let companyPhone = storedPhone;
    if (storedPhone.startsWith("[")) {
      try {
        const list = JSON.parse(storedPhone);
        companyPhone = Array.isArray(list)
          ? String(list.find((item) => String(item || "").trim()) || "").trim()
          : storedPhone;
      } catch {
        companyPhone = storedPhone;
      }
    }
    return {
      companyName: info.company_name || "Indian Masala",
      companyPhone,
      companyAddress: address,
    };
  } catch {
    return {};
  }
}

export function reservationConfirmedHtml(
  reservation,
  company: CompanyEmailInfo = {},
) {
  const name = reservation.name || "Guest";
  return confirmationEmailTemplate({
    eyebrow: "Indian Masala",
    title: "Reservation confirmed",
    greeting: `Hello ${name},`,
    message:
      "Your table is confirmed. We look forward to welcoming you.",
    details: [
      { label: "Name", value: name },
      { label: "Date", value: formatWhen(reservation.date) },
      { label: "Time", value: formatClock(reservation.time) },
      { label: "Guests", value: reservation.number_of_guests },
      { label: "Phone", value: reservation.phone },
      { label: "Note", value: reservation.description },
    ],
    companyName: company.companyName,
    companyPhone: company.companyPhone,
    companyAddress: company.companyAddress,
  });
}

export function cateringConfirmedHtml(
  catering,
  company: CompanyEmailInfo = {},
) {
  const name = catering.name || "Guest";
  return confirmationEmailTemplate({
    eyebrow: "Indian Masala",
    title: "Catering confirmed",
    greeting: `Hello ${name},`,
    message:
      "Your catering request is confirmed. Our team will take care of the rest.",
    details: [
      { label: "Name", value: name },
      { label: "Event", value: catering.event_type },
      { label: "Date", value: formatWhen(catering.date) },
      { label: "Guests", value: catering.number_of_guests },
      { label: "Location", value: catering.location },
      { label: "Phone", value: catering.phone },
      { label: "Requests", value: catering.special_requirements },
    ],
    companyName: company.companyName,
    companyPhone: company.companyPhone,
    companyAddress: company.companyAddress,
  });
}

export async function companyForEmail(db) {
  return loadCompany(db);
}
