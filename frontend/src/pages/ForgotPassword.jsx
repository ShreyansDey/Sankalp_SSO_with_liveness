import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — FORGOT PASSWORD REQUEST
 * ==============================================================================
 * In plain words (Layman):
 *   Allows users who forgot their credentials to request a secure password reset link.
 *   An email is dispatched via SMTP with a cryptographically secure 15-minute token.
 * ==============================================================================
 */

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Failed to process password reset request. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexWrap: "wrap",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#12171E",
      background: "#F3EFE7"
    }}>

      {/* LEFT: Editorial Brand Panel */}
      <div style={{
        flex: "1 1 480px",
        minWidth: "320px",
        background: "#12171E",
        color: "#E9E4D8",
        boxSizing: "border-box",
        padding: "40px 48px",
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

        {/* Narrative */}
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "2.2px", color: "#D9822B" }}>
              ACCOUNT RECOVERY
            </div>
            <h1 style={{
              margin: 0,
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(30px, 3.2vw, 40px)",
              lineHeight: 1.15,
              color: "#F5F1E8"
            }}>
              Zero stress access recovery.<br />
              <span style={{ fontStyle: "italic", color: "#D8D2C4" }}>Verified directly to your inbox.</span>
            </h1>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "440px" }}>
            <div style={{
              background: "#1B222C",
              border: "1px solid #2A3340",
              borderRadius: "10px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#F5F1E8", fontWeight: 600, fontSize: "14px" }}>
                <span style={{ color: "#D9822B" }}>&bull;</span> Encrypted 15-Minute Link
              </div>
              <div style={{ fontSize: "13px", color: "#A9B0BA", lineHeight: 1.5 }}>
                Reset tokens are single-use, cryptographically hashed, and auto-expire after 15 minutes to guarantee student credential integrity.
              </div>
            </div>

            <div style={{
              background: "#1B222C",
              border: "1px solid #2A3340",
              borderRadius: "10px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#F5F1E8", fontWeight: 600, fontSize: "14px" }}>
                <span style={{ color: "#7FD1A0" }}>&bull;</span> Instant Session Revocation
              </div>
              <div style={{ fontSize: "13px", color: "#A9B0BA", lineHeight: 1.5 }}>
                Upon password update, all active sessions and refresh tokens across connected club portals are invalidated immediately.
              </div>
            </div>
          </div>
        </div>

        {/* Security Note */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", maxWidth: "440px" }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
            <path d="M10 2l6 2.5v4.7c0 3.9-2.5 7-6 8.3-3.5-1.3-6-4.4-6-8.3V4.5L10 2z" stroke="#A9B0BA" strokeWidth="1.5" strokeLinejoin="round"></path>
          </svg>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: "1.5", color: "#A9B0BA" }}>
            University Identity Guard: Only registered email accounts can receive password reset instructions.
          </p>
        </div>
      </div>

      {/* RIGHT: Request Form */}
      <div style={{
        flex: "1 1 440px",
        minWidth: "320px",
        boxSizing: "border-box",
        padding: "36px 48px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "20px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#5A6270" }}>
          <Link
            to="/login"
            style={{
              fontWeight: 600,
              color: "#12171E",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              textDecoration: "none"
            }}
          >
            &larr; Back to Sign In
          </Link>
          <span>Need an account?&nbsp;<Link to="/register" style={{ fontWeight: 600, color: "#8A4A0F" }}>Register</Link></span>
        </div>

        <div style={{ width: "100%", maxWidth: "400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "18px" }}>
          
          {/* Heading */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <h2 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "32px", lineHeight: 1.1 }}>
              Forgot Password
            </h2>
            <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "#5A6270" }}>
              Enter the email address registered with your club or university account to receive reset instructions.
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

          {!submitted ? (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor="reset-email" style={{ fontSize: "13px", fontWeight: 500 }}>Email Address</label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@college.edu or rahul@club.edu"
                  className="input-editorial"
                  style={{ height: "42px", fontSize: "14px", padding: "0 14px" }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-dark"
                style={{ width: "100%", height: "44px", marginTop: "6px", fontSize: "14px" }}
              >
                {loading ? "Sending Reset Link..." : "Send Reset Instructions \u2192"}
              </button>
            </form>
          ) : (
            <div style={{
              background: "#F2F8F4",
              border: "1px solid #7FD1A0",
              borderRadius: "10px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "#16301F",
                  color: "#7FD1A0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  fontWeight: "bold"
                }}>
                  ✓
                </div>
                <div style={{ fontWeight: 600, fontSize: "15px", color: "#16301F" }}>
                  Instructions Dispatched
                </div>
              </div>

              <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.5", color: "#2D4B35" }}>
                If an account exists for <strong>{email}</strong>, a password reset link has been dispatched to your inbox.
              </p>

              <div style={{ fontSize: "12.5px", color: "#5A6270", background: "#FFFFFF", padding: "10px 12px", borderRadius: "6px", border: "1px solid #D5E5DA" }}>
                Please check your email inbox and spam folder. The link will remain active for 15 minutes.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => navigate("/reset-password")}
                  style={{
                    background: "#D9822B",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Enter Verification Token Manually &rarr;
                </button>

                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  style={{
                    background: "transparent",
                    color: "#5A6270",
                    border: "none",
                    padding: "6px 0",
                    fontSize: "12.5px",
                    cursor: "pointer",
                    textDecoration: "underline"
                  }}
                >
                  Didn't receive it? Try another email
                </button>
              </div>
            </div>
          )}

          <div style={{
            paddingTop: "14px",
            borderTop: "1px dashed #DDD6C7",
            display: "flex",
            justifyContent: "center",
            fontSize: "13px"
          }}>
            <Link to="/login" style={{ color: "#8A4A0F", fontWeight: 600, textDecoration: "none" }}>
              Remember your password? Sign in &rarr;
            </Link>
          </div>
        </div>

        <div style={{ fontSize: "11.5px", color: "#5A6270", textAlign: "center" }}>
          Sankalp SSO &bull; Self-hosted for university clubs and research teams
        </div>
      </div>
    </div>
  );
}
