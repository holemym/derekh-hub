/** Date/time formatting — always Europe/Vienna, locale-aware. */

const TZ = "Europe/Vienna";

export function formatDate(iso: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatTime(iso: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatDateTime(iso: string | Date, locale: string): string {
  return `${formatDate(iso, locale)} · ${formatTime(iso, locale)}`;
}

/** "Fri 20:36" style for the Shabbos chip. */
export function formatWeekdayTime(iso: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}
