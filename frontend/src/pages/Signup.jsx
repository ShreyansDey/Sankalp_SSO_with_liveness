import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiRequest } from "../api";
import { ArrowRight, Eye, EyeOff, AlertCircle } from "lucide-react";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — INVITE-BASED ACCOUNT ACTIVATION (SIGNUP)
 * ==============================================================================
 * In plain words (Layman):
 *   Students or new club members activate their account here using an invite link
 *   sent by an administrator. They set their password and proceed directly
 *   to the camera check.
 *
 * Technical Architecture:
 *   - Verifies the one-time invite token against the invites table
 *   - Creates user row with status='active' and hashed password (argon2id)
 *   - Marks invite used with used_at timestamp
 *   - Redirects to /liveness to complete identity verification
 * ==============================================================================
 */

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenParam = searchParams.get("token") || "";

  const [inviteToken, setInviteToken] = useState(tokenParam);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiRequest("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          invite_token: inviteToken,
          name,
          password
        }),
      });

      if (res.next === "liveness") {
        const params = new URLSearchParams();
        params.set("user_id", res.user_id);
        params.set("email", res.email);
        navigate(`/liveness?${params.toString()}`);
      }
    } catch (err) {
      if (err.error === "invite_used") {
        setError("This invite token has already been used. Please log in.");
      } else if (err.error === "invite_expired") {
        setError("This invite token has expired. Please ask your administrator for a new invite.");
      } else if (err.error === "user_exists") {
        setError("An account with this email already exists. Please log in.");
      } else {
        setError(err.message || "Signup failed. Please verify your invite token.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F3EFE7", color: "#12171E", display: "flex", flexDirection: "column" }}>
      
      {/* Top Banner */}
      <header style={{ borderBottom: "1px solid #DDD6C7", padding: "18px 48px", background: "#FBF9F4" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2.5px solid #12171E", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#D9822B" }}></div>
            </div>
            <span style={{ fontFamily: "Newsreader, Georgia, serif", fontSize: "20px", fontWeight: "600" }}>Real Access</span>
          </div>
          <div style={{ fontSize: "14px" }}>
            <Link to="/login" style={{ color: "#12171E", textDecoration: "underline", textUnderlineOffset: "3px" }}>
              Back to sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Main Activation Card */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{
          background: "#FBF9F4",
          border: "1px solid #DDD6C7",
          borderRadius: "16px",
          padding: "40px",
          maxWidth: "460px",
          width: "100%",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.04)"
        }}>
          
          <div style={{ marginBottom: "24px" }}>
            <h1 style={{ fontFamily: "Newsreader, Georgia, serif", fontSize: "30px", fontWeight: "500", margin: "0 0 8px" }}>
              Activate your account
            </h1>
            <p style={{ color: "#5A6270", fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
              Join your university club with your admin invite token.
            </p>
          </div>

          {error && (
            <div style={{
              background: "#F6DDD4",
              border: "1px solid #9B3A22",
              borderRadius: "8px",
              padding: "12px 14px",
              color: "#9B3A22",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "20px"
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                Invite Token
              </label>
              <input
                type="text"
                placeholder="Paste your invite token"
                required
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                style={{
                  width: "100%",
                  height: "44px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: "1px solid #C4BCAF",
                  background: "#FDFBF7",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                Your Full Name
              </label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  height: "44px",
                  padding: "0 14px",
                  borderRadius: "8px",
                  border: "1px solid #C4BCAF",
                  background: "#FDFBF7",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                Choose Password (minimum 8 characters)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    height: "44px",
                    padding: "0 44px 0 14px",
                    borderRadius: "8px",
                    border: "1px solid #C4BCAF",
                    background: "#FDFBF7",
                    fontSize: "14px",
                    boxSizing: "border-box"
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#5A6270",
                    cursor: "pointer",
                    padding: "4px"
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                height: "46px",
                width: "100%",
                background: "#12171E",
                color: "#F5F1E8",
                border: 0,
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: "6px"
              }}
            >
              {loading ? "Activating..." : "Create Account & Verify"} <ArrowRight size={16} />
            </button>
          </form>

          {/* Quick Fill Bar for Demo Ease */}
          <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #E6E0D2" }}>
            <button
              type="button"
              onClick={() => {
                setInviteToken("demo-invite-token-12345");
                setName("Aarav Sen");
                setPassword("AaravPassword123!");
              }}
              style={{
                width: "100%",
                height: "36px",
                background: "#EFECE4",
                border: "1px solid #DDD6C7",
                borderRadius: "6px",
                color: "#12171E",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              📋 Quick Fill: Demo Invite Token
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
