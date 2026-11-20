import React from "react";

export default function AdminApplicationsTab({
  applications,
  actionLoadingId,
  onApproveApp,
  onRejectApp,
  onPreviewImage
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "40px", lineHeight: 1.1 }}>
            Pending Approvals
          </h1>
          <div style={{ fontSize: "14px", color: "#5A6270" }}>
            Manual identity verification desk. Review live webcam capture against uploaded institutional ID before granting access.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            padding: "4px 12px",
            borderRadius: "999px",
            fontSize: "13px",
            fontWeight: 600,
            background: applications.length > 0 ? "#8A4A0F" : "#1F6B3F",
            color: "#FFFFFF"
          }}>
            {applications.length} Pending Review
          </span>
        </div>
      </div>

      {applications.length === 0 ? (
        <div style={{
          background: "#FBF9F4",
          border: "1px dashed #DDD6C7",
          borderRadius: "14px",
          padding: "48px 24px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "18px", fontWeight: 600, color: "#12171E", marginBottom: "6px" }}>
            No Pending Membership Applications
          </div>
          <div style={{ fontSize: "14px", color: "#5A6270" }}>
            All student e-KYC applications have been verified. New invite submissions will appear here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {applications.map((app) => (
            <div
              key={app.id}
              style={{
                background: "#FBF9F4",
                border: "1px solid #DDD6C7",
                borderRadius: "14px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "20px"
              }}
            >
              {/* Card Header */}
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", borderBottom: "1px solid #EAE5D9", paddingBottom: "16px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontSize: "24px", fontWeight: 600 }}>
                      {app.name}
                    </h3>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: "#E4DDCF",
                      color: "#12171E"
                    }}>
                      {app.role || "member"}
                    </span>
                  </div>
                  <div style={{ fontSize: "14px", color: "#5A6270", marginTop: "4px" }}>
                    {app.email} {app.phone ? `· ${app.phone}` : ""}
                  </div>
                </div>

                <div style={{ fontSize: "13px", color: "#5A6270", textAlign: "right" }}>
                  <div>Submitted: {app.created_at ? new Date(app.created_at).toLocaleString() : "Recently"}</div>
                  {app.term_end && <div>Term End: {app.term_end}</div>}
                </div>
              </div>

              {/* Side-by-Side Biometric & Document Verification */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "20px" }}>
                {/* Live Webcam Portrait */}
                <div style={{
                  background: "#F3EFE7",
                  border: "1px solid #DDD6C7",
                  borderRadius: "10px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#12171E" }}>
                      Live Webcam Portrait
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#1F6B3F" }}>
                      ✓ 128D Embedding Extracted
                    </span>
                  </div>

                  <div style={{
                    width: "100%",
                    height: "220px",
                    background: "#12171E",
                    borderRadius: "8px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative"
                  }}>
                    {app.face_data_url ? (
                      <img
                        src={app.face_data_url}
                        alt={`Face snapshot of ${app.name}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
                        onClick={() => onPreviewImage({ title: `${app.name} — Live Portrait Capture`, src: app.face_data_url, isPdf: false })}
                      />
                    ) : (
                      <div style={{ color: "#F5F1E8", fontSize: "13px" }}>No face photo available</div>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "#5A6270", textAlign: "center" }}>
                    Captured during onboarding · Click to zoom
                  </div>
                </div>

                {/* Supporting Document */}
                <div style={{
                  background: "#F3EFE7",
                  border: "1px solid #DDD6C7",
                  borderRadius: "10px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#12171E" }}>
                      Supporting Document (ID Proof)
                    </span>
                    <span style={{ fontSize: "11px", color: "#5A6270" }}>
                      {app.document_name || "Document"}
                    </span>
                  </div>

                  <div style={{
                    width: "100%",
                    height: "220px",
                    background: "#EAE5D9",
                    borderRadius: "8px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative"
                  }}>
                    {app.document_data_url ? (
                      app.document_data_url.startsWith("data:application/pdf") ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "16px", textAlign: "center" }}>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8A4A0F" strokeWidth="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                          <span style={{ fontSize: "13px", fontWeight: 500 }}>PDF Document Uploaded</span>
                          <button
                            type="button"
                            onClick={() => onPreviewImage({ title: `${app.name} — Supporting Document (${app.document_name})`, src: app.document_data_url, isPdf: true })}
                            style={{
                              padding: "6px 14px",
                              background: "#12171E",
                              color: "#FFFFFF",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "12px",
                              cursor: "pointer"
                            }}
                          >
                            View PDF Proof
                          </button>
                        </div>
                      ) : (
                        <img
                          src={app.document_data_url}
                          alt={`Document submitted by ${app.name}`}
                          style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "pointer", background: "#FFFFFF" }}
                          onClick={() => onPreviewImage({ title: `${app.name} — Supporting Document (${app.document_name})`, src: app.document_data_url, isPdf: false })}
                        />
                      )
                    ) : (
                      <div style={{ color: "#5A6270", fontSize: "13px" }}>No document attached</div>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "#5A6270", textAlign: "center" }}>
                    Student ID Card / Admission Slip · Click to preview
                  </div>
                </div>
              </div>

              {/* Approval Actions */}
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", paddingTop: "12px", borderTop: "1px solid #EAE5D9" }}>
                <div style={{ fontSize: "13px", color: "#5A6270" }}>
                  Upon approval, the 128D face vector is registered for daily login face matching.
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    type="button"
                    disabled={actionLoadingId === app.id}
                    onClick={() => onRejectApp(app.id, app.name)}
                    style={{
                      height: "40px",
                      padding: "0 18px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#9B3A22",
                      background: "transparent",
                      border: "1px solid #9B3A22",
                      borderRadius: "8px",
                      cursor: "pointer"
                    }}
                  >
                    {actionLoadingId === app.id ? "Processing..." : "Reject Application"}
                  </button>

                  <button
                    type="button"
                    disabled={actionLoadingId === app.id}
                    onClick={() => onApproveApp(app.id, app.name)}
                    style={{
                      height: "40px",
                      padding: "0 22px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#FFFFFF",
                      background: "#1F6B3F",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer"
                    }}
                  >
                    {actionLoadingId === app.id ? "Approving..." : "Approve & Activate"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
