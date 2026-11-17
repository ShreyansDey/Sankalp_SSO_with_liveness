import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiRequest, API_BASE } from "../api";
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight, UserCheck } from "lucide-react";

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const clientId = searchParams.get("client_id") || "";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const state = searchParams.get("state") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check if session already exists
  useEffect(() => {
    async function checkSession() {
      try {
        const me = await apiRequest("/me");
        if (me && me.status === "active") {
          if (clientId && redirectUri) {
            // Already active SSO session -> bounce to /authorize to issue code and redirect back!
            window.location.href = `${API_BASE}/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
            return;
          }
          if (me.role === "admin") {
            navigate("/admin");
            return;
          }
        }
      } catch (e) {
        // No active session
      } finally {
        setCheckingSession(false);
      }
    }
    checkSession();
  }, [clientId, redirectUri, state, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (res.next === "liveness") {
        // Needs camera liveness check
        const params = new URLSearchParams();
        params.set("user_id", res.user_id);
        params.set("email", res.email);
        if (clientId) params.set("client_id", clientId);
        if (redirectUri) params.set("redirect_uri", redirectUri);
        if (state) params.set("state", state);

        navigate(`/liveness?${params.toString()}`);
      } else if (res.next === "authenticated") {
        if (clientId && redirectUri) {
          window.location.href = `${API_BASE}/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
        } else if (res.user && res.user.role === "admin") {
          navigate("/admin");
        } else {
          navigate("/admin");
        }
      }
    } catch (err) {
      if (err.error === "account_disabled") {
        setError("Account is disabled. Please contact your organization administrator.");
      } else if (err.error === "invalid_credentials") {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(err.message || "Login failed. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (userEmail, userPass) => {
    setEmail(userEmail);
    setPassword(userPass);
    setError(null);
  };

  if (checkingSession) {
    return (
      <div className="auth-wrapper" style={{ textAlign: "center", marginTop: "100px" }}>
        <p style={{ color: "var(--text-muted)" }}>Checking active SSO session...</p>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="card">
        <div className="card-header" style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", padding: "12px", background: "var(--primary-light)", borderRadius: "12px", color: "var(--primary)", marginBottom: "12px" }}>
            <ShieldCheck size={32} />
          </div>
          <h1 className="card-title">Sign In to Sankalp SSO</h1>
          <p className="card-subtitle">
            {clientId ? `Authenticating for ${clientId}` : "Single Sign-On with verified digital identity"}
          </p>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: "relative" }}>
              <input
                type="email"
                className="form-input"
                placeholder="name@organization.edu"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Verifying..." : "Continue to Liveness Check"} <ArrowRight size={16} />
          </button>
        </form>

        <div className="quick-fill-bar">
          <button
            type="button"
            className="quick-btn"
            onClick={() => fillCredentials("rahul@club.edu", "RahulPassword123!")}
          >
            👤 Demo Rahul
          </button>
          <button
            type="button"
            className="quick-btn"
            onClick={() => fillCredentials("admin@jadavpur.edu", "AdminPassword123!")}
          >
            🛡️ Demo Admin
          </button>
          <button
            type="button"
            className="quick-btn"
            onClick={() => fillCredentials("expired@club.edu", "ExpiredPassword123!")}
          >
            ⏳ Expired User
          </button>
        </div>

        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Have an invite? <Link to="/signup" style={{ color: "var(--primary)", fontWeight: 600 }}>Accept Invite</Link>
        </div>
      </div>
    </div>
  );
}
