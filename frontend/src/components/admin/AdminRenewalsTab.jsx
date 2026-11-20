import React from "react";

export default function AdminRenewalsTab({
  renewals,
  actionLoadingId,
  onApproveRenewal,
  onDeclineRenewal
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "40px" }}>
            Access Renewal Requests
          </h1>
          <p style={{ color: "#5A6270", fontSize: "14px", margin: 0, maxWidth: "700px", lineHeight: 1.5 }}>
            48-Hour Recovery Window for accidental "Mark as Left" or expiration. Approving reactivates access across all 5 connected campus facilities. Declining or allowing 48 hours to elapse triggers permanent database erasure.
          </p>
        </div>
      </div>

      <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "14px", overflow: "hidden" }}>
        {renewals.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#5A6270" }}>
            <div style={{ fontSize: "16px", fontWeight: 500, color: "#12171E", marginBottom: "6px" }}>
              No renewal requests
            </div>
            <div style={{ fontSize: "14px" }}>
              Members who submit a 48-hour recovery request will appear here for administrative approval.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#EAE4D7", borderBottom: "1px solid #DDD6C7" }}>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>Member</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>Revocation Cause</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600, maxWidth: "250px" }}>Stated Reason</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>Purge Countdown</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {renewals.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #DDD6C7" }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontWeight: 600, color: "#12171E" }}>{r.name}</div>
                      <div style={{ fontSize: "12px", color: "#5A6270" }}>{r.email}</div>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{
                        display: "inline-block",
                        fontSize: "12px",
                        fontWeight: 500,
                        padding: "3px 8px",
                        borderRadius: "4px",
                        background: "#F1F5F9",
                        color: "#334155"
                      }}>
                        {r.disabled_reason === "left" ? "Admin Mark as Left" :
                         r.disabled_reason === "term_end" ? "Term Expired" :
                         r.disabled_reason === "inactive" ? "60-Day Inactive" :
                         r.disabled_reason || "Revoked"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", maxWidth: "250px", wordBreak: "break-word", fontSize: "13px", color: "#44403C" }}>
                      {r.reason || "No explanation provided"}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      {r.status === "approved" ? (
                        <span style={{ fontSize: "12px", color: "#15803D", fontWeight: 600 }}>
                          ✓ Restored (Active)
                        </span>
                      ) : r.hours_left > 0 ? (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#92400E",
                          background: "#FEF3C7",
                          border: "1px solid #FDE68A",
                          padding: "3px 8px",
                          borderRadius: "999px"
                        }}>
                          ⏳ {r.hours_left}h left
                        </span>
                      ) : (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#991B1B",
                          background: "#FEE2E2",
                          border: "1px solid #FECACA",
                          padding: "3px 8px",
                          borderRadius: "999px"
                        }}>
                          ⚠️ 48h Expired
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      {r.status === "approved" && (
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#15803D", background: "#DCFCE7", padding: "3px 8px", borderRadius: "999px" }}>
                          Approved
                        </span>
                      )}
                      {r.status === "declined" && (
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#991B1B", background: "#FEE2E2", padding: "3px 8px", borderRadius: "999px" }}>
                          Declined
                        </span>
                      )}
                      {r.status === "pending" && (
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#D97706", background: "#FEF3C7", padding: "3px 8px", borderRadius: "999px" }}>
                          Pending Review
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      {r.status === "pending" ? (
                        <div style={{ display: "inline-flex", gap: "8px" }}>
                          <button
                            type="button"
                            disabled={actionLoadingId === r.id}
                            onClick={() => onApproveRenewal(r.id, r.name)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "none",
                              background: "#166534",
                              color: "#FFFFFF",
                              cursor: "pointer"
                            }}
                          >
                            {actionLoadingId === r.id ? "Saving..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === r.id}
                            onClick={() => onDeclineRenewal(r.id, r.name)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "1px solid #FECACA",
                              background: "#FEF2F2",
                              color: "#DC2626",
                              cursor: "pointer"
                            }}
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#64748B" }}>
                          Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
