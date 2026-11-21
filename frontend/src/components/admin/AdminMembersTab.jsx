import React from "react";
import { formatIST, formatISTDate } from "../../utils/time";

export default function AdminMembersTab({
  users,
  filteredUsers,
  activeCount,
  endingSoonCount,
  disabledCount,
  waitingDeleteCount,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  cleaning,
  onRunCleanup,
  onShowInviteModal,
  onMarkLeft,
  onEnable
}) {
  return (
    <>
      {/* Header and Action Buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "40px", lineHeight: 1.1 }}>
            Members
          </h1>
          <div style={{ fontSize: "14px", color: "#5A6270" }}>
            Connected to PostgreSQL. Revocation blocks all 5 campus clubs in under 0.2s.
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          <button
            type="button"
            disabled={cleaning}
            onClick={onRunCleanup}
            style={{
              height: "44px",
              padding: "0 20px",
              fontSize: "15px",
              fontWeight: 600,
              color: "#12171E",
              background: "transparent",
              border: "1px solid #12171E",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            {cleaning ? "Running..." : "Run cleanup now"}
          </button>
          <button
            type="button"
            onClick={onShowInviteModal}
            style={{
              height: "44px",
              padding: "0 20px",
              fontSize: "15px",
              fontWeight: 600,
              color: "#F5F1E8",
              background: "#12171E",
              border: 0,
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            + Invite member
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
        <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "40px", fontWeight: 500, lineHeight: 1 }}>{activeCount}</div>
          <div style={{ fontSize: "14px", color: "#5A6270", marginTop: "8px" }}>Active members</div>
        </div>
        <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "40px", fontWeight: 500, lineHeight: 1, color: "#8A4A0F" }}>{endingSoonCount}</div>
          <div style={{ fontSize: "14px", color: "#5A6270", marginTop: "8px" }}>Ending in 30 days</div>
        </div>
        <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "40px", fontWeight: 500, lineHeight: 1, color: "#9B3A22" }}>{disabledCount}</div>
          <div style={{ fontSize: "14px", color: "#5A6270", marginTop: "8px" }}>Disabled accounts</div>
        </div>
        <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "12px", padding: "20px" }}>
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "40px", fontWeight: 500, lineHeight: 1 }}>{waitingDeleteCount}</div>
          <div style={{ fontSize: "14px", color: "#5A6270", marginTop: "8px" }}>Waiting 30-day delete</div>
        </div>
      </div>

      {/* Members Table Card */}
      <section style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "14px", overflow: "hidden" }}>
        {/* Search & Filter Bar */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "16px 20px", borderBottom: "1px solid #E6E0D2" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "14px", fontWeight: 500 }}>
            {["all", "active", "ending_soon", "disabled"].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: statusFilter === f ? "#12171E" : "transparent",
                  color: statusFilter === f ? "#F5F1E8" : "#4A5260",
                  textTransform: "capitalize"
                }}
              >
                {f.replace("_", " ")}
              </button>
            ))}
          </div>

          <div>
            <input
              type="search"
              placeholder="Search by name or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "260px",
                maxWidth: "100%",
                height: "38px",
                boxSizing: "border-box",
                padding: "0 14px",
                fontSize: "14px",
                color: "#12171E",
                background: "#F3EFE7",
                border: "1px solid #B9B2A3",
                borderRadius: "8px"
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "860px" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "2.4fr 1fr 1.8fr 1.2fr 1.2fr 1.2fr",
              gap: "16px",
              padding: "12px 20px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "1.2px",
              color: "#5A6270",
              background: "#F3EFE7"
            }}>
              <div>MEMBER</div>
              <div>ROLE</div>
              <div>STATUS</div>
              <div>TERM ENDS</div>
              <div>LAST ACTIVE (IST)</div>
              <div style={{ textAlign: "right" }}>ACTIONS</div>
            </div>

            {filteredUsers.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#5A6270" }}>
                No members found matching your search.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isDisabled = u.status === "disabled" || u.status === "deleted";
                return (
                  <div
                    key={u.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2.4fr 1fr 1.8fr 1.2fr 1.2fr 1.2fr",
                      gap: "16px",
                      alignItems: "center",
                      padding: "14px 20px",
                      borderTop: "1px solid #E6E0D2",
                      fontSize: "14px",
                      background: isDisabled ? "#F7F4EC" : "transparent"
                    }}
                  >
                    {/* Member Name */}
                    <div>
                      <div style={{ fontWeight: 500, color: isDisabled ? "#4A5260" : "#12171E" }}>{u.name}</div>
                      <div style={{ fontSize: "13px", color: "#5A6270" }}>{u.email}</div>
                    </div>

                    {/* Role */}
                    <div style={{ textTransform: "capitalize", color: isDisabled ? "#4A5260" : "#12171E" }}>
                      {u.role}
                    </div>

                    {/* Status Pill */}
                    <div>
                      {u.status === "active" ? (
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "#1F6B3F", background: "#DDEFE2", borderRadius: "999px", padding: "4px 12px" }}>
                          Active
                        </span>
                      ) : (
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "#9B3A22", background: "#F6DDD4", borderRadius: "999px", padding: "4px 12px" }}>
                          Disabled {u.disabled_reason ? `· ${u.disabled_reason}` : ""}
                        </span>
                      )}
                    </div>

                    {/* Term End */}
                    <div style={{ fontSize: "13px", color: isDisabled ? "#4A5260" : "#12171E" }}>
                      {u.term_end ? formatISTDate(u.term_end) : "Indefinite"}
                    </div>

                    {/* Last Active */}
                    <div style={{ fontSize: "13px", color: "#5A6270" }}>
                      {u.last_active_at ? formatIST(u.last_active_at) : "Never"}
                    </div>

                    {/* Action Button */}
                    <div style={{ textAlign: "right" }}>
                      {u.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => onMarkLeft(u)}
                          style={{
                            height: "36px",
                            padding: "0 14px",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#12171E",
                            background: "transparent",
                            border: "1px solid #12171E",
                            borderRadius: "8px",
                            cursor: "pointer"
                          }}
                        >
                          Mark as left
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onEnable(u)}
                          style={{
                            height: "36px",
                            padding: "0 14px",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#12171E",
                            background: "transparent",
                            border: "none",
                            textDecoration: "underline",
                            textUnderlineOffset: "3px",
                            cursor: "pointer"
                          }}
                        >
                          Re-enable
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </>
  );
}
