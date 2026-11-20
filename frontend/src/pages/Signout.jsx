import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — SIGNED OUT CONFIRMATION
 * ==============================================================================
 * In plain words (Layman):
 *   When a student or admin logs out, this screen confirms that their single sign-on
 *   session has ended safely across the device. It displays only the specific clubs
 *   that this user was enrolled in, proving that access closed with them.
 *
 * Technical Specification:
 *   - Matches the official '6. Signed out' design component (Signout.dc.html)
 *   - Displays dynamic list of clubs closed for the authenticated user
 *   - Route: /signed-out
 * ==============================================================================
 */

export default function Signout() {
  const location = useLocation();
  const userName = location.state?.name || "Member";
  const userRole = location.state?.role || "member";
  const userClubs = location.state?.clubs || [];

  // Defeat Back button: prevent browser from navigating back into authenticated screens
  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handlePopState = (e) => {
      e.preventDefault();
      window.location.replace("/login");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <div className="auth-split-layout" style={{
      minHeight: "100vh",
      display: "flex",
      flexWrap: "wrap",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#12171E",
      background: "#F3EFE7"
    }}>
      {/* LEFT: Brand Panel */}
      <div className="auth-brand-panel" style={{
        flex: "1 1 440px",
        minWidth: "min(100%, 320px)",
        background: "#12171E",
        color: "#E9E4D8",
        boxSizing: "border-box",
        padding: "clamp(24px, 4vw, 48px) clamp(20px, 4vw, 64px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "32px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="14" stroke="#D9822B" strokeWidth="2"></circle>
            <circle cx="16" cy="16" r="5" fill="#D9822B"></circle>
            <path d="M2 16h6M24 16h6" stroke="#D9822B" strokeWidth="2" strokeLinecap="round"></path>
          </svg>
          <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "24px", fontWeight: 600 }}>
            Real Access
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "2.4px", color: "#D9822B" }}>
            SESSION ENDED
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: "'Newsreader', Georgia, serif",
            fontWeight: 500,
            fontSize: "clamp(44px, 5vw, 64px)",
            lineHeight: 1.05,
            color: "#F5F1E8"
          }}>
            See you<br />
            <span style={{ fontStyle: "italic", color: "#D8D2C4" }}>soon.</span>
          </h1>
        </div>

        <p style={{ margin: 0, maxWidth: "360px", fontSize: "14px", lineHeight: "1.55", color: "#A9B0BA" }}>
          Signing out closes your session everywhere on this device. Your account and your clubs stay exactly as they were.
        </p>
      </div>

      {/* RIGHT: Confirmation Details */}
      <div className="auth-form-panel" style={{
        flex: "1 1 520px",
        minWidth: "min(100%, 320px)",
        boxSizing: "border-box",
        padding: "clamp(24px, 4vw, 40px) clamp(20px, 4vw, 48px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div style={{ width: "100%", maxWidth: "460px", display: "flex", flexDirection: "column", gap: "32px" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#DDEFE2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <svg width="28" height="28" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2.5 7.5l3 3 6-6.5" stroke="#1F6B3F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path>
              </svg>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h2 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "38px", lineHeight: 1.1 }}>
                You have been signed out
              </h2>
              <p style={{ margin: 0, fontSize: "16px", lineHeight: 1.5, color: "#5A6270" }}>
                {userRole === "admin"
                  ? `Thanks, ${userName}. Administrator session and oversight privileges were closed on this device.`
                  : userClubs.length > 0
                    ? `Thanks, ${userName}. We closed these on this device:`
                    : `Thanks, ${userName}. Your active session was closed on this device.`}
              </p>
            </div>
          </div>

          {/* User's Enrolled Clubs (shown only for clubs the user was actually in) */}
          {userClubs.length > 0 && (
            <ul style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              background: "#FBF9F4",
              border: "1px solid #DDD6C7",
              borderRadius: "12px",
              overflow: "hidden"
            }}>
              {userClubs.map((clubName, index) => (
                <li
                  key={clubName}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 20px",
                    borderTop: index > 0 ? "1px solid #E6E0D2" : "none",
                    fontSize: "15px"
                  }}
                >
                  <span style={{ fontWeight: 500, color: "#12171E" }}>{clubName}</span>
                  <span style={{ fontSize: "13px", color: "#5A6270" }}>Closed</span>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px", lineHeight: "1.55", color: "#5A6270" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
                <circle cx="10" cy="10" r="7.5" stroke="#5A6270" strokeWidth="1.5"></circle>
                <path d="M10 9v5M10 6.2v.1" stroke="#5A6270" strokeWidth="1.6" strokeLinecap="round"></path>
              </svg>
              <span>Your account is still active. Signing out never deletes it.</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
                <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" stroke="#5A6270" strokeWidth="1.5" strokeLinejoin="round"></path>
                <circle cx="10" cy="10" r="2.5" stroke="#5A6270" strokeWidth="1.5"></circle>
              </svg>
              <span>Next time you sign in, you will do the camera check again.</span>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
            <Link
              to="/login"
              style={{
                height: "50px",
                padding: "0 32px",
                display: "inline-flex",
                alignItems: "center",
                fontSize: "15px",
                fontWeight: 600,
                color: "#F5F1E8",
                background: "#12171E",
                borderRadius: "8px",
                textDecoration: "none"
              }}
            >
              Sign in again
            </Link>
            <button
              type="button"
              onClick={() => window.close()}
              style={{
                background: "none",
                border: "none",
                fontSize: "15px",
                color: "#12171E",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "3px"
              }}
            >
              Close this window
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
