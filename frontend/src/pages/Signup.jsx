import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiRequest } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — INSTITUTIONAL e-KYC ONBOARDING & SIGNUP
 * ==============================================================================
 * In plain words (Layman):
 *   When a student is invited to join a university club or research lab, they:
 *     1. Enter their invite token, name, and choose a secure password.
 *     2. Take a live webcam photo to register their facial biometric template.
 *     3. Upload a supporting document (Student ID Card, College Admission Letter).
 *   Their account is placed in 'pending_approval' until an administrator verifies
 *   the ID document against their face photo and confirms their membership.
 * ==============================================================================
 */

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenParam = searchParams.get("token") || "";

  // Form Fields
  const [inviteToken, setInviteToken] = useState(tokenParam);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // e-KYC Media States
  const [facePhoto, setFacePhoto] = useState(null); // base64 JPEG
  const [documentFile, setDocumentFile] = useState(null); // File object
  const [documentBase64, setDocumentBase64] = useState(null);
  const [documentPreview, setDocumentPreview] = useState(null);

  // Camera preview states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Submission & App State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submittedApp, setSubmittedApp] = useState(null); // When submitted successfully

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Start webcam for photo capture
  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn("Camera access error:", err);
      setCameraError("Camera permission denied or camera disconnected.");
      setCameraActive(false);
    }
  };

  // Capture live snapshot from webcam
  const snapPhoto = () => {
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setFacePhoto(dataUrl);

      // Stop camera stream after snap
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
    } catch (err) {
      setError("Failed to capture snapshot from camera.");
    }
  };

  const retakePhoto = () => {
    setFacePhoto(null);
    startCamera();
  };

  // Handle Document Upload
  const handleDocumentChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("Document file must be smaller than 10MB.");
      return;
    }

    setDocumentFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setDocumentBase64(reader.result);
      if (file.type.startsWith("image/")) {
        setDocumentPreview(reader.result);
      } else {
        setDocumentPreview(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit Application
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!facePhoto) {
      setError("Please capture your face photo to complete identity registration.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        invite_token: inviteToken.trim(),
        name: name.trim(),
        password,
        face_photo: facePhoto,
        document_base64: documentBase64,
        document_name: documentFile ? documentFile.name : null
      };

      const res = await apiRequest("/auth/apply", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.status === "ok") {
        setSubmittedApp({
          name: name.trim(),
          email: res.email,
          userId: res.user_id,
          message: res.message
        });
      }
    } catch (err) {
      if (err.error === "invite_used") {
        setError("This invite token has already been used. Please log in.");
      } else if (err.error === "invite_expired") {
        setError("This invite token has expired. Please contact your department administrator.");
      } else if (err.error === "user_exists") {
        setError("An account with this email already exists. Please log in.");
      } else if (err.error === "face_not_detected") {
        setError("Could not detect a clear, centered face in the photo. Please retake under good lighting.");
      } else {
        setError(err.message || "Registration failed. Please check your invite details.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F3EFE7", color: "#12171E", display: "flex", flexDirection: "column" }}>
      
      {/* Top Header Banner */}
      <header style={{ borderBottom: "1px solid #DDD6C7", padding: "18px 48px", background: "#FBF9F4" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2.5px solid #12171E", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#D9822B" }}></div>
            </div>
            <span style={{ fontFamily: "Newsreader, Georgia, serif", fontSize: "20px", fontWeight: "600" }}>
              Sankalp SSO &middot; Institutional e-KYC
            </span>
          </div>
          <div style={{ fontSize: "14px" }}>
            <Link to="/login" style={{ color: "#12171E", textDecoration: "underline", textUnderlineOffset: "3px" }}>
              Back to sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        
        {/* VIEW A: Confirmation Screen when Application Submitted */}
        {submittedApp ? (
          <div style={{
            background: "#FBF9F4",
            border: "1px solid #DDD6C7",
            borderRadius: "16px",
            padding: "44px",
            maxWidth: "520px",
            width: "100%",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            textAlign: "center"
          }}>
            <div style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: "#FDF1DC",
              border: "2px solid #D9822B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto"
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8A4A0F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>

            <div>
              <div style={{ display: "inline-block", background: "#F5ECD7", color: "#8A4A0F", padding: "4px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "700", letterSpacing: "1px", marginBottom: "12px" }}>
                UNDER ADMINISTRATIVE REVIEW
              </div>
              <h1 style={{ fontFamily: "Newsreader, Georgia, serif", fontSize: "30px", fontWeight: "500", margin: "0 0 8px", color: "#12171E" }}>
                Application Submitted!
              </h1>
              <p style={{ color: "#5A6270", fontSize: "14.5px", lineHeight: "1.6", margin: 0 }}>
                Thank you, <strong>{submittedApp.name}</strong>. Your college credentials, live portrait, and supporting document have been recorded.
              </p>
            </div>

            <div style={{ background: "#F3EFE7", borderRadius: "10px", padding: "16px", textAlign: "left", fontSize: "13.5px", color: "#4A5260", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#7A8290" }}>Account Email:</span>
                <span style={{ fontWeight: 600, color: "#12171E" }}>{submittedApp.email}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#7A8290" }}>Current Status:</span>
                <span style={{ fontWeight: 600, color: "#8A4A0F" }}>Pending Admin Approval</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#7A8290" }}>Next Step:</span>
                <span>Department admin verifies Student ID</span>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: "13px", color: "#7A8290", lineHeight: "1.5" }}>
              Once your application is confirmed by the system administrator, you can log in directly using your email and pass the camera check.
            </p>

            <Link
              to="/login"
              style={{
                display: "block",
                padding: "12px 24px",
                background: "#12171E",
                color: "#F5F1E8",
                textDecoration: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "14px"
              }}
            >
              Return to Sign In
            </Link>
          </div>
        ) : (

          /* VIEW B: Multi-Step e-KYC Enrollment Form */
          <div style={{
            background: "#FBF9F4",
            border: "1px solid #DDD6C7",
            borderRadius: "16px",
            padding: "40px",
            maxWidth: "520px",
            width: "100%",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.04)"
          }}>
            
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", letterSpacing: "1.5px", color: "#8A4A0F", marginBottom: "4px" }}>
                MEMBER ONBOARDING
              </div>
              <h1 style={{ fontFamily: "Newsreader, Georgia, serif", fontSize: "30px", fontWeight: "500", margin: "0 0 8px" }}>
                Member Registration & e-KYC
              </h1>
              <p style={{ color: "#5A6270", fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
                Complete your details, capture your live portrait, and attach your student proof.
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
                marginBottom: "20px"
              }}>
                <div>{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              
              {/* SECTION 1: Credentials */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                    Invite Token
                  </label>
                  <input
                    type="text"
                    placeholder="Paste your 32-character invite token"
                    required
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    style={{
                      width: "100%",
                      height: "44px",
                      padding: "0 14px",
                      background: "#FFFFFF",
                      border: "1px solid #C4BCAF",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      color: "#12171E"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                    Full Name
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
                      background: "#FFFFFF",
                      border: "1px solid #C4BCAF",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      color: "#12171E"
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                    Choose Password (min. 8 characters)
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
                        padding: "0 40px 0 14px",
                        background: "#FFFFFF",
                        border: "1px solid #C4BCAF",
                        borderRadius: "8px",
                        fontSize: "14px",
                        boxSizing: "border-box",
                        color: "#12171E"
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#5A6270",
                        padding: "4px"
                      }}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Live Face Photo Capture */}
              <div style={{ borderTop: "1px solid #DDD6C7", paddingTop: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                  1. Live Face Portrait (Mandatory Biometric Registration)
                </label>
                <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "#5A6270" }}>
                  Take a clear portrait looking directly at the camera. Used by admin to verify your student ID.
                </p>

                {facePhoto ? (
                  /* Captured Photo Preview */
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "#FFFFFF", border: "1px solid #C4BCAF", borderRadius: "10px", padding: "12px" }}>
                    <img
                      src={facePhoto}
                      alt="Captured Face"
                      style={{ width: "90px", height: "90px", objectFit: "cover", borderRadius: "8px", border: "1px solid #DDD6C7" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1F6B3F" }}>✓ Portrait Captured</div>
                      <div style={{ fontSize: "12px", color: "#7A8290", marginTop: "2px" }}>Face features mapped for login verification</div>
                      <button
                        type="button"
                        onClick={retakePhoto}
                        style={{
                          marginTop: "8px",
                          padding: "4px 10px",
                          background: "#F3EFE7",
                          border: "1px solid #C4BCAF",
                          borderRadius: "6px",
                          fontSize: "12px",
                          cursor: "pointer",
                          color: "#12171E"
                        }}
                      >
                        Retake Photo
                      </button>
                    </div>
                  </div>
                ) : cameraActive ? (
                  /* Live Camera Viewfinder */
                  <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", background: "#12171E", borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                    />
                    <div style={{ position: "absolute", width: "45%", aspectRatio: "3/4", borderRadius: "50%", border: "2px dashed #D9822B", pointerEvents: "none" }}></div>
                    <button
                      type="button"
                      onClick={snapPhoto}
                      style={{
                        position: "absolute",
                        bottom: "16px",
                        padding: "8px 20px",
                        background: "#D9822B",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "999px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
                      }}
                    >
                      Capture Snapshot
                    </button>
                  </div>
                ) : (
                  /* Start Camera Button */
                  <button
                    type="button"
                    onClick={startCamera}
                    style={{
                      width: "100%",
                      padding: "16px",
                      background: "#FFFFFF",
                      border: "2px dashed #C4BCAF",
                      borderRadius: "10px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer"
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5A6270" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                      <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#12171E" }}>Open Webcam to Take Live Portrait</span>
                    {cameraError && <span style={{ fontSize: "12px", color: "#9B3A22" }}>{cameraError}</span>}
                  </button>
                )}
              </div>

              {/* SECTION 3: Supporting Document Upload */}
              <div style={{ borderTop: "1px solid #DDD6C7", paddingTop: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                  2. Supporting Document (Student ID / Admission Proof)
                </label>
                <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "#5A6270" }}>
                  Upload an image (JPG, PNG) or PDF of your university identity card or approval letter.
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <input
                    type="file"
                    id="doc-upload"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={handleDocumentChange}
                    style={{ display: "none" }}
                  />
                  <label
                    htmlFor="doc-upload"
                    style={{
                      padding: "10px 18px",
                      background: "#FFFFFF",
                      border: "1px solid #C4BCAF",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-block"
                    }}
                  >
                    {documentFile ? "Change Document" : "Choose Document File"}
                  </label>
                  {documentFile && (
                    <span style={{ fontSize: "12.5px", color: "#1F6B3F", fontWeight: 500 }}>
                      ✓ {documentFile.name} ({(documentFile.size / 1024).toFixed(1)} KB)
                    </span>
                  )}
                </div>

                {documentPreview && (
                  <div style={{ marginTop: "12px" }}>
                    <img
                      src={documentPreview}
                      alt="Document Preview"
                      style={{ maxHeight: "120px", borderRadius: "6px", border: "1px solid #DDD6C7" }}
                    />
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div style={{ borderTop: "1px solid #DDD6C7", paddingTop: "20px" }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    height: "46px",
                    background: "#12171E",
                    color: "#F5F1E8",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px"
                  }}
                >
                  {loading ? "Submitting Application..." : "Submit e-KYC Application for Review &rarr;"}
                </button>
              </div>

            </form>
          </div>
        )}
      </main>
    </div>
  );
}
