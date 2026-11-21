import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — 48-HOUR ACCESS RENEWAL APPLICATION
 * ==============================================================================
 * In plain words (Layman):
 *   Allows members who were marked as left accidentally or whose activity/term
 *   expired to submit a renewal application within the 48-hour grace window.
 *   If approved by an administrator, access is restored immediately.
 *   If no renewal is approved within 48 hours, records are purged from the database.
 * ==============================================================================
 */

export default function Renew() {
  const [searchParams] = useSearchParams();
  const emailFromUrl = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailFromUrl);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (emailFromUrl) {
      setEmail(emailFromUrl);
    }
  }, [emailFromUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiRequest("/auth/renew", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          reason: reason.trim(),
        }),
      });
      setSuccessMsg(res.message || "Your renewal request has been submitted for administrator review.");
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Failed to submit renewal application. Please check your email and connection.");
    } finally {
      setLoading(false);
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
              48-HOUR RECOVERY SAFEGUARD
            </div>
            <h1 style={{
              margin: 0,
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(30px, 3.2vw, 40px)",
              lineHeight: 1.15,
              color: "#F5F1E8"
            }}>
              Accidental deactivation?<br />
              <span style={{ fontStyle: "italic", color: "#D8D2C4" }}>Apply for access renewal in seconds.</span>
            </h1>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "440px" }}>
            <div style={{
              background: "#1B222C",
              border: "1px solid #2A3340",
              borderRadius: "10px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px"
            }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#F5F1E8", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>⏳ 48-Hour Grace Window</span>
              </div>
              <div style={{ fontSize: "13px", color: "#A8A296", lineHeight: 1.5 }}>
                If you were marked as left by an administrator by mistake, or your activity term expired, you have 48 hours to request reactivation before data is purged.
              </div>
            </div>

            <div style={{
              background: "#1B222C",
              border: "1px solid #2A3340",
              borderRadius: "10px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px"
            }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#F5F1E8", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>🛡️ Complete Database Purge Safeguard</span>
              </div>
              <div style={{ fontSize: "13px", color: "#A8A296", lineHeight: 1.5 }}>
                If no renewal is approved within 48 hours, your credential records and uploaded documents are permanently erased from the database for your privacy.
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{ fontSize: "12px", color: "#78716C" }}>
          Sankalp SSO &bull; Jadavpur University E-Cell &bull; Hack N Pitch
        </div>
      </div>

      {/* RIGHT: Form Panel */}
      <div className="auth-form-panel" style={{
        flex: "1 1 480px",
        minWidth: "320px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px"
      }}>
        <div style={{
          width: "100%",
          maxWidth: "440px",
          background: "#FFFFFF",
          border: "1px solid #E7E5E4",
          borderRadius: "12px",
          padding: "36px 32px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
          display: "flex",
          flexDirection: "column",
          gap: "24px"
        }}>
          <div>
            <h2 style={{
              margin: "0 0 6px 0",
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: "26px",
              fontWeight: 600,
              color: "#1C1917"
            }}>
              Apply for Renewal
            </h2>
            <p style={{ margin: 0, fontSize: "14px", color: "#78716C", lineHeight: 1.5 }}>
              Submit your request to restore access across connected campus club facilities.
            </p>
          </div>

          {/* Red Notice as specified by user */}
          <div style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px"
          }}>
            <div style={{ color: "#DC2626", fontWeight: 700, fontSize: "12px", letterSpacing: "0.5px" }}>
              IMPORTANT NOTICE
            </div>
            <div style={{ color: "#DC2626", fontSize: "13px", lineHeight: 1.45 }}>
              If your access was deactivated intentionally, or you have already submitted your renewal request, please ignore this form.
            </div>
          </div>

          {error && (
            <div style={{
              background: "#FFF1F2",
              border: "1px solid #FDA4AF",
              borderRadius: "8px",
              padding: "12px 16px",
              fontSize: "13px",
              color: "#9F1239"
            }}>
              {error}
            </div>
          )}

          {submitted ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "center", padding: "12px 0" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#DCFCE7",
                color: "#166534",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                margin: "0 auto"
              }}>
                ✓
              </div>
              <div>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#166534", fontWeight: 600 }}>
                  Application Submitted
                </h3>
                <p style={{ margin: 0, fontSize: "14px", color: "#44403C", lineHeight: 1.5 }}>
                  {successMsg}
                </p>
              </div>
              <div style={{
                background: "#F5F5F4",
                borderRadius: "8px",
                padding: "14px",
                fontSize: "13px",
                color: "#57534E",
                lineHeight: 1.5
              }}>
                Our administrative desk has been notified. You will receive an automated email as soon as your renewal is approved or declined.
              </div>
              <Link
                to="/login"
                style={{
                  display: "inline-block",
                  marginTop: "8px",
                  padding: "10px 18px",
                  background: "#0F172A",
                  color: "#FFFFFF",
                  borderRadius: "6px",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: 600
                }}
              >
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#292524", marginBottom: "6px" }}>
                  Institutional Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. rahul@ju.edu"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #D6D3D1",
                    fontSize: "14px",
                    outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#292524", marginBottom: "6px" }}>
                  Reason for Renewal / Reactivation
                </label>
                <textarea
                  required
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why your access should be restored (e.g. Accidental deactivation by club president, project extended, ongoing research lab work)..."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #D6D3D1",
                    fontSize: "14px",
                    fontFamily: "inherit",
                    outline: "none",
                    resize: "vertical"
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "6px",
                  border: "none",
                  background: loading ? "#94A3B8" : "#0F172A",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.15s ease"
                }}
              >
                {loading ? "Submitting Application..." : "Submit Renewal Request"}
              </button>

              <div style={{ textAlign: "center", fontSize: "13px", color: "#78716C" }}>
                Remembered your active credentials?{" "}
                <Link to="/login" style={{ color: "#D9822B", fontWeight: 600, textDecoration: "none" }}>
                  Sign in here
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

    </div>
  );
}
