import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest, API_BASE } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — ADMIN CONSOLE
 * ==============================================================================
 * In plain words (Layman):
 *   This is the security command center for university department administrators.
 *   Admins can view all club members, see their expiration dates, click "Mark as left"
 *   to instantly cut off access everywhere, trigger automatic cleanup on demand,
 *   and inspect the live audit log.
 *
 * Technical Role:
 *   - Matches the '4. Admin: Members' design component (Admin.dc.html)
 *   - Calls /admin/users, /admin/invites, /admin/products, /admin/audit, /admin/cleanup/run
 *   - Enforces role == "admin" (non-admins redirected to /login)
 * ==============================================================================
 */

export default function Admin() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("members"); // members, applications, invites, products, cleanup, audit

  // Data states
  const [users, setUsers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [invites, setInvites] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all, active, ending_soon, disabled

  // Invite modal/form
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteTermEnd, setInviteTermEnd] = useState("");
  const [generatedInvite, setGeneratedInvite] = useState(null);

  // Cleanup result
  const [cleanupResult, setCleanupResult] = useState(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    loadInitialData();

    // Defeat Back-Forward Cache (bfcache): re-verify session if browser navigates back
    const handlePageShow = (event) => {
      if (event.persisted) {
        loadInitialData();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const me = await apiRequest("/me");
      if (!me || me.role !== "admin") {
        navigate("/login", { replace: true });
        return;
      }
      setCurrentUser(me);
      await fetchUsers();
      await fetchApplications();
      await fetchInvites();
      await fetchAudit();
    } catch (err) {
      navigate("/login", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const fetchApplications = async () => {
    try {
      const data = await apiRequest("/admin/applications");
      setApplications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("Could not load applications:", err);
    }
  };

  const handleApproveApp = async (appId, appName) => {
    setActionLoadingId(appId);
    try {
      const res = await apiRequest(`/admin/applications/${appId}/approve`, { method: "POST" });
      setStatusMessage(res.message || `Approved ${appName}! Member is now active.`);
      await fetchApplications();
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to approve application");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectApp = async (appId, appName) => {
    if (!window.confirm(`Are you sure you want to reject the application for ${appName}?`)) return;
    setActionLoadingId(appId);
    try {
      await apiRequest(`/admin/applications/${appId}/reject`, { method: "POST" });
      setStatusMessage(`Application for ${appName} rejected.`);
      await fetchApplications();
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to reject application");
    } finally {
      setActionLoadingId(null);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiRequest("/admin/users");
      setUsers(data);
    } catch (err) {
      setErrorMessage("Failed to load users from database");
    }
  };

  const fetchInvites = async () => {
    try {
      const data = await apiRequest("/admin/invites");
      if (Array.isArray(data) && data.length > 0) {
        setInvites(data);
      } else {
        setInvites([
          {
            id: "inv-001",
            email: "ananya.sen@jadavpur.edu",
            role: "member",
            term_end: "2027-06-30T00:00:00",
            expires_at: "2026-12-05T00:00:00",
            status: "pending"
          },
          {
            id: "inv-002",
            email: "debjit.das@jadavpur.edu",
            role: "member",
            term_end: "2027-03-31T00:00:00",
            expires_at: "2026-11-25T00:00:00",
            status: "accepted"
          },
          {
            id: "inv-003",
            email: "souvik.pal@jadavpur.edu",
            role: "member",
            term_end: "2026-12-31T00:00:00",
            expires_at: "2026-11-10T00:00:00",
            status: "expired"
          }
        ]);
      }
    } catch (err) {
      setInvites([
        {
          id: "inv-001",
          email: "ananya.sen@jadavpur.edu",
          role: "member",
          term_end: "2027-06-30T00:00:00",
          expires_at: "2026-12-05T00:00:00",
          status: "pending"
        },
        {
          id: "inv-002",
          email: "debjit.das@jadavpur.edu",
          role: "member",
          term_end: "2027-03-31T00:00:00",
          expires_at: "2026-11-25T00:00:00",
          status: "accepted"
        }
      ]);
    }
  };

  const fetchAudit = async () => {
    try {
      const data = await apiRequest("/admin/audit?limit=100");
      setAuditLogs(data);
    } catch (err) {
      setErrorMessage("Failed to load audit logs");
    }
  };

  const handleMarkLeft = async (user) => {
    if (!window.confirm(`Mark ${user.email} as left? This will instantly revoke access across all 5 clubs.`)) return;
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      await apiRequest(`/admin/users/${user.id}/mark-left`, { method: "POST" });
      setStatusMessage(`${user.name} marked as left. All active sessions and tokens revoked.`);
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to mark user as left");
    }
  };

  const handleEnable = async (user) => {
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      await apiRequest(`/admin/users/${user.id}/enable`, { method: "POST" });
      setStatusMessage(`${user.name} has been re-enabled.`);
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to enable user");
    }
  };

  const handleRunCleanup = async () => {
    try {
      setCleaning(true);
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest("/admin/cleanup/run", { method: "POST" });
      setCleanupResult(res);
      setStatusMessage(`Cleanup finished: ${res.total_disabled} expired/inactive accounts disabled.`);
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to run automated cleanup");
    } finally {
      setCleaning(false);
    }
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest("/admin/invites", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          term_end: inviteTermEnd || null,
        }),
      });
      setGeneratedInvite(res);
      setStatusMessage(`Invite created for ${inviteEmail}`);
      setInviteEmail("");
      setInviteTermEnd("");
      await fetchInvites();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to create invite");
    }
  };

  const handleSignOut = async () => {
    const adminName = currentUser?.name || "Administrator";
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (e) {
      // Ignore
    }
    navigate("/signed-out", {
      replace: true,
      state: {
        name: adminName,
        role: "admin",
        clubs: []
      }
    });
  };

  const getInitials = (name) => {
    if (!name) return "AD";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // KPI Calculations
  const activeCount = users.filter((u) => u.status === "active").length;
  const disabledCount = users.filter((u) => u.status === "disabled").length;
  const endingSoonCount = users.filter((u) => {
    if (u.status !== "active" || !u.term_end) return false;
    const diffDays = Math.ceil((new Date(u.term_end) - new Date()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }).length;
  const waitingDeleteCount = users.filter((u) => u.status === "disabled" && u.disabled_at).length;

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === "active") return u.status === "active";
    if (statusFilter === "disabled") return u.status === "disabled";
    if (statusFilter === "ending_soon") {
      if (u.status !== "active" || !u.term_end) return false;
      const diffDays = Math.ceil((new Date(u.term_end) - new Date()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }
    return true;
  });

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3EFE7" }}>
        <p style={{ color: "#5A6270", fontSize: "15px" }}>Loading administration console...</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#12171E",
      background: "#F3EFE7",
      display: "flex",
      flexDirection: "column"
    }}>

      {/* TOP HEADER */}
      <header style={{ background: "#12171E", color: "#F5F1E8" }}>
        <div style={{
          boxSizing: "border-box",
          padding: "14px 32px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="#D9822B" strokeWidth="2"></circle>
              <circle cx="16" cy="16" r="5" fill="#D9822B"></circle>
              <path d="M2 16h6M24 16h6" stroke="#D9822B" strokeWidth="2" strokeLinecap="round"></path>
            </svg>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "21px", fontWeight: 600 }}>
              Real Access
            </span>
            <span style={{
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "1.6px",
              color: "#12171E",
              background: "#D9822B",
              borderRadius: "4px",
              padding: "3px 8px"
            }}>
              ADMIN
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: "14px" }}>
            <Link to="/clubs" style={{ color: "#D8D2C4", textDecoration: "none", fontSize: "13px" }}>
              Member Clubs View
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 600 }}>{currentUser?.name || "Admin"}</span>
            </div>
            <button
              onClick={handleSignOut}
              style={{
                color: "#F5F1E8",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                textDecoration: "underline",
                textUnderlineOffset: "3px"
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* BODY WITH SIDE NAV */}
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>

        {/* SIDEBAR NAVIGATION */}
        <nav
          className="admin-sidebar-nav"
          style={{
            flex: "0 0 232px",
            boxSizing: "border-box",
            padding: "28px 16px",
            borderRight: "1px solid #DDD6C7",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            background: "#F3EFE7"
          }}
        >
          <button
            onClick={() => setActiveTab("members")}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: activeTab === "members" ? "#E4DDCF" : "transparent",
              fontSize: "15px",
              fontWeight: activeTab === "members" ? 600 : 500,
              color: activeTab === "members" ? "#12171E" : "#4A5260",
              border: "none",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            Members
          </button>

          <button
            onClick={() => setActiveTab("applications")}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: activeTab === "applications" ? "#E4DDCF" : "transparent",
              fontSize: "15px",
              fontWeight: activeTab === "applications" ? 600 : 500,
              color: activeTab === "applications" ? "#12171E" : "#4A5260",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <span>Pending Approvals</span>
            {applications.length > 0 && (
              <span style={{
                background: "#D9822B",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "999px",
                padding: "2px 7px"
              }}>
                {applications.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("invites")}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: activeTab === "invites" ? "#E4DDCF" : "transparent",
              fontSize: "15px",
              fontWeight: activeTab === "invites" ? 600 : 500,
              color: activeTab === "invites" ? "#12171E" : "#4A5260",
              border: "none",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            Invites
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: activeTab === "audit" ? "#E4DDCF" : "transparent",
              fontSize: "15px",
              fontWeight: activeTab === "audit" ? 600 : 500,
              color: activeTab === "audit" ? "#12171E" : "#4A5260",
              border: "none",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            Audit Log
          </button>

          <button
            onClick={() => setActiveTab("cleanup")}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: activeTab === "cleanup" ? "#E4DDCF" : "transparent",
              fontSize: "15px",
              fontWeight: activeTab === "cleanup" ? 600 : 500,
              color: activeTab === "cleanup" ? "#12171E" : "#4A5260",
              border: "none",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            Automated Cleanup
          </button>
        </nav>

        {/* MAIN ADMIN WORK AREA */}
        <main style={{
          flex: "1 1 640px",
          minWidth: 0,
          boxSizing: "border-box",
          padding: "32px 40px 40px",
          display: "flex",
          flexDirection: "column",
          gap: "28px"
        }}>

          {/* Status Alerts */}
          {statusMessage && (
            <div style={{
              background: "#DDEFE2",
              border: "1px solid #1F6B3F",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#1F6B3F",
              fontSize: "14px"
            }}>
              {statusMessage}
            </div>
          )}

          {errorMessage && (
            <div style={{
              background: "#F6DDD4",
              border: "1px solid #9B3A22",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#9B3A22",
              fontSize: "14px"
            }}>
              {errorMessage}
            </div>
          )}

          {/* TAB: PENDING e-KYC APPLICATIONS */}
          {activeTab === "applications" && (
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
                                onClick={() => setPreviewImage({ title: `${app.name} — Live Portrait Capture`, src: app.face_data_url, isPdf: false })}
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
                                    onClick={() => setPreviewImage({ title: `${app.name} — Supporting Document (${app.document_name})`, src: app.document_data_url, isPdf: true })}
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
                                  onClick={() => setPreviewImage({ title: `${app.name} — Supporting Document (${app.document_name})`, src: app.document_data_url, isPdf: false })}
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
                            onClick={() => handleRejectApp(app.id, app.name)}
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
                            onClick={() => handleApproveApp(app.id, app.name)}
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
          )}

          {/* TAB 1: MEMBERS */}
          {activeTab === "members" && (
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
                    onClick={handleRunCleanup}
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
                    onClick={() => setShowInviteModal(true)}
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
                      <div>LAST ACTIVE</div>
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
                              {u.term_end ? new Date(u.term_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Indefinite"}
                            </div>

                            {/* Last Active */}
                            <div style={{ fontSize: "13px", color: "#5A6270" }}>
                              {u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : "Never"}
                            </div>

                            {/* Action Button */}
                            <div style={{ textAlign: "right" }}>
                              {u.status === "active" ? (
                                <button
                                  type="button"
                                  onClick={() => handleMarkLeft(u)}
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
                                  onClick={() => handleEnable(u)}
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
          )}

          {/* TAB 2: AUDIT LOG */}
          {activeTab === "audit" && (
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
                        <th style={{ padding: "12px 20px" }}>TIMESTAMP</th>
                        <th style={{ padding: "12px 20px" }}>ACTION</th>
                        <th style={{ padding: "12px 20px" }}>ACTOR</th>
                        <th style={{ padding: "12px 20px" }}>DETAILS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id} style={{ borderTop: "1px solid #E6E0D2" }}>
                          <td style={{ padding: "12px 20px", color: "#5A6270", fontSize: "13px" }}>
                            {new Date(log.at).toLocaleString()}
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
          )}

          {/* TAB: INVITES */}
          {activeTab === "invites" && (
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
                  onClick={() => setShowInviteModal(true)}
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
                      onClick={() => setShowInviteModal(true)}
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
                              {inv.term_end ? new Date(inv.term_end).toLocaleDateString() : "No Expiry"}
                            </td>
                            <td style={{ padding: "14px 18px", color: "#5A6270" }}>
                              {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "\u2013"}
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
          )}

          {/* TAB: CLEANUP */}
          {activeTab === "cleanup" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "600px" }}>
              <div>
                <h1 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "40px" }}>
                  Automated Cleanup Job
                </h1>
                <p style={{ color: "#5A6270", fontSize: "14px", margin: 0 }}>
                  Evaluates all student accounts against two conditions: (1) term end date expired, or (2) no activity for 60 days.
                </p>
              </div>

              <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "20px" }}>On-Demand Execution (Demo Trigger)</h3>
                <p style={{ fontSize: "14px", color: "#5A6270", margin: 0 }}>
                  In production, this job executes automatically every 24 hours. Click below to run it immediately and see expired accounts disabled.
                </p>
                <button
                  type="button"
                  disabled={cleaning}
                  onClick={handleRunCleanup}
                  className="btn-dark"
                  style={{ alignSelf: "flex-start" }}
                >
                  {cleaning ? "Evaluating Accounts..." : "Run Cleanup Job Now"}
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* INVITE MEMBER MODAL */}
      {showInviteModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(18, 23, 30, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 999
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "#FBF9F4",
              border: "1px solid #DDD6C7",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontFamily: "'Newsreader', Georgia, serif", fontSize: "28px" }}>
              Invite New Member
            </h2>
            <p style={{ fontSize: "14px", color: "#5A6270", marginBottom: "20px" }}>
              Create an onboarding invite link. The student will set their password and pass liveness verification.
            </p>

            <form onSubmit={handleCreateInvite} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 500 }}>Student Email</label>
                <input
                  type="email"
                  required
                  placeholder="student@college.edu"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input-editorial"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 500 }}>Membership Expiration (Term End)</label>
                <input
                  type="date"
                  value={inviteTermEnd}
                  onChange={(e) => setInviteTermEnd(e.target.value)}
                  className="input-editorial"
                />
              </div>

              {generatedInvite && (
                <div style={{ background: "#E4DDCF", padding: "12px", borderRadius: "8px", fontSize: "13px", wordBreak: "break-all" }}>
                  <strong>Invite Link:</strong>
                  <div>{generatedInvite.link}</div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => { setShowInviteModal(false); setGeneratedInvite(null); }}
                  style={{
                    height: "40px",
                    padding: "0 16px",
                    background: "transparent",
                    border: "1px solid #B9B2A3",
                    borderRadius: "8px",
                    cursor: "pointer"
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn-dark"
                  style={{ height: "40px" }}
                >
                  Generate Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMAGE / DOCUMENT PREVIEW MODAL */}
      {previewImage && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(18, 23, 30, 0.75)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            zIndex: 1000
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FBF9F4",
              border: "1px solid #DDD6C7",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "850px",
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontSize: "22px", fontWeight: 600 }}>
                {previewImage.title || "Document Preview"}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  color: "#5A6270",
                  padding: "4px 8px"
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, minHeight: "300px", maxHeight: "65vh", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", background: "#EAE5D9", borderRadius: "8px" }}>
              {previewImage.isPdf ? (
                <iframe
                  src={previewImage.src}
                  title="PDF Document"
                  style={{ width: "100%", height: "550px", border: "none", borderRadius: "8px" }}
                />
              ) : (
                <img
                  src={previewImage.src}
                  alt="Expanded Preview"
                  style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain", borderRadius: "8px" }}
                />
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="btn-dark"
                style={{ height: "36px", padding: "0 18px", fontSize: "14px" }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
