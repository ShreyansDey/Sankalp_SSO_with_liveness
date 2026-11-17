import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import {
  Users,
  UserX,
  UserCheck,
  Send,
  Boxes,
  ScrollText,
  Play,
  LogOut,
  AlertCircle,
  CheckCircle,
  Copy,
  Trash2,
  Clock,
  Shield,
  RefreshCw
} from "lucide-react";

export default function Admin() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("users"); // users, invites, products, audit, cleanup

  // Data states
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteTermEnd, setInviteTermEnd] = useState("");
  const [generatedInvite, setGeneratedInvite] = useState(null);

  // Product form
  const [productName, setProductName] = useState("");
  const [productRedirect, setProductRedirect] = useState("");
  const [registeredProduct, setRegisteredProduct] = useState(null);

  // Cleanup result
  const [cleanupResult, setCleanupResult] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const me = await apiRequest("/me");
      if (!me || me.role !== "admin") {
        navigate("/login");
        return;
      }
      setCurrentUser(me);
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiRequest("/admin/users");
      setUsers(data);
    } catch (err) {
      setErrorMessage("Failed to load users");
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
    if (!window.confirm(`Mark ${user.email} as left? This will instantly revoke access to all connected apps.`)) return;
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest(`/admin/users/${user.id}/mark-left`, { method: "POST" });
      setStatusMessage(`✅ ${user.name} marked as left. All active sessions and tokens revoked.`);
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to mark user as left");
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      if (user.status === "active") {
        await apiRequest(`/admin/users/${user.id}/disable`, {
          method: "POST",
          body: JSON.stringify({ reason: "admin" })
        });
        setStatusMessage(`User ${user.email} disabled.`);
      } else {
        await apiRequest(`/admin/users/${user.id}/enable`, { method: "POST" });
        setStatusMessage(`User ${user.email} re-enabled.`);
      }
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Action failed");
    }
  };

  const handleDeleteRequest = async (user) => {
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest(`/admin/users/${user.id}/delete-request`, { method: "POST" });
      setStatusMessage(res.message);
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to request deletion");
    }
  };

  const handleDeleteApprove = async (user) => {
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest(`/admin/users/${user.id}/delete-approve`, { method: "POST" });
      setStatusMessage(res.message);
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      if (err.error === "waiting_period_active") {
        setErrorMessage(`⚠️ Deletion Refused: ${err.message}`);
      } else {
        setErrorMessage(err.message || "Failed to approve deletion");
      }
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
          term_end: inviteTermEnd || null
        })
      });
      setGeneratedInvite(res);
      setStatusMessage("Invite created successfully!");
      setInviteEmail("");
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to create invite");
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          name: productName,
          redirect_uri: productRedirect
        })
      });
      setRegisteredProduct(res);
      setStatusMessage("Product registered successfully! Copy client secret now.");
      setProductName("");
      setProductRedirect("");
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to register product");
    }
  };

  const handleRunCleanup = async () => {
    try {
      setStatusMessage(null);
      setErrorMessage(null);
      const res = await apiRequest("/admin/cleanup/run", { method: "POST" });
      setCleanupResult(res);
      setStatusMessage(`Cleanup job finished: ${res.total_disabled} accounts disabled.`);
      await fetchUsers();
      await fetchAudit();
    } catch (err) {
      setErrorMessage(err.message || "Failed to run cleanup job");
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (e) {
    } finally {
      navigate("/login");
    }
  };

  if (loading) {
    return (
      <div className="main-content" style={{ textAlign: "center", marginTop: "100px" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading admin console...</p>
      </div>
    );
  }

  const activeCount = users.filter((u) => u.status === "active").length;
  const disabledCount = users.filter((u) => u.status === "disabled").length;

  return (
    <div className="app-container">
      {/* Navbar */}
      <header className="navbar">
        <div className="brand">
          <Shield size={24} color="var(--primary)" />
          <span>Sankalp Admin Console</span>
          <span className="brand-badge">Self-Hosted</span>
        </div>
        <div className="nav-links">
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Logged in as <strong>{currentUser?.email}</strong>
          </span>
          <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={handleLogout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Alerts */}
        {statusMessage && (
          <div className="alert alert-success">
            <CheckCircle size={18} style={{ flexShrink: 0 }} />
            <div>{statusMessage}</div>
          </div>
        )}
        {errorMessage && (
          <div className="alert alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Stats Bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>TOTAL USERS</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "4px" }}>{users.length}</div>
          </div>
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--success)", fontWeight: 600 }}>ACTIVE MEMBERS</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--success)", marginTop: "4px" }}>{activeCount}</div>
          </div>
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--danger)", fontWeight: 600 }}>REVOKED / DISABLED</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--danger)", marginTop: "4px" }}>{disabledCount}</div>
          </div>
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 600 }}>CONNECTED PRODUCTS</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--primary)", marginTop: "4px" }}>App A, App B</div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", marginBottom: "24px", paddingBottom: "12px", overflowX: "auto" }}>
          <button
            className={`btn ${activeTab === "users" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("users")}
          >
            <Users size={16} /> Members & Users
          </button>
          <button
            className={`btn ${activeTab === "invites" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("invites")}
          >
            <Send size={16} /> Invite Member
          </button>
          <button
            className={`btn ${activeTab === "products" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("products")}
          >
            <Boxes size={16} /> Products & Apps
          </button>
          <button
            className={`btn ${activeTab === "audit" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => { setActiveTab("audit"); fetchAudit(); }}
          >
            <ScrollText size={16} /> Audit Log
          </button>
          <button
            className={`btn ${activeTab === "cleanup" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("cleanup")}
          >
            <Play size={16} /> Automated Cleanup
          </button>
        </div>

        {/* TAB 1: USERS LIST */}
        {activeTab === "users" && (
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Members & Account Lifecycles</h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Instantly revoke former members via "Mark as Left" (FR2/M5).
                </p>
              </div>
              <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={fetchUsers}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Term End</th>
                    <th>Last Active</th>
                    <th>Liveness</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{u.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{u.email}</div>
                      </td>
                      <td>
                        <span style={{ textTransform: "capitalize", fontSize: "0.85rem" }}>{u.role}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${u.status}`}>
                          {u.status} {u.disabled_reason ? `(${u.disabled_reason})` : ""}
                        </span>
                      </td>
                      <td>{u.term_end || "No expiry"}</td>
                      <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {u.last_active_at ? new Date(u.last_active_at).toLocaleString() : "Never"}
                      </td>
                      <td>
                        {u.liveness_passed_at ? (
                          <span style={{ color: "var(--success)", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <CheckCircle size={14} /> Passed
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Pending</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {u.status === "active" && (
                            <button
                              className="btn btn-danger"
                              style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                              onClick={() => handleMarkLeft(u)}
                              title="Instantly blocks all connected products"
                            >
                              <UserX size={13} /> Mark as Left
                            </button>
                          )}
                          {u.status === "disabled" && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                              onClick={() => handleToggleStatus(u)}
                            >
                              <UserCheck size={13} /> Re-enable
                            </button>
                          )}
                          {u.status === "disabled" && (
                            <>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                                onClick={() => handleDeleteRequest(u)}
                                title="Request Deletion"
                              >
                                Request Delete
                              </button>
                              <button
                                className="btn btn-danger"
                                style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                                onClick={() => handleDeleteApprove(u)}
                                title="Requires 30 days after disable"
                              >
                                Approve Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: INVITE MEMBER */}
        {activeTab === "invites" && (
          <div className="card" style={{ maxWidth: "600px", margin: "0 auto" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "4px" }}>Create Member Invite</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "20px" }}>
              Members receive a unique invite link to set their own password and verify presence.
            </p>

            <form onSubmit={handleCreateInvite}>
              <div className="form-group">
                <label className="form-label">Member Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="student@club.edu"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-input"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Term End Date (Optional)</label>
                <input
                  type="date"
                  className="form-input"
                  value={inviteTermEnd}
                  onChange={(e) => setInviteTermEnd(e.target.value)}
                />
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  When this date passes, the cleanup job will automatically disable the account.
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block">
                Generate Invite Link
              </button>
            </form>

            {generatedInvite && (
              <div style={{ marginTop: "20px", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "6px" }}>Invite Generated:</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    readOnly
                    className="form-input"
                    style={{ fontSize: "0.85rem", background: "#fff" }}
                    value={generatedInvite.link}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedInvite.link);
                      alert("Invite link copied to clipboard!");
                    }}
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REGISTER PRODUCTS */}
        {activeTab === "products" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            <div className="card">
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "4px" }}>Connected Products</h2>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px" }}>
                Active demo products authorized for SSO login.
              </p>

              <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "14px", marginBottom: "12px" }}>
                <div style={{ fontWeight: 700 }}>App A — Photography Club</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                  client_id: app-a
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  redirect_uri: http://localhost:5174/callback
                </div>
              </div>

              <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontWeight: 700 }}>App B — Robotics Lab</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                  client_id: app-b
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  redirect_uri: http://localhost:5175/callback
                </div>
              </div>
            </div>

            <div className="card">
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "4px" }}>Register New Product</h2>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px" }}>
                Generate client_id and client_secret for external team applications.
              </p>

              <form onSubmit={handleCreateProduct}>
                <div className="form-group">
                  <label className="form-label">Product Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Coding Club Portal"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Allowed Redirect URI (Exact Match)</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="http://localhost:5176/callback"
                    required
                    value={productRedirect}
                    onChange={(e) => setProductRedirect(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block">
                  Register Product
                </button>
              </form>

              {registeredProduct && (
                <div style={{ marginTop: "16px", padding: "14px", background: "var(--warning-light)", borderRadius: "8px", border: "1px solid rgba(217, 119, 6, 0.2)" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--warning)", marginBottom: "4px" }}>
                    ⚠️ Copy Secret (Shown Only Once)
                  </div>
                  <div style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                    client_id: <strong>{registeredProduct.client_id}</strong>
                  </div>
                  <div style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                    client_secret: <strong>{registeredProduct.client_secret}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: AUDIT LOG */}
        {activeTab === "audit" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Security & Audit Log</h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Tamper-evident trail of logins, liveness results, admin revocations, and automated cleanups.
                </p>
              </div>
              <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} onClick={fetchAudit}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Actor ID</th>
                    <th>Target ID</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {new Date(log.at).toLocaleString()}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background:
                              log.action.includes("pass") || log.action.includes("ok")
                                ? "var(--success-light)"
                                : log.action.includes("fail") || log.action.includes("left") || log.action.includes("denied")
                                ? "var(--danger-light)"
                                : "var(--primary-light)",
                            color:
                              log.action.includes("pass") || log.action.includes("ok")
                                ? "var(--success)"
                                : log.action.includes("fail") || log.action.includes("left") || log.action.includes("denied")
                                ? "var(--danger)"
                                : "var(--primary)",
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
                        {log.actor_id ? log.actor_id.substring(0, 8) + "..." : "system"}
                      </td>
                      <td style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
                        {log.target_id ? log.target_id.substring(0, 8) + "..." : "—"}
                      </td>
                      <td style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {log.detail ? JSON.stringify(log.detail) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: AUTOMATED CLEANUP (Demo Step 5) */}
        {activeTab === "cleanup" && (
          <div className="card" style={{ maxWidth: "700px", margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{ padding: "12px", background: "var(--primary-light)", borderRadius: "10px", color: "var(--primary)" }}>
                <Clock size={28} />
              </div>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Automated Lifecycle Cleanup Job</h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Scheduled to run daily. Click below to trigger instantly on demand (Demo Step 5).
                </p>
              </div>
            </div>

            <div style={{ background: "#f8fafc", padding: "18px", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "8px" }}>Enforced Policies:</h3>
              <ul style={{ paddingLeft: "20px", fontSize: "0.88rem", color: "var(--text-main)", lineHeight: "1.8" }}>
                <li><strong>Term Expiry Policy:</strong> Accounts where <code>term_end &lt; today</code> are automatically disabled.</li>
                <li><strong>Inactivity Policy:</strong> Accounts with no activity for 60+ days are disabled.</li>
                <li><strong>Immediate Revocation:</strong> Disabling an account immediately revokes all active SSO sessions and refresh tokens.</li>
                <li><strong>Retention Safeguard:</strong> Deleted accounts require 30-day disable waiting period before admin deletion approval.</li>
              </ul>
            </div>

            <button className="btn btn-primary btn-block" style={{ padding: "12px" }} onClick={handleRunCleanup}>
              <Play size={18} /> Run Cleanup Job Now
            </button>

            {cleanupResult && (
              <div style={{ marginTop: "20px", padding: "16px", background: "var(--success-light)", border: "1px solid rgba(22, 163, 74, 0.2)", borderRadius: "8px" }}>
                <div style={{ fontWeight: 700, color: "var(--success)", marginBottom: "6px" }}>
                  ✅ Cleanup Completed Successfully!
                </div>
                <div style={{ fontSize: "0.88rem" }}>
                  Total Accounts Disabled: <strong>{cleanupResult.total_disabled}</strong>
                </div>
                {cleanupResult.disabled_users && cleanupResult.disabled_users.length > 0 && (
                  <ul style={{ marginTop: "8px", paddingLeft: "20px", fontSize: "0.82rem" }}>
                    {cleanupResult.disabled_users.map((du) => (
                      <li key={du.id}>
                        {du.email} (Reason: {du.reason})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        Project: <strong>Real Person, Real Access</strong> · Team <strong>Sankalp</strong> · Jadavpur University Hack N Pitch 2026
      </footer>
    </div>
  );
}
