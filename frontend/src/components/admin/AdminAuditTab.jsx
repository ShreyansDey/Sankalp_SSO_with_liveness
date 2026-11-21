import React from "react";
import { formatIST } from "../../utils/time";

export default function AdminAuditTab({ auditLogs }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "40px" }}>
          Audit Log
        </h1>
        <p style={{ color: "#5A6270", fontSize: "14px", margin: 0 }}>
          Every login, liveness check, revocation, and automated cleanup is immutably recorded in PostgreSQL.
        </p>
      </div>

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
              {auditLogs.map((log) => (
                <tr key={log.id} style={{ borderTop: "1px solid #E6E0D2" }}>
                  <td style={{ padding: "12px 20px", color: "#5A6270", fontSize: "13px" }}>
                    {log.at_ist || formatIST(log.at)}
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{
                      fontSize: "12px",
                      fontFamily: "'JetBrains Mono', monospace",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: log.action.includes("left") || log.action.includes("denied") ? "#F6DDD4" : "#E4DDCF",
                      color: log.action.includes("left") || log.action.includes("denied") ? "#9B3A22" : "#12171E"
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", color: "#5A6270", fontSize: "13px" }}>
                    {log.actor_id || "System"}
                  </td>
                  <td style={{ padding: "12px 20px", color: "#5A6270", fontSize: "13px" }}>
                    {JSON.stringify(log.detail || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
