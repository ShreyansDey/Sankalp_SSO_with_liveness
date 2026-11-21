import React, { useState, useEffect } from "react";
import { formatIST } from "../../utils/time";

export default function AdminAuditTab({ auditLogs = [], onRefresh, loading = false }) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const logs = Array.isArray(auditLogs) ? auditLogs : [];
  const totalItems = logs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Auto-clamp page if data size changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const currentLogs = logs.slice(startIndex, endIndex);

  const goToPage = (page) => {
    const target = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(target);
  };

  // Generate page numbers to display cleanly
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* HEADER SECTION */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "40px" }}>
            Audit Log
          </h1>
          <p style={{ color: "#5A6270", fontSize: "14px", margin: 0 }}>
            Every login, liveness check, revocation, and automated cleanup is immutably recorded in PostgreSQL.
          </p>
        </div>

        {/* TOP PAGINATION CONTROLS & REFRESH */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {onRefresh && (
            <button
              type="button"
              disabled={loading}
              onClick={onRefresh}
              className="btn-outline"
              style={{
                height: "34px",
                padding: "0 14px",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
              title="Refresh audit trail"
            >
              <span>{loading ? "Refreshing..." : "↻ Refresh"}</span>
            </button>
          )}

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "#FBF9F4",
            border: "1px solid #DDD6C7",
            borderRadius: "8px",
            padding: "4px 8px"
          }}>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
              style={{
                height: "26px",
                padding: "0 8px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "4px",
                border: "1px solid #DDD6C7",
                background: currentPage === 1 ? "#EFEBE1" : "#FFFFFF",
                color: currentPage === 1 ? "#A09A8E" : "#12171E",
                cursor: currentPage === 1 ? "not-allowed" : "pointer"
              }}
            >
              &larr; Prev
            </button>

            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#12171E", padding: "0 4px" }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
              style={{
                height: "26px",
                padding: "0 8px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "4px",
                border: "1px solid #DDD6C7",
                background: currentPage === totalPages ? "#EFEBE1" : "#FFFFFF",
                color: currentPage === totalPages ? "#A09A8E" : "#12171E",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer"
              }}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* TABLE CONTAINER */}
      <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "14px", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#F3EFE7", textAlign: "left", fontSize: "12px", color: "#5A6270", letterSpacing: "1px" }}>
                <th style={{ padding: "12px 20px" }}>TIMESTAMP (IST)</th>
                <th style={{ padding: "12px 20px" }}>ACTION</th>
                <th style={{ padding: "12px 20px" }}>ACTOR</th>
                <th style={{ padding: "12px 20px" }}>DETAILS</th>
              </tr>
            </thead>
            <tbody>
              {currentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "36px 20px", textAlign: "center", color: "#8A92A0", fontSize: "14px" }}>
                    {loading ? "Loading audit trail..." : "No audit log records found."}
                  </td>
                </tr>
              ) : (
                currentLogs.map((log) => (
                  <tr key={log.id} style={{ borderTop: "1px solid #E6E0D2" }}>
                    <td style={{ padding: "12px 20px", color: "#5A6270", fontSize: "13px", whiteSpace: "nowrap" }}>
                      {log.at_ist || formatIST(log.at)}
                    </td>
                    <td style={{ padding: "12px 20px" }}>
                      <span style={{
                        fontSize: "12px",
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: log.action.includes("left") || log.action.includes("denied") || log.action.includes("deleted")
                          ? "#F6DDD4"
                          : log.action.includes("enrolled") || log.action.includes("approved")
                          ? "#DDEFE2"
                          : "#E4DDCF",
                        color: log.action.includes("left") || log.action.includes("denied") || log.action.includes("deleted")
                          ? "#9B3A22"
                          : log.action.includes("enrolled") || log.action.includes("approved")
                          ? "#1F6B3F"
                          : "#12171E"
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: "12px 20px", color: "#5A6270", fontSize: "13px" }}>
                      {log.actor_id || "System"}
                    </td>
                    <td style={{ padding: "12px 20px", color: "#5A6270", fontSize: "13px", maxWidth: "400px", wordBreak: "break-word" }}>
                      {JSON.stringify(log.detail || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* BOTTOM PAGINATION BAR — ALWAYS RENDERED */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderTop: "1px solid #E6E0D2",
          background: "#F8F5EE",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div style={{ fontSize: "13px", color: "#5A6270" }}>
            Showing <strong>{totalItems === 0 ? 0 : startIndex + 1}</strong> to <strong>{endIndex}</strong> of <strong>{totalItems}</strong> events (10 per page)
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
              className="btn-outline"
              style={{
                height: "32px",
                padding: "0 12px",
                fontSize: "12.5px",
                opacity: currentPage === 1 ? 0.45 : 1,
                cursor: currentPage === 1 ? "not-allowed" : "pointer"
              }}
            >
              &larr; Previous
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {getPageNumbers().map((p, idx) => (
                p === "..." ? (
                  <span key={`dots-${idx}`} style={{ padding: "0 6px", color: "#8A92A0", fontSize: "13px" }}>
                    ...
                  </span>
                ) : (
                  <button
                    key={`page-${p}`}
                    type="button"
                    onClick={() => goToPage(p)}
                    style={{
                      minWidth: "32px",
                      height: "32px",
                      padding: "0 8px",
                      borderRadius: "6px",
                      border: "1px solid",
                      borderColor: currentPage === p ? "#12171E" : "#DDD6C7",
                      background: currentPage === p ? "#12171E" : "#FFFFFF",
                      color: currentPage === p ? "#FFFFFF" : "#12171E",
                      fontSize: "12.5px",
                      fontWeight: currentPage === p ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {p}
                  </button>
                )
              ))}
            </div>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="btn-outline"
              style={{
                height: "32px",
                padding: "0 12px",
                fontSize: "12.5px",
                opacity: currentPage === totalPages ? 0.45 : 1,
                cursor: currentPage === totalPages ? "not-allowed" : "pointer"
              }}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
