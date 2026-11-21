import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest, API_BASE } from "../api";
import AdminMembersTab from "../components/admin/AdminMembersTab";
import AdminApplicationsTab from "../components/admin/AdminApplicationsTab";
import AdminRenewalsTab from "../components/admin/AdminRenewalsTab";
import AdminInvitesTab from "../components/admin/AdminInvitesTab";
import AdminCleanupTab from "../components/admin/AdminCleanupTab";
import AdminAuditTab from "../components/admin/AdminAuditTab";
import AdminFaceLockTab from "../components/admin/AdminFaceLockTab";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — ADMIN CONSOLE
 * ==============================================================================
 * In plain words (Layman):
 *   This is the security command center for university department administrators.
 *   Admins can view all club members, see their expiration dates, click "Mark as left"
 *   to instantly cut off access everywhere, trigger automatic cleanup on demand,
 *   review pending e-KYC photo applications, handle 48h recovery renewals,
 *   and inspect the live audit log.
 * ==============================================================================
 */

export default function Admin() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("members"); // members, applications, invites, renewals, audit, cleanup

  // Data states
  const [users, setUsers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [invites, setInvites] = useState([]);
  const [renewals, setRenewals] = useState([]);
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

  // Cleanup state
  const [cleanupResult, setCleanupResult] = useState(null);
  const [cleaning, setCleaning] = useState(false);

  // Biometric Face Lock state
  const [faceProfiles, setFaceProfiles] = useState([]);
  const [requireFaceMatch, setRequireFaceMatch] = useState(false);
  const [loadingFaces, setLoadingFaces] = useState(false);

  useEffect(() => {
    loadInitialData();

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
      await fetchRenewals();
      await fetchAudit();
      await fetchFaceProfiles();
    } catch {
      navigate("/login", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const fetchFaceProfiles = async () => {
    try {
      setLoadingFaces(true);
      const data = await apiRequest("/admin/face-profiles");
      setFaceProfiles(Array.isArray(data.faces) ? data.faces : []);
      setRequireFaceMatch(Boolean(data.require_face_match));
    } catch {
      setFaceProfiles([]);
    } finally {
      setLoadingFaces(false);
    }
  };

  const handleToggleFaceRestriction = async (enforce) => {
    if (enforce && faceProfiles.length === 0) {
      setErrorMessage("Cannot enforce Biometric Lock without enrolling at least one authorized administrator face profile. Please enroll your face below first.");
      return;
    }
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest("/admin/face-profiles/toggle-restriction", {
        method: "POST",
        body: JSON.stringify({ enforce })
      });
      setRequireFaceMatch(Boolean(res.require_face_match));
      setStatusMessage(res.message || "Face restriction setting updated.");
      await fetchFaceProfiles();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to toggle face restriction");
    }
  };

  const handleAddFaceProfile = async (label, photoBase64) => {
    setStatusMessage(null);
    setErrorMessage(null);
    const res = await apiRequest("/admin/face-profiles", {
      method: "POST",
      body: JSON.stringify({ label, face_photo: photoBase64 })
    });
    setStatusMessage(res.message || "Face profile enrolled successfully.");
    await fetchFaceProfiles();
    await fetchAudit();
  };

  const handleDeleteFaceProfile = async (faceId) => {
    if (!window.confirm("Remove this authorized administrator face profile?")) return;
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest(`/admin/face-profiles/${faceId}`, {
        method: "DELETE"
      });
      setStatusMessage(res.message || "Authorized face profile removed.");
      await fetchFaceProfiles();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to remove face profile");
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiRequest("/admin/users");
      setUsers(data);
    } catch (err) {
      setErrorMessage(err.message || "Failed to load members list");
    }
  };

  const fetchApplications = async () => {
    try {
      const data = await apiRequest("/admin/applications");
      setApplications(Array.isArray(data) ? data : []);
    } catch {
      setApplications([]);
    }
  };

  const fetchInvites = async () => {
    try {
      const data = await apiRequest("/admin/invites");
      if (Array.isArray(data) && data.length > 0) {
        setInvites(data);
      }
    } catch {
      // Fallback
    }
  };

  const fetchRenewals = async () => {
    try {
      const data = await apiRequest("/admin/renewals");
      setRenewals(Array.isArray(data) ? data : []);
    } catch {
      setRenewals([]);
    }
  };

  const fetchAudit = async () => {
    try {
      const data = await apiRequest("/admin/audit?limit=100");
      setAuditLogs(data);
    } catch {
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

  const handleApproveApp = async (appId, applicantName) => {
    setActionLoadingId(appId);
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest(`/admin/applications/${appId}/approve`, { method: "POST" });
      setStatusMessage(res.message || `Application for ${applicantName} approved! Account is now active.`);
      await fetchApplications();
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to approve application");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectApp = async (appId, applicantName) => {
    const reason = window.prompt(`Reject application for ${applicantName}? Enter rejection reason for audit trail:`, "Identity could not be verified");
    if (reason === null) return;
    setActionLoadingId(appId);
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest(`/admin/applications/${appId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      setStatusMessage(res.message || `Application for ${applicantName} rejected.`);
      await fetchApplications();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to reject application");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveRenewal = async (reqId, memberName) => {
    setActionLoadingId(reqId);
    try {
      const res = await apiRequest(`/admin/renewals/${reqId}/approve`, { method: "POST" });
      setStatusMessage(res.message || `Approved renewal for ${memberName}! Access restored.`);
      await fetchRenewals();
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to approve renewal request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclineRenewal = async (reqId, memberName) => {
    if (!window.confirm(`Are you sure you want to decline the renewal request for ${memberName}?`)) return;
    setActionLoadingId(reqId);
    try {
      await apiRequest(`/admin/renewals/${reqId}/decline`, { method: "POST" });
      setStatusMessage(`Renewal request for ${memberName} declined.`);
      await fetchRenewals();
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to decline renewal request");
    } finally {
      setActionLoadingId(null);
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
    } catch {
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
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return u.status === "active";
    if (statusFilter === "disabled") return u.status === "disabled" || u.status === "deleted";
    if (statusFilter === "ending_soon") {
      if (u.status !== "active" || !u.term_end) return false;
      const diffDays = Math.ceil((new Date(u.term_end) - new Date()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }
    return true;
  });

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F1E8", color: "#12171E", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>Loading Security Command Desk...</div>
          <div style={{ fontSize: "14px", color: "#5A6270" }}>Validating administrator session & permissions</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F5F1E8", color: "#12171E", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      {/* TOP HEADER */}
      <header className="admin-header">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link to="/clubs" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "inherit" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              background: "#12171E",
              color: "#F5F1E8",
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: "19px",
              fontWeight: 600,
              borderRadius: "8px"
            }}>
              S
            </span>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "22px", fontWeight: 600 }}>
              Sankalp SSO
            </span>
          </Link>
          <span className="admin-header-sep" style={{ fontSize: "13px", color: "#5A6270" }}>&bull;</span>
          <span className="admin-header-title" style={{ fontSize: "14px", fontWeight: 500, color: "#12171E" }}>Admin Command Desk</span>
        </div>

        <div className="admin-header-actions" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            to="/clubs"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#12171E",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: "6px",
              background: "#EAE4D6",
              whiteSpace: "nowrap"
            }}
          >
            ← View Campus Clubs
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "#12171E",
              color: "#F5F1E8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 600,
              flexShrink: 0
            }}>
              {getInitials(currentUser?.name)}
            </div>
            <div className="admin-user-name" style={{ fontSize: "14px", fontWeight: 500, color: "#12171E", whiteSpace: "nowrap" }}>
              {currentUser?.name || "Administrator"}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: "6px 12px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#9B3A22",
              background: "transparent",
              border: "1px solid #9B3A22",
              borderRadius: "6px",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* BODY WITH SIDEBAR NAVIGATION */}
      <div className="admin-layout">
        {/* SIDEBAR TABS */}
        <nav className="admin-sidebar">
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
            onClick={() => setActiveTab("renewals")}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: activeTab === "renewals" ? "#E4DDCF" : "transparent",
              fontSize: "15px",
              fontWeight: activeTab === "renewals" ? 600 : 500,
              color: activeTab === "renewals" ? "#12171E" : "#4A5260",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <span>Renewals Desk</span>
            {renewals.filter((r) => r.status === "pending").length > 0 && (
              <span style={{
                background: "#DC2626",
                color: "#FFFFFF",
                fontSize: "11px",
                fontWeight: 700,
                borderRadius: "999px",
                padding: "2px 7px"
              }}>
                {renewals.filter((r) => r.status === "pending").length}
              </span>
            )}
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

          <button
            onClick={() => setActiveTab("facelock")}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: activeTab === "facelock" ? "#E4DDCF" : "transparent",
              fontSize: "15px",
              fontWeight: activeTab === "facelock" ? 600 : 500,
              color: activeTab === "facelock" ? "#12171E" : "#4A5260",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <span>Biometric Face Lock</span>
            {requireFaceMatch && faceProfiles.length > 0 && (
              <span style={{
                background: "#1F6B3F",
                color: "#FFFFFF",
                fontSize: "10px",
                fontWeight: 700,
                borderRadius: "999px",
                padding: "2px 7px"
              }}>
                ACTIVE
              </span>
            )}
          </button>
        </nav>

        {/* MAIN ADMIN WORK AREA */}
        <main className="admin-content">
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

          {/* TAB: MEMBERS */}
          {activeTab === "members" && (
            <AdminMembersTab
              users={users}
              filteredUsers={filteredUsers}
              activeCount={activeCount}
              endingSoonCount={endingSoonCount}
              disabledCount={disabledCount}
              waitingDeleteCount={waitingDeleteCount}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              cleaning={cleaning}
              onRunCleanup={handleRunCleanup}
              onShowInviteModal={() => setShowInviteModal(true)}
              onMarkLeft={handleMarkLeft}
              onEnable={handleEnable}
            />
          )}

          {/* TAB: PENDING e-KYC APPLICATIONS */}
          {activeTab === "applications" && (
            <AdminApplicationsTab
              applications={applications}
              actionLoadingId={actionLoadingId}
              onApproveApp={handleApproveApp}
              onRejectApp={handleRejectApp}
              onPreviewImage={setPreviewImage}
            />
          )}

          {/* TAB: INVITES */}
          {activeTab === "invites" && (
            <AdminInvitesTab
              invites={invites}
              onShowInviteModal={() => setShowInviteModal(true)}
            />
          )}

          {/* TAB: RENEWALS */}
          {activeTab === "renewals" && (
            <AdminRenewalsTab
              renewals={renewals}
              actionLoadingId={actionLoadingId}
              onApproveRenewal={handleApproveRenewal}
              onDeclineRenewal={handleDeclineRenewal}
            />
          )}

          {/* TAB: AUDIT LOG */}
          {activeTab === "audit" && (
            <AdminAuditTab auditLogs={auditLogs} />
          )}

          {/* TAB: CLEANUP */}
          {activeTab === "cleanup" && (
            <AdminCleanupTab
              cleaning={cleaning}
              onRunCleanup={handleRunCleanup}
            />
          )}

          {/* TAB: BIOMETRIC FACE LOCK */}
          {activeTab === "facelock" && (
            <AdminFaceLockTab
              faceProfiles={faceProfiles}
              requireFaceMatch={requireFaceMatch}
              onToggleRestriction={handleToggleFaceRestriction}
              onAddFace={handleAddFaceProfile}
              onDeleteFace={handleDeleteFaceProfile}
              loading={loadingFaces}
              onPreviewImage={setPreviewImage}
            />
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
