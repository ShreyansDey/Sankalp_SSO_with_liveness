import React from "react";
import { formatIST, formatISTDate } from "../../utils/time";

export default function AdminInvitesTab({
  invites,
  onShowInviteModal
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "40px" }}>
            Member Invitations
          </h1>
          <p style={{ color: "#5A6270", fontSize: "14px", margin: 0 }}>
            Create onboarding invite links for students. They will set their password and complete liveness verification.
          </p>
        </div>
        <button
          type="button"
          onClick={onShowInviteModal}
          className="btn-dark"
        >
          + Invite Member
        </button>
      </div>

      <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "14px", overflow: "hidden" }}>
        {invites.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#5A6270" }}>
            <div style={{ fontSize: "16px", fontWeight: 500, color: "#12171E", marginBottom: "6px" }}>
              No invitations yet
            </div>
            <div style={{ fontSize: "14px", marginBottom: "16px" }}>
              Click "Invite Member" above to create an onboarding link for a new student.
            </div>
            <button
              type="button"
              onClick={onShowInviteModal}
              className="btn-dark"
            >
              + Create First Invite
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#F3EFE7", textAlign: "left", fontSize: "12px", color: "#5A6270", letterSpacing: "1px" }}>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>EMAIL</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>ROLE</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>TERM END</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>EXPIRES IN</th>
                  <th style={{ padding: "12px 18px", fontWeight: 600 }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #EAE4D6" }}>
                    <td style={{ padding: "14px 18px", fontWeight: 500, color: "#12171E" }}>
                      {inv.email}
                    </td>
                    <td style={{ padding: "14px 18px", textTransform: "capitalize", color: "#5A6270" }}>
                      {inv.role}
                    </td>
                    <td style={{ padding: "14px 18px", color: "#5A6270" }}>
                      {inv.term_end ? formatISTDate(inv.term_end) : "No Expiry"}
                    </td>
                    <td style={{ padding: "14px 18px", color: "#5A6270" }}>
                      {inv.expires_at ? formatISTDate(inv.expires_at) : "\u2013"}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      {inv.status === "accepted" && (
                        <span style={{
                          display: "inline-block",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "#166534",
                          background: "#DCFCE7",
                          padding: "3px 10px",
                          borderRadius: "999px"
                        }}>
                          Accepted
                        </span>
                      )}
                      {inv.status === "pending" && (
                        <span style={{
                          display: "inline-block",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "#9A3412",
                          background: "#FFEDD5",
                          padding: "3px 10px",
                          borderRadius: "999px"
                        }}>
                          Pending
                        </span>
                      )}
                      {inv.status === "expired" && (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "#475569",
                          background: "#F1F5F9",
                          padding: "3px 10px",
                          borderRadius: "999px"
                        }}>
                          Expired
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
