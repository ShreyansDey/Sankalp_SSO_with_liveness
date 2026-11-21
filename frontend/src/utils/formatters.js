/**
 * Format and Utility Helpers
 */

export function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

export function formatTime(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return dateStr;
  }
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "";
  const [user, domain] = email.split("@");
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  return `${user[0]}${"*".repeat(user.length - 2)}${user[user.length - 1]}@${domain}`;
}

export function getStatusBadgeInfo(status) {
  switch (status?.toLowerCase()) {
    case "active":
      return {
        label: "Active",
        bgClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotColor: "bg-emerald-400"
      };
    case "pending_approval":
      return {
        label: "Pending e-KYC",
        bgClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        dotColor: "bg-amber-400 animate-pulse"
      };
    case "disabled":
      return {
        label: "Disabled (48h Window)",
        bgClass: "bg-red-500/10 text-red-400 border-red-500/20",
        dotColor: "bg-red-400"
      };
    case "expired":
      return {
        label: "Expired",
        bgClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
        dotColor: "bg-zinc-400"
      };
    default:
      return {
        label: status || "Unknown",
        bgClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
        dotColor: "bg-zinc-400"
      };
  }
}
