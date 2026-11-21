/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — TIMEZONE & IST FORMATTER UTILITY
 * ==============================================================================
 * In plain words (Layman):
 *   This helper converts any server or database timestamp into Indian Standard
 *   Time (IST / UTC+05:30) so administrators and users always see consistent
 *   and clear Indian Standard Time across all screens.
 * ==============================================================================
 */

export function formatIST(dateInput, includeTime = true) {
  if (!dateInput) return "—";
  let date;
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed.endsWith("Z") && !trimmed.includes("+") && !trimmed.includes("T")) {
      date = new Date(trimmed.replace(" ", "T") + "Z");
    } else if (!trimmed.endsWith("Z") && !trimmed.includes("+")) {
      date = new Date(trimmed + "Z");
    } else {
      date = new Date(trimmed);
    }
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) return String(dateInput);

  if (includeTime) {
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }) + " IST";
  } else {
    return date.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric"
    }) + " (IST)";
  }
}

export function formatISTDate(dateInput) {
  return formatIST(dateInput, false);
}
