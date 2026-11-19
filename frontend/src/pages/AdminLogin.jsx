import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — DEDICATED ADMINISTRATOR SIGN-IN
 * ==============================================================================
 * In plain words (Layman):
 *   This is the separate, secure login portal for university security admins.
 *   Admins do not need camera liveness verification because they manage the system
 *   and do not participate in student clubs. They authenticate directly into /admin.
 * ==============================================================================
 */

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => import.meta.env.VITE_DEV_ADMIN_EMAIL || "admin@jadavpur.edu");
  const [password, setPassword] = useState(() => import.meta.env.VITE_DEV_ADMIN_PASSWORD || "shaan123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiRequest("/auth/admin-login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (res.status === "ok") {
        navigate("/admin", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Invalid administrator credentials or access restricted.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#12171E",
      color: "#E9E4D8",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "24px"
    }}>
      <div style={{
        maxWidth: "420px",
        width: "100%",
        background: "#1B222C",
        border: "1px solid #2A3340",
        borderRadius: "16px",
        padding: "40px",
        display: "flex",
        flexDirection: "column",
        gap: "28px"
      }}>
        {/* Brand Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="#D9822B" strokeWidth="2"></circle>
              <circle cx="16" cy="16" r="5" fill="#D9822B"></circle>
              <path d="M2 16h6M24 16h6" stroke="#D9822B" strokeWidth="2" strokeLinecap="round"></path>
            </svg>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "20px", fontWeight: 600 }}>
              Real Access
            </span>
          </div>

          <span style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "1.2px",
            color: "#12171E",
            background: "#D9822B",
            borderRadius: "4px",
            padding: "3px 8px"
          }}>
            ADMIN
          </span>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 style={{
            margin: 0,
            fontFamily: "'Newsreader', Georgia, serif",
            fontWeight: 500,
            fontSize: "32px",
            color: "#F5F1E8"
          }}>
            Admin Console Access
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#A9B0BA", lineHeight: "1.5" }}>
            Restricted to university security administrators. No biometric camera check is required.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            background: "#3A1D17",
            border: "1px solid #9B3A22",
            borderRadius: "8px",
            padding: "10px 14px",
            color: "#F2A98F",
            fontSize: "13px"
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "#D8D2C4" }}>Admin Email / Username</label>
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@jadavpur.edu"
              style={{
                height: "44px",
                background: "#12171E",
                border: "1px solid #2A3340",
                borderRadius: "8px",
                padding: "0 14px",
                color: "#F5F1E8",
                fontSize: "14px",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "#D8D2C4" }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              style={{
                height: "44px",
                background: "#12171E",
                border: "1px solid #2A3340",
                borderRadius: "8px",
                padding: "0 14px",
                color: "#F5F1E8",
                fontSize: "14px",
                outline: "none"
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              height: "48px",
              background: "#D9822B",
              color: "#12171E",
              border: 0,
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              marginTop: "8px"
            }}
          >
            {loading ? "Authenticating..." : "Sign In to Admin Console"}
          </button>
        </form>

        <div style={{ textAlign: "center", paddingTop: "8px" }}>
          <Link
            to="/login"
            style={{
              fontSize: "13.5px",
              color: "#A9B0BA",
              textDecoration: "underline",
              textUnderlineOffset: "3px"
            }}
          >
            &larr; Back to Student SSO Sign-in
          </Link>
        </div>
      </div>
    </div>
  );
}
