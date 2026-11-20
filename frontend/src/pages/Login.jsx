import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiRequest, API_BASE } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — CENTRAL LOGIN (SIGN IN)
 * ==============================================================================
 * In plain words (Layman):
 *   This is the high-security front door. Students and club members log in here
 *   with their email and password. Once verified, they proceed to the camera
 *   check to prove a real, live human is present.
 *
 * Technical Role:
 *   - Matches the '1. Sign in' design component (Main.dc.html)
 *   - Calls POST /auth/login with { email, password }
 *   - Preserves OAuth 2.0 query parameters (client_id, redirect_uri, state)
 *   - Redirects to /liveness on credential validation
 * ==============================================================================
 */

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const clientId = searchParams.get("client_id") || "";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const state = searchParams.get("state") || "";

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check if an active SSO session already exists
  useEffect(() => {
    async function checkSession() {
      try {
        const me = await apiRequest("/me");
        if (me && me.status === "active") {
          if (clientId && redirectUri) {
            // Already authenticated -> issue code and redirect back to client app
            window.location.href = `${API_BASE}/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
            return;
          }
          if (me.role === "admin") {
            navigate("/admin");
            return;
          } else {
            navigate("/clubs");
            return;
          }
        }
      } catch (e) {
        // No session exists, proceed to login form
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
        body: JSON.stringify({
          email,
          password,
          name: fullName.trim() || undefined,
          phone: phone.trim() || undefined
        }),
      });

      if (res.next === "liveness") {
        // Proceed to liveness challenge with preserved redirect parameters
        const params = new URLSearchParams();
        params.set("user_id", res.user_id);
        params.set("email", res.email);
        if (clientId) params.set("client_id", clientId);
        if (redirectUri) params.set("redirect_uri", redirectUri);
        if (state) params.set("state", state);

        navigate(`/liveness?${params.toString()}`, { replace: true });
      } else if (res.next === "authenticated") {
        if (clientId && redirectUri) {
          window.location.href = `${API_BASE}/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
        } else if (res.user && res.user.role === "admin") {
          navigate("/admin", { replace: true });
        } else {
          navigate("/clubs", { replace: true });
        }
      }
    } catch (err) {
      if (err.error === "account_disabled") {
        setError("Account is disabled. Please contact your organization administrator.");
      } else if (err.error === "account_pending_approval") {
        setError("Your registration is currently under review by an administrator. Once approved, you will be able to log in.");
      } else if (err.error === "invalid_credentials") {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(err.message || "Login failed. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fillDevUser = (type) => {
    if (!import.meta.env.DEV) return;
    if (type === "admin") {
      setFullName(import.meta.env.VITE_DEV_ADMIN_NAME || "Sankalp Admin");
      setPhone(import.meta.env.VITE_DEV_ADMIN_PHONE || "+91 98765 00001");
      setEmail(import.meta.env.VITE_DEV_ADMIN_EMAIL || "admin@jadavpur.edu");
      setPassword(import.meta.env.VITE_DEV_ADMIN_PASSWORD || "shaan123");
    } else {
      setFullName(import.meta.env.VITE_DEV_MEMBER_NAME || "Rahul Sharma");
      setPhone(import.meta.env.VITE_DEV_MEMBER_PHONE || "+91 98765 00002");
      setEmail(import.meta.env.VITE_DEV_MEMBER_EMAIL || "rahul@club.edu");
      setPassword(import.meta.env.VITE_DEV_MEMBER_PASSWORD || "shaan123");
    }
    setError(null);
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handleKeyDown = (e) => {
      if (e.altKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        fillDevUser("admin");
      } else if (e.altKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        fillDevUser("member");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (checkingSession) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3EFE7" }}>
        <p style={{ color: "#5A6270", fontSize: "15px" }}>Verifying active session...</p>
      </div>
    );
  }

  return (
    <div style={{
      height: "100vh",
      maxHeight: "100vh",
      overflow: "hidden",
      display: "flex",
      flexWrap: "wrap",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#12171E",
      background: "#F3EFE7"
    }}>

      {/* LEFT: Editorial Brand Panel */}
      <div style={{
        flex: "1 1 500px",
        minWidth: "320px",
        background: "#12171E",
        color: "#E9E4D8",
        boxSizing: "border-box",
        padding: "36px 48px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "24px"
      }}>
        {/* Brand Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="14" stroke="#D9822B" strokeWidth="2"></circle>
            <circle cx="16" cy="16" r="5" fill="#D9822B"></circle>
            <path d="M2 16h6M24 16h6" stroke="#D9822B" strokeWidth="2" strokeLinecap="round"></path>
          </svg>
          <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "22px", fontWeight: 600, letterSpacing: "0.2px" }}>
            Real Access
          </span>
        </div>

        {/* Brand Narrative & Sample Access Passes */}
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "2.2px", color: "#D9822B" }}>
              SELF-HOSTED SIGN-IN
            </div>
            <h1 style={{
              margin: 0,
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(30px, 3.2vw, 42px)",
              lineHeight: 1.1,
              color: "#F5F1E8"
            }}>
              One login for every club.<br />
              <span style={{ fontStyle: "italic", color: "#D8D2C4" }}>Closed the day you leave.</span>
            </h1>
          </div>

          {/* Sample Club Access Passes (staggered layout) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "460px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", background: "#1B222C", border: "1px solid #2A3340", borderRadius: "10px", padding: "12px 16px", marginLeft: "0px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#2A3340", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, color: "#E9E4D8" }}>RS</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 500, color: "#F5F1E8" }}>Robotics Society</div>
                <div style={{ fontSize: "13px", color: "#A9B0BA" }}>Member until 30 Jun 2027</div>
              </div>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "#7FD1A0", background: "#16301F", borderRadius: "999px", padding: "3px 10px" }}>Active</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px", background: "#1B222C", border: "1px solid #2A3340", borderRadius: "10px", padding: "12px 16px", marginLeft: "24px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#2A3340", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, color: "#E9E4D8" }}>AI</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 500, color: "#F5F1E8" }}>Coding & AI Club</div>
                <div style={{ fontSize: "13px", color: "#A9B0BA" }}>Member until 31 Mar 2027</div>
              </div>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "#7FD1A0", background: "#16301F", borderRadius: "999px", padding: "3px 10px" }}>Active</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px", background: "#1B222C", border: "1px solid #2A3340", borderRadius: "10px", padding: "12px 16px", marginLeft: "48px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#2A3340", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, color: "#E9E4D8" }}>RK</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 500, color: "#F5F1E8" }}>Photography Club</div>
                <div style={{ fontSize: "13px", color: "#A9B0BA" }}>Left in June</div>
              </div>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "#F2A98F", background: "#3A1D17", borderRadius: "999px", padding: "3px 10px" }}>Access ended</div>
            </div>
          </div>
        </div>

        {/* Privacy Note */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", maxWidth: "440px" }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
            <path d="M10 2l6 2.5v4.7c0 3.9-2.5 7-6 8.3-3.5-1.3-6-4.4-6-8.3V4.5L10 2z" stroke="#A9B0BA" strokeWidth="1.5" strokeLinejoin="round"></path>
          </svg>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: "1.5", color: "#A9B0BA" }}>
            Your face video stays entirely in your browser. Only pass or fail is stored on our server.
          </p>
        </div>
      </div>

      {/* RIGHT: Sign-in Form */}
      <div style={{
        flex: "1 1 440px",
        minWidth: "320px",
        boxSizing: "border-box",
        padding: "24px 44px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "16px",
        overflowY: "auto"
      }}>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", fontSize: "13px", color: "#5A6270" }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <span><Link to="/register" style={{ fontWeight: 600, color: "#D9822B" }}>Create account &rarr;</Link></span>
            <span>Have an invite?&nbsp;<Link to="/signup" style={{ fontWeight: 600, color: "#12171E" }}>Set up</Link></span>
          </div>
        </div>

        <div style={{ width: "100%", maxWidth: "400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>
          
          {/* Step indicator */}
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", fontWeight: 500 }}>
            <li style={{ display: "flex", alignItems: "center", gap: "6px", color: "#12171E" }}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#12171E", color: "#F3EFE7", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>
                1
              </span>
              Sign in
            </li>
            <li aria-hidden="true" style={{ width: "24px", height: "1px", background: "#B9B2A3" }}></li>
            <li style={{ display: "flex", alignItems: "center", gap: "6px", color: "#5A6270" }}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", border: "1px solid #8C8574", color: "#5A6270", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>
                2
              </span>
              Camera check
            </li>
          </ol>

          {/* Heading */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h2 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "30px", lineHeight: 1.1 }}>
              Welcome
            </h2>
            <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.4", color: "#5A6270" }}>
              Sign in with your university or club account.
            </p>
          </div>

          {error && (
            <div style={{
              background: "#F6DDD4",
              border: "1px solid #9B3A22",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#9B3A22",
              fontSize: "13px"
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Full Name & Phone Number side-by-side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label htmlFor="fullname" style={{ fontSize: "12px", fontWeight: 500 }}>Full Name</label>
                <input
                  id="fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Rahul Sharma"
                  className="input-editorial"
                  style={{ height: "38px", fontSize: "13.5px", padding: "0 12px" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label htmlFor="phone" style={{ fontSize: "12px", fontWeight: 500 }}>Phone Number</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="input-editorial"
                  style={{ height: "38px", fontSize: "13.5px", padding: "0 12px" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label htmlFor="email" style={{ fontSize: "12px", fontWeight: 500 }}>Email Address</label>
              <input
                id="email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@college.edu"
                className="input-editorial"
                style={{ height: "38px", fontSize: "13.5px", padding: "0 12px" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="password" style={{ fontSize: "12px", fontWeight: 500 }}>Password</label>
                <Link
                  to="/forgot-password"
                  style={{
                    fontSize: "12px",
                    color: "#8A4A0F",
                    fontWeight: 600,
                    textDecoration: "none"
                  }}
                >
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="input-editorial"
                  style={{ height: "38px", fontSize: "13.5px", padding: "0 12px", paddingRight: "46px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    padding: "3px 6px",
                    color: "#5A6270",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 600
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-dark"
              style={{ width: "100%", height: "42px", marginTop: "4px", fontSize: "14px" }}
            >
              {loading ? "Verifying..." : "Continue \u2192"}
            </button>

            {/* Clickable line: Haven't any account? Create new one */}
            <div style={{ textAlign: "center", marginTop: "14px", marginBottom: "6px" }}>
              <Link
                to="/register"
                id="link-create-account"
                style={{
                  fontSize: "14px",
                  color: "#12171E",
                  textDecoration: "none",
                  cursor: "pointer",
                  display: "inline-block",
                  padding: "4px 10px"
                }}
              >
                Haven&apos;t any account?{" "}
                <span style={{ color: "#D9822B", fontWeight: 700, textDecoration: "underline" }}>
                  Create new one
                </span>
              </Link>
            </div>
          </form>

          {/* Development Quick Fill (Only rendered in local development) */}
          {import.meta.env.DEV && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "8px",
              borderTop: "1px dashed #DDD6C7",
              fontSize: "11.5px",
              color: "#5A6270"
            }}>
              <span>Dev Auto-Fill:</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => fillDevUser("admin")}
                  title="Keyboard shortcut: Alt+A"
                  style={{
                    background: "#EBE5D8",
                    border: "1px solid #C4BCAF",
                    borderRadius: "5px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#12171E",
                    cursor: "pointer"
                  }}
                >
                  Admin (Alt+A)
                </button>
                <button
                  type="button"
                  onClick={() => fillDevUser("member")}
                  title="Keyboard shortcut: Alt+M"
                  style={{
                    background: "#EBE5D8",
                    border: "1px solid #C4BCAF",
                    borderRadius: "5px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#12171E",
                    cursor: "pointer"
                  }}
                >
                  Member (Alt+M)
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ fontSize: "11.5px", color: "#5A6270", textAlign: "center" }}>
          Sankalp SSO &bull; Self-hosted for university clubs and research teams
        </div>
      </div>
    </div>
  );
}
