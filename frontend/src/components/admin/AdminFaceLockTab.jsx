import React, { useState, useRef } from "react";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — ADMINISTRATOR BIOMETRIC FACE LOCK
 * ==============================================================================
 * In plain words (Layman):
 *   This tab allows the Administrator to lock admin logins to specific faces.
 *   After first-time entry, the admin can upload or snap their face, enable
 *   biometric verification, and add multiple co-admin faces. From then on,
 *   only registered faces can sign in as administrator.
 * ==============================================================================
 */

export default function AdminFaceLockTab({
  faceProfiles = [],
  requireFaceMatch = false,
  onToggleRestriction,
  onAddFace,
  onDeleteFace,
  loading = false,
  onPreviewImage
}) {
  const [label, setLabel] = useState("");
  const [photoBase64, setPhotoBase64] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const startCamera = async () => {
    try {
      setFormError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setFormError("Could not access camera. Please check camera permissions or upload an image file.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPhotoBase64(dataUrl);
    stopCamera();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Please upload a valid image file (JPG or PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoBase64(ev.target.result);
      stopCamera();
      setFormError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitNewFace = async (e) => {
    e.preventDefault();
    if (!photoBase64) {
      setFormError("Please snap a camera photo or upload an image file first.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await onAddFace(label.trim() || "Administrator Profile", photoBase64);
      setLabel("");
      setPhotoBase64(null);
      stopCamera();
    } catch (err) {
      setFormError(err.message || "Failed to register face profile. Ensure a clear face is visible.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* 1. Header & Restriction Policy Control */}
      <div style={{
        background: "#FBF9F4",
        border: "1px solid #DDD6C7",
        borderRadius: "14px",
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.8px", color: "#D9822B", marginBottom: "4px" }}>
              ACCESS CONTROL POLICY
            </div>
            <h2 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontSize: "24px", color: "#12171E" }}>
              Administrator Biometric Face Lock
            </h2>
            <p style={{ margin: 0, fontSize: "14px", color: "#5A6270", maxWidth: "600px", lineHeight: 1.5 }}>
              Restrict admin access strictly to verified physical individuals. When enabled, signing in as an
              administrator checks live camera blink detection and verifies your 128D face score against
              the authorized profiles below.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            <span style={{
              background: requireFaceMatch ? "#DDEFE2" : "#E4DDCF",
              color: requireFaceMatch ? "#1F6B3F" : "#5A6270",
              border: `1px solid ${requireFaceMatch ? "#1F6B3F" : "#B9B2A3"}`,
              fontSize: "12px",
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: "999px",
              letterSpacing: "0.5px"
            }}>
              {requireFaceMatch ? "BIOMETRIC LOCK ACTIVE" : "STANDARD LIVENESS ONLY"}
            </span>

            <button
              type="button"
              disabled={loading}
              onClick={() => onToggleRestriction(!requireFaceMatch)}
              className={requireFaceMatch ? "btn-outline" : "btn-dark"}
              style={{ height: "38px", padding: "0 18px", fontSize: "13.5px" }}
            >
              {requireFaceMatch ? "Disable Biometric Lock" : "Enforce Biometric Lock"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Registered Administrator Face Profiles */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontSize: "20px", color: "#12171E" }}>
            Authorized Administrator Faces ({faceProfiles.length})
          </h3>
          <span style={{ fontSize: "13px", color: "#5A6270" }}>
            Multi-face authorization enables co-admins or backup profiles
          </span>
        </div>

        {faceProfiles.length === 0 ? (
          <div style={{
            background: "#FBF9F4",
            border: "1px dashed #DDD6C7",
            borderRadius: "12px",
            padding: "36px 20px",
            textAlign: "center",
            color: "#5A6270",
            fontSize: "14px"
          }}>
            No administrator face profiles registered yet. Enroll your face below to enable biometric matching.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {faceProfiles.map((face) => (
              <div
                key={face.id}
                style={{
                  background: "#FBF9F4",
                  border: "1px solid #DDD6C7",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.03)"
                }}
              >
                <img
                  src={face.photo_url}
                  alt={face.label}
                  onClick={() => onPreviewImage && onPreviewImage({ src: face.photo_url, title: face.label, isPdf: false })}
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "2px solid #D9822B",
                    cursor: "pointer"
                  }}
                  title="Click to view full photo"
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "14.5px", color: "#12171E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {face.label}
                  </div>
                  <div style={{ fontSize: "12px", color: "#5A6270", marginTop: "2px" }}>
                    Enrolled: {face.created_at ? face.created_at.slice(0, 10) : "Active"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteFace(face.id)}
                  title="Delete face profile"
                  style={{
                    background: "#F6DDD4",
                    border: "1px solid #9B3A22",
                    color: "#9B3A22",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: 500
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Enroll New Administrator Face Profile */}
      <div style={{
        background: "#FBF9F4",
        border: "1px solid #DDD6C7",
        borderRadius: "14px",
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: "18px"
      }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontFamily: "'Newsreader', Georgia, serif", fontSize: "20px", color: "#12171E" }}>
            Add Authorized Face Profile
          </h3>
          <p style={{ margin: 0, fontSize: "13.5px", color: "#5A6270" }}>
            Capture a live camera snapshot or upload a recent photo. The system extracts a 128-dimensional facial embedding vector.
          </p>
        </div>

        {formError && (
          <div style={{
            background: "#F6DDD4",
            border: "1px solid #9B3A22",
            borderRadius: "8px",
            padding: "10px 14px",
            color: "#9B3A22",
            fontSize: "13px"
          }}>
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmitNewFace} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ maxWidth: "420px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#12171E", marginBottom: "6px" }}>
              Profile Label / Admin Name
            </label>
            <input
              type="text"
              placeholder="e.g. Arka Paul (Primary) or Lab Supervisor"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input-editorial"
              required
            />
          </div>

          {/* Camera / Photo Capture Card */}
          <div style={{
            background: "#EAE5D9",
            border: "1px solid #C4BCAF",
            borderRadius: "12px",
            padding: "18px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px"
          }}>
            {/* Live Camera View */}
            {cameraActive && (
              <div style={{ position: "relative", width: "100%", maxWidth: "380px", borderRadius: "10px", overflow: "hidden", background: "#000" }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "260px", objectFit: "cover" }}
                />
              </div>
            )}

            {/* Photo Preview */}
            {!cameraActive && photoBase64 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                <img
                  src={photoBase64}
                  alt="Captured face snapshot"
                  style={{ width: "160px", height: "160px", borderRadius: "50%", objectFit: "cover", border: "3px solid #D9822B" }}
                />
                <span style={{ fontSize: "12.5px", color: "#1F6B3F", fontWeight: 600 }}>
                  Ready to enroll
                </span>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center" }}>
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="btn-outline"
                  style={{ height: "36px", padding: "0 16px", fontSize: "13px" }}
                >
                  {photoBase64 ? "Retake Live Photo" : "Open Camera"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={captureSnapshot}
                    className="btn-dark"
                    style={{ height: "36px", padding: "0 18px", fontSize: "13px", background: "#D9822B" }}
                  >
                    Snap Face Photo
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="btn-outline"
                    style={{ height: "36px", padding: "0 14px", fontSize: "13px" }}
                  >
                    Cancel Camera
                  </button>
                </>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-outline"
                style={{ height: "36px", padding: "0 16px", fontSize: "13px" }}
              >
                Upload Photo File
              </button>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={submitting || !photoBase64}
              className="btn-dark"
              style={{
                height: "40px",
                padding: "0 22px",
                fontSize: "14px",
                opacity: (!photoBase64 || submitting) ? 0.6 : 1
              }}
            >
              {submitting ? "Extracting 128D Face Embedding..." : "Enroll Authorized Face Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
