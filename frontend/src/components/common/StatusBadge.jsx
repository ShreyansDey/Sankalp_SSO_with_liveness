import React from "react";
import { getStatusBadgeInfo } from "../../utils/formatters";

export default function StatusBadge({ status, className = "" }) {
  const info = getStatusBadgeInfo(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${info.bgClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${info.dotColor}`}></span>
      {info.label}
    </span>
  );
}
