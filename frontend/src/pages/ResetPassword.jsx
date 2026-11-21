import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — PASSWORD RESET COMPLETION
 * ==============================================================================
 * In plain words (Layman):
 *   Validates the user's password reset token and allows setting a new secure password.
 *   Once updated, previous sessions are revoked and the user can log in immediately.
 * ==============================================================================
 */

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlToken = searchParams.get("token") || "";
  const [token, setToken] = useState(urlToken);
  const [tokenVerified, setTokenVerified] = useState(false);
  const [verifying, setVerifying] = useState(Boolean(urlToken));
  const [tokenError, setTokenError] = useState(null);
  const [userInfo, setUserInfo] = useState(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [success, setSuccess] = useState(false);

  // If token is in URL, automatically verify it on mount
  useEffect(() => {
    if (!urlToken) return;

    async function checkToken() {
      setVerifying(true);
      setTokenError(null);
      try {
        const res = await apiRequest("/auth/verify-reset-token", {
          method: "POST",
          body: JSON.stringify({ token: urlToken.trim() }),
        });
        if (res.valid) {
          setTokenVerified(true);
          setUserInfo(res);
        }
      } catch (err) {
        setTokenError(err.message || "Invalid or expired password reset link.");
      } finally {
        setVerifying(false);
      }
    }

    checkToken();
  }, [urlToken]);

  const handleManualVerify = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;

    setVerifying(true);
    setTokenError(null);
    try {
      const res = await apiRequest("/auth/verify-reset-token", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.valid) {
        setTokenVerified(true);
        setUserInfo(res);
      }
    } catch (err) {
      setTokenError(err.message || "Invalid or expired reset token.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters in length.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match. Please verify both fields.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: token.trim(),
          password: password,
        }),
      });
      setSuccess(true);
    } catch (err) {
      setSubmitError(err.message || "Failed to reset password. Please request a new link.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-split-layout" style={{
      minHeight: "100vh",
      display: "flex",
      flexWrap: "wrap",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#12171E",
      background: "#F3EFE7"
    }}>

      {/* LEFT: Editorial Brand Panel */}
      <div className="auth-brand-panel" style={{
        flex: "1 1 480px",
        minWidth: "min(100%, 320px)",
        background: "#12171E",
        color: "#E9E4D8",
        boxSizing: "border-box",
        padding: "clamp(24px, 4vw, 40px) clamp(20px, 4vw, 48px)",
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
              CREDENTIAL UPDATE
            </div>
            <h1 style={{
              margin: 0,
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(30px, 3.2vw, 40px)",
              lineHeight: 1.15,
              color: "#F5F1E8"
            }}>
              Set a new password.<br />
              <span style={{ fontStyle: "italic", color: "#D8D2C4" }}>Protected with Argon2 hashing.</span>
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
                <span style={{ color: "#D9822B" }}>&bull;</span> Modern Password Security
              </div>
              <div style={{ fontSize: "13px", color: "#A9B0BA", lineHeight: 1.5 }}>
                Your new password is immediately hashed with Argon2id using salt and high memory cost before storage.
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
                <span style={{ color: "#7FD1A0" }}>&bull;</span> Automatic Session Cleanup
              </div>
              <div style={{ fontSize: "13px", color: "#A9B0BA", lineHeight: 1.5 }}>
                Updating your password automatically revokes any previous login sessions across all connected products.
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
            Sankalp SSO Security: Passwords and raw tokens are never logged or stored in plaintext.
          </p>
        </div>
      </div>

      {/* RIGHT: Form Panel */}
      <div className="auth-form-panel" style={{
        flex: "1 1 440px",
        minWidth: "min(100%, 320px)",
        boxSizing: "border-box",
        padding: "clamp(24px, 4vw, 36px) clamp(20px, 4vw, 48px)",
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
          <Link to="/forgot-password" style={{ color: "#8A4A0F", fontWeight: 500, textDecoration: "none" }}>
            Request new link
          </Link>
        </div>

        <div style={{ width: "100%", maxWidth: "400px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "18px" }}>
          
          {/* Heading */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <h2 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "32px", lineHeight: 1.1 }}>
              Reset Password
            </h2>
            <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "#5A6270" }}>
              {tokenVerified
                ? `Create a new password for ${userInfo?.masked_email || "your account"}.`
                : "Verify your reset token to proceed."}
            </p>
          </div>

          {/* Loading verification */}
          {verifying && (
            <div style={{ padding: "16px", background: "#EDE7DA", borderRadius: "8px", fontSize: "13.5px", color: "#5A6270" }}>
              Verifying security token...
            </div>
          )}

          {/* Token Error */}
          {tokenError && (
            <div style={{
              background: "#F6DDD4",
              border: "1px solid #9B3A22",
              borderRadius: "8px",
              padding: "14px",
              color: "#9B3A22",
              fontSize: "13.5px",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}>
              <div>{tokenError}</div>
              <Link
                to="/forgot-password"
                style={{
                  color: "#9B3A22",
                  fontWeight: 600,
                  textDecoration: "underline",
                  fontSize: "13px"
                }}
              >
                Request a new password reset link &rarr;
              </Link>
            </div>
          )}

          {/* Step 1: Manual token input if token not verified */}
          {!tokenVerified && !verifying && (
            <form onSubmit={handleManualVerify} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor="token-input" style={{ fontSize: "13px", fontWeight: 500 }}>
                  Reset Token
                </label>
                <input
                  id="token-input"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste 32-character token from email"
                  className="input-editorial"
                  style={{ height: "42px", fontSize: "13.5px", padding: "0 14px" }}
                />
              </div>

              <button
                type="submit"
                disabled={verifying || !token.trim()}
                className="btn-dark"
                style={{ width: "100%", height: "44px", fontSize: "14px" }}
              >
                Verify Token &rarr;
              </button>
            </form>
          )}

          {/* Step 2: Set New Password Form */}
          {tokenVerified && !success && (
            <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              
              {/* Account info pill */}
              {userInfo && (
                <div style={{
                  background: "#EBE5D8",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "12.5px",
                  color: "#12171E",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span>Account: <strong>{userInfo.masked_email}</strong></span>
                  <span style={{ color: "#7FD1A0", background: "#16301F", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600 }}>Verified</span>
                </div>
              )}

              {submitError && (
                <div style={{
                  background: "#F6DDD4",
                  border: "1px solid #9B3A22",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: "#9B3A22",
                  fontSize: "13px"
                }}>
                  {submitError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor="new-password" style={{ fontSize: "13px", fontWeight: 500 }}>
                  New Password
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="input-editorial"
                    style={{ height: "42px", fontSize: "13.5px", padding: "0 14px", paddingRight: "50px", width: "100%" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      background: "none",
                      border: "none",
                      padding: "4px 8px",
                      color: "#5A6270",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600
                    }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label htmlFor="confirm-password" style={{ fontSize: "13px", fontWeight: 500 }}>
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="input-editorial"
                  style={{ height: "42px", fontSize: "13.5px", padding: "0 14px" }}
                />
              </div>

              <div style={{ fontSize: "12px", color: "#5A6270", lineHeight: 1.4 }}>
                Password must be at least 8 characters long and match in both fields.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-dark"
                style={{ width: "100%", height: "44px", marginTop: "4px", fontSize: "14px" }}
              >
                {submitting ? "Saving New Password..." : "Update Password \u2192"}
              </button>
            </form>
          )}

          {/* Step 3: Success State */}
          {success && (
            <div style={{
              background: "#F2F8F4",
              border: "1px solid #7FD1A0",
              borderRadius: "10px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              textAlign: "center"
            }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#16301F",
                color: "#7FD1A0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                fontWeight: "bold",
                margin: "0 auto"
              }}>
                ✓
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#16301F", fontWeight: 600 }}>
                  Password Reset Successful
                </h3>
                <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.5", color: "#2D4B35" }}>
                  Your password has been updated securely. Your old password is permanently disabled, all prior login sessions have been terminated, and a security confirmation email has been dispatched to your email address.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/login")}
                className="btn-dark"
                style={{ width: "100%", height: "42px", fontSize: "14px" }}
              >
                Sign In With New Password &rarr;
              </button>
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
