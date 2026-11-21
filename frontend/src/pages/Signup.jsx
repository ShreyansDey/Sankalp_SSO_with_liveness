import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiRequest } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — INVITE-BASED ACCOUNT CREATION & BIOMETRIC CONSENT
 * ==============================================================================
 * In plain words (Layman):
 *   When a student is invited to join campus clubs, they activate their account here:
 *     Step 1: Enter their invite token, name, and choose a secure password.
 *     Step 2: Review the explicit DPDP Act 2023 Biometric Consent Form.
 *     Step 3: Once consent is granted, proceed directly to the camera check.
 *
 * Technical Specification:
 *   - Verifies the one-time invite token against the invites table
 *   - Compliant with India's Digital Personal Data Protection (DPDP) Act, 2023
 *   - Immutably records consent grant in PostgreSQL audit log
 *   - Directly transitions to /liveness with preserved user identity
 *   - Zero third-party icons or emojis
 * ==============================================================================
 */

const COUNTRIES = [
  { code: "IN", name: "India", dialCode: "+91", digits: 10, placeholder: "98765 43210" },
  { code: "US", name: "United States", dialCode: "+1", digits: 10, placeholder: "202 555 0123" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", digits: 10, placeholder: "7911 123456" },
  { code: "CA", name: "Canada", dialCode: "+1", digits: 10, placeholder: "416 555 0199" },
  { code: "AU", name: "Australia", dialCode: "+61", digits: 9, placeholder: "412 345 678" },
  { code: "DE", name: "Germany", dialCode: "+49", digits: 10, placeholder: "151 2345678" },
  { code: "FR", name: "France", dialCode: "+33", digits: 9, placeholder: "612 345 678" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", digits: 9, placeholder: "50 123 4567" },
  { code: "SG", name: "Singapore", dialCode: "+65", digits: 8, placeholder: "8123 4567" },
  { code: "JP", name: "Japan", dialCode: "+81", digits: 10, placeholder: "90 1234 5678" },
  { code: "BD", name: "Bangladesh", dialCode: "+880", digits: 10, placeholder: "1712 345678" },
  { code: "NP", name: "Nepal", dialCode: "+977", digits: 10, placeholder: "984 1234567" },
  { code: "LK", name: "Sri Lanka", dialCode: "+94", digits: 9, placeholder: "71 234 5678" },
  { code: "PK", name: "Pakistan", dialCode: "+92", digits: 10, placeholder: "301 2345678" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", digits: 9, placeholder: "50 123 4567" },
  { code: "MY", name: "Malaysia", dialCode: "+60", digits: 10, placeholder: "12 345 6789" },
  { code: "NZ", name: "New Zealand", dialCode: "+64", digits: 9, placeholder: "21 123 4567" },
  { code: "ZA", name: "South Africa", dialCode: "+27", digits: 9, placeholder: "82 123 4567" },
  { code: "BR", name: "Brazil", dialCode: "+55", digits: 11, placeholder: "11 91234 5678" },
  { code: "NG", name: "Nigeria", dialCode: "+234", digits: 10, placeholder: "802 123 4567" },
  { code: "ID", name: "Indonesia", dialCode: "+62", digits: 10, placeholder: "812 3456 7890" },
  { code: "RU", name: "Russia", dialCode: "+7", digits: 10, placeholder: "912 345 6789" },
  { code: "IT", name: "Italy", dialCode: "+39", digits: 10, placeholder: "312 345 6789" },
  { code: "ES", name: "Spain", dialCode: "+34", digits: 9, placeholder: "612 345 678" }
];

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenParam = searchParams.get("token") || "";

  // Wizard state: 'details' -> 'consent'
  const [step, setStep] = useState("details");

  // Registration mode: 'direct' (self-service signup) or 'invite' (admin invite token)
  const [mode, setMode] = useState(tokenParam ? "invite" : "direct");

  // Form Fields
  const [email, setEmail] = useState("");
  const [inviteToken, setInviteToken] = useState(tokenParam);
  const [name, setName] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState("IN");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const selectedCountry = COUNTRIES.find((c) => c.code === selectedCountryCode) || COUNTRIES[0];

  const handleCountryChange = (e) => {
    const newCode = e.target.value;
    setSelectedCountryCode(newCode);
    const country = COUNTRIES.find((c) => c.code === newCode) || COUNTRIES[0];
    if (phoneNumber.length > country.digits) {
      setPhoneNumber(phoneNumber.slice(0, country.digits));
    }
  };

  const handlePhoneChange = (e) => {
    // Strictly numeric digits: strip out text and letters
    const digitsOnly = e.target.value.replace(/\D/g, "");
    if (digitsOnly.length <= selectedCountry.digits) {
      setPhoneNumber(digitsOnly);
    }
  };

  // Consent State
  const [consentChecked, setConsentChecked] = useState(false);
  const [declineNotice, setDeclineNotice] = useState(false);

  // Submission State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Validate credentials and advance to consent screen
  const handleProceedToConsent = (e) => {
    e.preventDefault();
    setError(null);

    if (mode === "invite") {
      if (!inviteToken.trim()) {
        setError("Please provide your invite token.");
        return;
      }
    } else {
      if (!email.trim() || !email.includes("@")) {
        setError("Please provide a valid college or personal email address.");
        return;
      }
    }

    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (/\d/.test(name)) {
      setError("Full Name cannot contain numbers. Please enter letters only.");
      return;
    }
    if (!phoneNumber.trim()) {
      setError(`Phone Number is compulsory. Please enter your ${selectedCountry.digits}-digit phone number.`);
      return;
    }
    if (!/^\d+$/.test(phoneNumber)) {
      setError("Phone Number can only contain numeric digits.");
      return;
    }
    if (phoneNumber.length !== selectedCountry.digits) {
      setError(`Phone number for ${selectedCountry.name} must be exactly ${selectedCountry.digits} digits (you entered ${phoneNumber.length} digits).`);
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setStep("consent");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Final submission once consent is accepted
  const handleConfirmSignup = async () => {
    if (!consentChecked) {
      setError("You must review and check the consent box to proceed.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const payload = {
        name: name.trim(),
        phone: `${selectedCountry.dialCode} ${phoneNumber.trim()}`,
        password: password,
        consent_given: true
      };

      if (mode === "invite") {
        payload.invite_token = inviteToken.trim();
      } else {
        payload.email = email.trim().toLowerCase();
      }

      const res = await apiRequest("/auth/signup", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.status === "ok" && res.next === "liveness") {
        navigate(`/liveness?user_id=${encodeURIComponent(res.user_id)}&email=${encodeURIComponent(res.email)}`, {
          replace: true
        });
      } else {
        navigate("/login", { replace: true });
      }
    } catch (err) {
      console.error("Signup error:", err);
      const detail = err?.detail;
      const errCode = typeof detail === "object" && detail !== null ? detail.error : err?.error;
      const errMsg = typeof detail === "object" && detail !== null 
        ? detail.message 
        : (typeof detail === "string" ? detail : (err?.message || "Registration failed. Please ensure the backend server is running on port 8001."));

      if (errCode === "invite_used") {
        setError("This invite token has already been used. Please log in.");
      } else if (errCode === "invite_expired") {
        setError("This invite token has expired. Please contact your organization administrator.");
      } else if (errCode === "user_exists") {
        setError("An account with this email already exists. Please log in or use another email.");
      } else if (errCode === "invalid_invite") {
        setError("The invite token entered is invalid. Please check your invite email.");
      } else {
        setError(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F3EFE7",
      color: "#12171E",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      
      {/* Top Header Banner */}
      <header className="auth-header">
        <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="#D9822B" strokeWidth="2"></circle>
              <circle cx="16" cy="16" r="5" fill="#D9822B"></circle>
              <path d="M2 16h6M24 16h6" stroke="#D9822B" strokeWidth="2" strokeLinecap="round"></path>
            </svg>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "21px", fontWeight: "600" }}>
              Real Access
            </span>
            <span style={{ fontSize: "11px", background: "#EAE4D6", color: "#4A5260", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
              ACTIVATION
            </span>
          </div>
          <div style={{ fontSize: "13px" }}>
            Already have an active account?&nbsp;
            <Link to="/login" style={{ color: "#12171E", fontWeight: 600 }}>
              Sign in &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 14px" }}>
        <div className="auth-card" style={{
          maxWidth: step === "consent" ? "680px" : "500px",
        }}>

          {/* Stepper Indicator */}
          <ol className="stepper-list">
            <li className="stepper-item" style={{ color: step === "details" ? "#12171E" : "#1F6B3F" }}>
              <span style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: step === "details" ? "#12171E" : "#1F6B3F",
                color: "#F3EFE7",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 600,
                flexShrink: 0
              }}>
                1
              </span>
              <span className="stepper-label-full">Account Details</span>
              <span className="stepper-label-short">Details</span>
            </li>
            <li aria-hidden="true" className="stepper-line"></li>
            <li className="stepper-item" style={{ color: step === "consent" ? "#12171E" : "#7A8290" }}>
              <span style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: step === "consent" ? "#12171E" : "transparent",
                border: step === "consent" ? "none" : "1px solid #B9B2A3",
                color: step === "consent" ? "#F3EFE7" : "#7A8290",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 600,
                flexShrink: 0
              }}>
                2
              </span>
              <span className="stepper-label-full">Biometric Consent</span>
              <span className="stepper-label-short">Consent</span>
            </li>
            <li aria-hidden="true" className="stepper-line"></li>
            <li className="stepper-item" style={{ color: "#7A8290" }}>
              <span style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                border: "1px solid #B9B2A3",
                color: "#7A8290",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 600,
                flexShrink: 0
              }}>
                3
              </span>
              <span className="stepper-label-full">Camera Check</span>
              <span className="stepper-label-short">Camera</span>
            </li>
          </ol>

          {/* Error Banner */}
          {error && (
            <div style={{
              background: "#F6DDD4",
              border: "1px solid #9B3A22",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#9B3A22",
              fontSize: "13.5px",
              marginBottom: "20px"
            }}>
              {error}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 1: CREDENTIALS & INVITE TOKEN FORM                        */}
          {/* ============================================================== */}
          {step === "details" && (
            <div>
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: "1.8px", color: "#8A4A0F", marginBottom: "4px" }}>
                  MEMBER ACTIVATION
                </div>
                <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "32px", fontWeight: "500", margin: "0 0 6px" }}>
                  Create Your Account
                </h1>
                <p style={{ color: "#5A6270", fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
                  Register directly with your email address, or enter an invitation token provided by your department administrator.
                </p>
              </div>

              {/* Mode Toggle: Direct vs Invite Token */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                background: "#EBE5D8",
                padding: "3px",
                borderRadius: "8px",
                marginBottom: "18px"
              }}>
                <button
                  type="button"
                  onClick={() => { setMode("direct"); setError(null); }}
                  style={{
                    background: mode === "direct" ? "#FBF9F4" : "transparent",
                    color: mode === "direct" ? "#12171E" : "#5A6270",
                    border: 0,
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: mode === "direct" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  Direct Registration
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("invite"); setError(null); }}
                  style={{
                    background: mode === "invite" ? "#FBF9F4" : "transparent",
                    color: mode === "invite" ? "#12171E" : "#5A6270",
                    border: 0,
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: mode === "invite" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  Have an Invite Token
                </button>
              </div>

              <form onSubmit={handleProceedToConsent} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                
                {/* Direct Registration Email Input */}
                {mode === "direct" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="email" style={{ fontSize: "13px", fontWeight: "600" }}>College or Personal Email</label>
                    <input
                      id="email"
                      type="email"
                      placeholder="e.g. ananya@college.edu"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-editorial"
                      style={{ height: "42px", fontSize: "14px" }}
                    />
                  </div>
                )}

                {/* Invite Token */}
                {mode === "invite" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label htmlFor="token" style={{ fontSize: "13px", fontWeight: "600" }}>Invite Token</label>
                      {import.meta.env.DEV && (
                        <button
                          type="button"
                          onClick={() => setInviteToken("demo-invite-token-12345")}
                          style={{
                            background: "none",
                            border: "none",
                            fontSize: "11.5px",
                            color: "#8A4A0F",
                            cursor: "pointer",
                            textDecoration: "underline"
                          }}
                        >
                          Paste Demo Token
                        </button>
                      )}
                    </div>
                    <input
                      id="token"
                      type="text"
                      placeholder="e.g. demo-invite-token-12345"
                      required
                      value={inviteToken}
                      onChange={(e) => setInviteToken(e.target.value)}
                      className="input-editorial"
                      style={{ height: "42px", fontSize: "14px" }}
                    />
                  </div>
                )}

                {/* Full Name */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="name" style={{ fontSize: "13px", fontWeight: "600" }}>
                    Full Name <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="e.g. Ananya Sen"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z\s'.\-]/g, ""))}
                    className="input-editorial"
                    style={{ height: "42px", fontSize: "14px" }}
                  />
                  <div style={{ fontSize: "11px", color: "#5A6270" }}>Letters only (no numbers allowed)</div>
                </div>

                {/* Phone Number with Country Code Dropdown */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="signup-phone" style={{ fontSize: "13px", fontWeight: "600" }}>
                    Phone Number <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <div style={{
                    display: "flex",
                    alignItems: "stretch",
                    width: "100%",
                    borderRadius: "7px",
                    border: "1px solid #C4BCAF",
                    background: "#FDFBF7",
                    overflow: "hidden",
                    boxSizing: "border-box"
                  }}>
                    {/* Country Selector Dropdown with Down Arrow */}
                    <div style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      background: "#EBE5D8",
                      borderRight: "1px solid #C4BCAF",
                      flexShrink: 0
                    }}>
                      <select
                        value={selectedCountryCode}
                        onChange={handleCountryChange}
                        aria-label="Select country dial code"
                        style={{
                          appearance: "none",
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                          border: "none",
                          background: "transparent",
                          padding: "0 22px 0 10px",
                          height: "42px",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          color: "#12171E",
                          cursor: "pointer",
                          outline: "none"
                        }}
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.dialCode} ({c.name})
                          </option>
                        ))}
                      </select>
                      {/* Visual down arrow indicator */}
                      <span style={{
                        position: "absolute",
                        right: "6px",
                        pointerEvents: "none",
                        fontSize: "9px",
                        color: "#5A6270"
                      }}>
                        &#9660;
                      </span>
                    </div>

                    {/* Digits-only telephone input with exact country length */}
                    <input
                      id="signup-phone"
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      placeholder={selectedCountry.placeholder}
                      value={phoneNumber}
                      onChange={handlePhoneChange}
                      maxLength={selectedCountry.digits}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: "42px",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        padding: "0 12px",
                        fontSize: "14px",
                        color: "#12171E"
                      }}
                    />
                  </div>
                  {/* Character/digit counter & helper */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: phoneNumber.length === selectedCountry.digits ? "#15803D" : "#5A6270"
                  }}>
                    <span>Numbers only ({selectedCountry.name})</span>
                    <span style={{ fontWeight: 600 }}>{phoneNumber.length} / {selectedCountry.digits} digits</span>
                  </div>
                </div>

                {/* Password */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="pwd" style={{ fontSize: "13px", fontWeight: "600" }}>Password (min. 8 characters)</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      id="pwd"
                      type={showPassword ? "text" : "password"}
                      placeholder="Choose a strong password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-editorial"
                      style={{ height: "42px", fontSize: "14px", paddingRight: "48px" }}
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
                        fontSize: "11.5px",
                        fontWeight: 600
                      }}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="confirmpwd" style={{ fontSize: "13px", fontWeight: "600" }}>Confirm Password</label>
                  <input
                    id="confirmpwd"
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter your password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-editorial"
                    style={{ height: "42px", fontSize: "14px" }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-dark"
                  style={{ height: "46px", width: "100%", marginTop: "8px", fontSize: "14.5px" }}
                >
                  Continue to Biometric Consent &rarr;
                </button>
              </form>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 2: DIGITAL IDENTITY & BIOMETRIC CONSENT FORM              */}
          {/* ============================================================== */}
          {step === "consent" && (
            <div>
              <div style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "1.6px", color: "#1F6B3F", background: "#DDEFE2", padding: "3px 8px", borderRadius: "4px" }}>
                    DPDP ACT 2023 COMPLIANT
                  </span>
                  <span style={{ fontSize: "12px", color: "#5A6270" }}>Privacy &amp; Data Charter</span>
                </div>
                <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "30px", fontWeight: "500", margin: "0 0 6px" }}>
                  Digital Identity &amp; Biometric Consent
                </h1>
                <p style={{ color: "#5A6270", fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
                  Before proceeding to the camera verification, please review how your identity verification data is handled, stored, and permanently destroyed.
                </p>
              </div>

              {/* Applicant Summary */}
              <div className="summary-box">
                <div className="summary-box-left">
                  <span style={{ color: "#5A6270" }}>Applicant: </span>
                  <strong style={{ color: "#12171E" }}>{name}</strong>
                  {phoneNumber && (
                    <span style={{ color: "#5A6270", fontSize: "12px", marginLeft: "6px" }}>
                      &bull; {selectedCountry.dialCode} {phoneNumber}
                    </span>
                  )}
                </div>
                <div className="summary-box-right">
                  {mode === "direct" ? (
                    <span>Email: <strong style={{ color: "#12171E" }}>{email}</strong></span>
                  ) : (
                    <span>Token: <code style={{ background: "#E2DDD0", padding: "1px 4px", borderRadius: "3px" }}>{inviteToken}</code></span>
                  )}
                </div>
              </div>

              {/* The 4 Core Consent Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "22px" }}>
                
                {/* 1. What we collect */}
                <div style={{ background: "#F3EFE7", border: "1px solid #DDD6C7", borderRadius: "10px", padding: "14px 18px" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: "600", color: "#12171E", marginBottom: "4px" }}>
                    1. What data do we collect?
                  </div>
                  <div style={{ fontSize: "13px", color: "#4A5260", lineHeight: "1.5" }}>
                    Temporary in-browser video feed to compute 3D head yaw and eyelid blink ratio. <strong>Zero photos, videos, or raw facial templates are ever recorded or stored.</strong> The backend receives only a cryptographic <code style={{ background: "#EAE4D6", padding: "1px 4px", borderRadius: "3px" }}>pass/fail</code> status and verification timestamp.
                  </div>
                </div>

                {/* 2. Why we collect it */}
                <div style={{ background: "#F3EFE7", border: "1px solid #DDD6C7", borderRadius: "10px", padding: "14px 18px" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: "600", color: "#12171E", marginBottom: "4px" }}>
                    2. Why do we collect it?
                  </div>
                  <div style={{ fontSize: "13px", color: "#4A5260", lineHeight: "1.5" }}>
                    To eliminate identity fraud, bot accounts, and still-photo spoofing. This proves that a real, living student is physically present before issuing university Single Sign-On credentials.
                  </div>
                </div>

                {/* 3. Where will it be used */}
                <div style={{ background: "#F3EFE7", border: "1px solid #DDD6C7", borderRadius: "10px", padding: "14px 18px" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: "600", color: "#12171E", marginBottom: "4px" }}>
                    3. Where will it be used?
                  </div>
                  <div style={{ fontSize: "13px", color: "#4A5260", lineHeight: "1.5" }}>
                    Strictly restricted to Single Sign-On (SSO) authentication across authorized university club portals (Robotics Lab, Coding Club, Photography, Athletics, Chess). <strong>Never shared with third parties, never sold, and never used for tracking.</strong>
                  </div>
                </div>

                {/* 4. What happens when you leave */}
                <div style={{ background: "#F3EFE7", border: "1px solid #DDD6C7", borderRadius: "10px", padding: "14px 18px" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: "600", color: "#12171E", marginBottom: "4px" }}>
                    4. What happens when you leave? (Right to Erasure)
                  </div>
                  <div style={{ fontSize: "13px", color: "#4A5260", lineHeight: "1.5" }}>
                    Access ends automatically upon graduation, term expiration, or departure. All active sessions and tokens are immediately revoked, and account records are permanently purged following the 30-day cleanup cycle.
                  </div>
                </div>

              </div>

              {/* Consent Checkbox */}
              <div style={{
                background: consentChecked ? "#EBF5EE" : "#F8F5EE",
                border: consentChecked ? "1px solid #1F6B3F" : "1px solid #C4BCAF",
                borderRadius: "10px",
                padding: "14px 16px",
                marginBottom: "20px",
                transition: "all 0.15s ease"
              }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => {
                      setConsentChecked(e.target.checked);
                      if (e.target.checked) setDeclineNotice(false);
                    }}
                    style={{ width: "18px", height: "18px", marginTop: "2px", cursor: "pointer", accentColor: "#12171E" }}
                  />
                  <span style={{ fontSize: "13px", lineHeight: "1.45", color: "#12171E", fontWeight: 500 }}>
                    I understand and give my explicit consent for in-browser biometric liveness verification to establish my university digital identity under the Digital Personal Data Protection (DPDP) Act, 2023.
                  </span>
                </label>
              </div>

              {/* Decline Notice */}
              {declineNotice && (
                <div style={{
                  background: "#FBF3D5",
                  border: "1px solid #D9822B",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "13px",
                  color: "#8A4A0F",
                  marginBottom: "16px",
                  lineHeight: "1.45"
                }}>
                  Camera verification is required for automated self-service account activation. If you cannot complete camera verification due to hardware or accessibility constraints, please contact your university department administrator for manual provisioning.
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  type="button"
                  disabled={!consentChecked || loading}
                  onClick={handleConfirmSignup}
                  className="btn-dark"
                  style={{
                    height: "46px",
                    width: "100%",
                    fontSize: "14.5px",
                    opacity: (!consentChecked || loading) ? 0.5 : 1,
                    cursor: (!consentChecked || loading) ? "not-allowed" : "pointer"
                  }}
                >
                  {loading ? "Registering Consent & Account..." : "I Consent & Proceed to Camera Check \u2192"}
                </button>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <button
                    type="button"
                    onClick={() => { setStep("details"); setError(null); }}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: "13px",
                      color: "#4A5260",
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: "4px 0"
                    }}
                  >
                    &larr; Back to edit details
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeclineNotice(true)}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: "13px",
                      color: "#8A4A0F",
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: "4px 0"
                    }}
                  >
                    Decline / Alternatives
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #DDD6C7", padding: "16px 40px", background: "#FBF9F4", fontSize: "12px", color: "#5A6270", textAlign: "center" }}>
        Sankalp SSO &bull; Compliant with Digital Personal Data Protection Act, 2023 &bull; Privacy by Design
      </footer>

    </div>
  );
}
