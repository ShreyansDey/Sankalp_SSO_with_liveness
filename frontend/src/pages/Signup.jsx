import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiRequest } from "../api";
import { UserPlus, Lock, Mail, User, AlertCircle, ArrowRight } from "lucide-react";

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenParam = searchParams.get("token") || "";

  const [inviteToken, setInviteToken] = useState(tokenParam);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="auth-wrapper">
      <div className="card">
        <div className="card-header" style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", padding: "12px", background: "var(--primary-light)", borderRadius: "12px", color: "var(--primary)", marginBottom: "12px" }}>
            <UserPlus size={32} />
          </div>
          <h1 className="card-title">Join Your Organization</h1>
          <p className="card-subtitle">Set up your credentials from your admin invite</p>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSignup}>
          <div className="form-group">
            <label className="form-label">Invite Token</label>
            <input
              type="text"
              className="form-input"
              placeholder="Paste invite token here"
              required
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Rahul Sharma"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password (minimum 8 characters)</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Creating Account..." : "Create Account & Verify"} <ArrowRight size={16} />
          </button>
        </form>

        <div className="quick-fill-bar">
          <button
            type="button"
            className="quick-btn"
            onClick={() => {
              setInviteToken("demo-invite-token-12345");
              setName("New Student");
              setPassword("NewStudentPass123!");
            }}
          >
            📋 Fill Demo Invite Token
          </button>
        </div>

        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Already have an account? <Link to="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>Sign In</Link>
        </div>
      </div>
    </div>
  );
}
