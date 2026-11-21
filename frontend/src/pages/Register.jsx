import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiRequest } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — NEW ACCOUNT REGISTRATION & ADMIN APPROVAL
 * ==============================================================================
 * In plain words (Layman):
 *   This is the self-registration page. A new member enters their details:
 *   name, email, phone number, password, snaps their recent live face photo,
 *   and attaches a supported identity document (student ID, letter, etc.).
 *   
 *   Clicking "Sent to Admin Approval" forwards their application to the admin
 *   portal. Once the administrator confirms and approves their application,
 *   the user can sign in with their credentials.
 * ==============================================================================
 */

/**
 * Supported Countries with international dial codes and exact national digit lengths
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

export default function Register() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenParam = searchParams.get("token") || "";

  // Step state: 'details' -> 'consent'
  const [step, setStep] = useState("details");

  // Registration mode: 'direct' (self-service signup) or 'invite' (admin invite token)
  const [mode, setMode] = useState(tokenParam ? "invite" : "direct");

  // Consent states
  const [consentChecked, setConsentChecked] = useState(false);
  const [declineNotice, setDeclineNotice] = useState(false);

  // Form states
  const [inviteToken, setInviteToken] = useState(tokenParam);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState(null);
  const [selectedCountryCode, setSelectedCountryCode] = useState("IN");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Field warning notices
  const [nameWarning, setNameWarning] = useState("");
  const [phoneWarning, setPhoneWarning] = useState("");

  useEffect(() => {
    if (tokenParam) {
      apiRequest(`/auth/invite-info?token=${encodeURIComponent(tokenParam)}`)
        .then((info) => {
          if (info?.email) setEmail(info.email);
          if (info?.role) setInviteRole(info.role);
        })
        .catch(() => {});
    }
  }, [tokenParam]);

  const selectedCountry = COUNTRIES.find((c) => c.code === selectedCountryCode) || COUNTRIES[0];

  const handleCountryChange = (e) => {
    const newCode = e.target.value;
    setSelectedCountryCode(newCode);
    const country = COUNTRIES.find((c) => c.code === newCode) || COUNTRIES[0];
    if (phoneNumber.length > country.digits) {
      setPhoneNumber(phoneNumber.slice(0, country.digits));
    }
    setPhoneWarning("");
  };

  const handlePhoneChange = (e) => {
    const raw = e.target.value;
    if (/[a-zA-Z]/.test(raw)) {
      setPhoneWarning("Letters and text are not permitted in Phone Number. Digits only.");
    } else {
      setPhoneWarning("");
    }
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly.length <= selectedCountry.digits) {
      setPhoneNumber(digitsOnly);
    }
  };

  const handleFullNameChange = (e) => {
    const raw = e.target.value;
    if (/\d/.test(raw)) {
      setNameWarning("Numbers are not permitted in Full Name. Letters only.");
    } else {
      setNameWarning("");
    }
    const lettersOnly = raw.replace(/[^a-zA-Z\s'.\-]/g, "");
    setFullName(lettersOnly);
  };

  // Recent Clicked Image (Camera capture or photo upload)
  const [facePhoto, setFacePhoto] = useState(""); // Base64 data URL
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Supported Document (PDF, PNG, JPG)
  const [documentBase64, setDocumentBase64] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [documentSize, setDocumentSize] = useState("");
  const [docPreview, setDocPreview] = useState(null);

  // UI status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);

  // Enumerate video devices and prioritize computer/device internal camera by default
  const refreshDevices = async (activeStream = null) => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(videoInputs);

      if (videoInputs.length > 0) {
        const saved = localStorage.getItem("sankalp_preferred_camera");
        const savedExists = videoInputs.some((d) => d.deviceId === saved);

        // Check if activeStream has a deviceId
        let activeTrackDeviceId = null;
        if (activeStream) {
          const videoTrack = activeStream.getVideoTracks()[0];
          if (videoTrack?.getSettings) {
            activeTrackDeviceId = videoTrack.getSettings().deviceId;
          }
        }

        if (activeTrackDeviceId && videoInputs.some((d) => d.deviceId === activeTrackDeviceId)) {
          setSelectedDeviceId(activeTrackDeviceId);
          localStorage.setItem("sankalp_preferred_camera", activeTrackDeviceId);
        } else if (saved && savedExists) {
          setSelectedDeviceId(saved);
        } else {
          // Default: Prioritize built-in computer / device camera (integrated/internal/webcam/facetime/front)
          // Deprioritize secondary phone/virtual link cameras as default
          const integrated = videoInputs.find((d) => {
            const label = (d.label || "").toLowerCase();
            return (
              (label.includes("integrated") ||
                label.includes("internal") ||
                label.includes("built-in") ||
                label.includes("webcam") ||
                label.includes("facetime") ||
                label.includes("hd camera") ||
                label.includes("front") ||
                label.includes("user")) &&
              !label.includes("oppo") &&
              !label.includes("phone") &&
              !label.includes("link") &&
              !label.includes("virtual") &&
              !label.includes("droidcam") &&
              !label.includes("camo") &&
              !label.includes("obs") &&
              !label.includes("back") &&
              !label.includes("rear")
            );
          });
          const chosen = integrated ? integrated.deviceId : videoInputs[0].deviceId;
          setSelectedDeviceId(chosen);
          localStorage.setItem("sankalp_preferred_camera", chosen);
        }
      }
    } catch (err) {
      console.warn("Could not list video devices:", err);
    }
  };

  useEffect(() => {
    refreshDevices();
    const handleDeviceChange = () => refreshDevices(streamRef.current);
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
      return () => navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    }
  }, []);

  // Cleanup webcam stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // WebCam controls
  const startCamera = async (targetDeviceId = null) => {
    if (typeof targetDeviceId !== "string") {
      targetDeviceId = null;
    }
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const devId = targetDeviceId || selectedDeviceId || localStorage.getItem("sankalp_preferred_camera");

    const constraints = {
      video: devId
        ? { deviceId: { exact: devId }, width: { ideal: 640 }, height: { ideal: 480 } }
        : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
        };
        videoRef.current.play().catch(() => {});
      }
      refreshDevices(stream);
    } catch (err) {
      // If devId was specified and failed, fallback to generic user-facing device camera
      if (devId) {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
          });
          streamRef.current = fallbackStream;
          setIsCameraActive(true);
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(() => {});
            };
            videoRef.current.play().catch(() => {});
          }
          refreshDevices(fallbackStream);
          return;
        } catch (fallbackErr) {
          // both attempts failed
        }
      }
      setCameraError("Camera access denied or unavailable (" + (err.message || "check permissions") + "). You may upload a recent photo instead.");
      setIsCameraActive(false);
    }
  };

  // Switch between available cameras (Computer vs Phone / External)
  const switchCamera = async (newDeviceId) => {
    setSelectedDeviceId(newDeviceId);
    localStorage.setItem("sankalp_preferred_camera", newDeviceId);
    if (isCameraActive) {
      await startCamera(newDeviceId);
    }
  };

  // Ensure stream is attached whenever isCameraActive changes and video element is mounted
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(() => {});
      };
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive]);

  const attachVideoRef = (el) => {
    videoRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.onloadedmetadata = () => {
        el.play().catch(() => {});
      };
      el.play().catch(() => {});
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    // Draw mirrored to match viewfinder
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    setFacePhoto(dataUrl);
    stopCamera();
  };

  const handlePhotoFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file for your recent photo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFacePhoto(event.target.result);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  // Document upload handler
  const handleDocumentUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Check size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
      setError("Supporting document must be smaller than 10MB.");
      return;
    }

    setDocumentName(file.name);
    setDocumentSize((file.size / 1024).toFixed(1) + " KB");

    const reader = new FileReader();
    reader.onload = (event) => {
      const res = event.target.result;
      setDocumentBase64(res);
      if (file.type.startsWith("image/")) {
        setDocPreview(res);
      } else {
        setDocPreview(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Advance to DPDP Consent Screen after form validation
  // Validate and advance to consent step
  const handleProceedToConsent = (e) => {
    e.preventDefault();
    setError(null);

    if (mode === "invite") {
      if (!inviteToken.trim()) {
        setError("Please enter your organization invite token.");
        return;
      }
    }

    // 1. Compulsory fields validation
    if (!fullName.trim()) {
      setError("Full Name is compulsory.");
      return;
    }
    if (/\d/.test(fullName)) {
      setError("Full Name cannot contain numbers. Please enter your name using letters only.");
      return;
    }
    if (fullName.trim().length < 2) {
      setError("Please enter your complete legal name.");
      return;
    }

    if (mode === "direct") {
      if (!email.trim() || !email.includes("@")) {
        setError("A valid Email Address is compulsory.");
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
    }

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!facePhoto) {
      setError("Recent clicked image is compulsory. Please snap a photo with your camera or upload a clear portrait.");
      return;
    }
    if (!documentBase64) {
      setError("Supported document is compulsory. Please upload your student ID, enrollment slip, or verification document.");
      return;
    }

    setStep("consent");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Submit to Admin Approval once consent is granted
  const handleConfirmSubmit = async () => {
    if (!consentChecked) {
      setError("You must review and check the consent box to proceed.");
      return;
    }

    setError(null);
    setLoading(true);

    const fullPhoneNumber = `${selectedCountry.dialCode} ${phoneNumber.trim()}`;

    try {
      if (mode === "invite") {
        // Invite-based application submission
        const res = await apiRequest("/auth/apply", {
          method: "POST",
          body: JSON.stringify({
            invite_token: inviteToken.trim(),
            name: fullName.trim(),
            password,
            face_photo: facePhoto,
            document_base64: documentBase64,
            document_name: documentName || "supporting_document.pdf"
          })
        });

        setSubmittedData({
          name: fullName.trim(),
          email: res.email || "Invite Verified",
          phone: fullPhoneNumber || "Registered via Invite",
          documentName: documentName || "Document attached",
          facePhoto: facePhoto
        });
        setSubmitted(true);
      } else {
        // Direct self-service registration
        const res = await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            name: fullName.trim(),
            phone: fullPhoneNumber,
            password,
            face_photo: facePhoto,
            document_base64: documentBase64,
            document_name: documentName || "supporting_document.pdf",
            consent_given: true
          })
        });

        setSubmittedData({
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: fullPhoneNumber,
          documentName: documentName || "Document attached",
          facePhoto: facePhoto
        });
        setSubmitted(true);
      }
    } catch (err) {
      console.error("Registration error:", err);
      const detail = err?.detail;
      const errCode = typeof detail === "object" && detail !== null ? detail.error : err?.error;
      const errMsg = typeof detail === "object" && detail !== null 
        ? detail.message 
        : (typeof detail === "string" ? detail : (err?.message || "Failed to submit application. Please check your connection."));

      if (errCode === "user_exists") {
        setError("An account with this email already exists. Please log in directly.");
      } else if (errCode === "already_pending") {
        setError("An application for this email has already been submitted and is waiting for administrator approval.");
      } else if (errCode === "invalid_invite") {
        setError("The invite token entered is invalid or expired. Please check your invite email.");
      } else if (errCode === "invite_used") {
        setError("This invite token has already been used. Please log in.");
      } else if (errCode === "invite_expired") {
        setError("This invite token has expired. Please request a new invite from your administrator.");
      } else {
        setError(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Quick fill helper for testing/demos
  const fillDemoData = () => {
    setFullName("Tanmay Bhattacharya");
    setEmail("tanmay.bhatt@jadavpur.edu");
    setSelectedCountryCode("IN");
    setPhoneNumber("9830123456");
    setPassword("DemoPass123!");

    // Generate a clean dummy face snapshot (200x200 canvas with avatar)
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#E4DDCF";
    ctx.fillRect(0, 0, 240, 240);
    // Face circle
    ctx.fillStyle = "#D9822B";
    ctx.beginPath();
    ctx.arc(120, 100, 50, 0, Math.PI * 2);
    ctx.fill();
    // Body curve
    ctx.beginPath();
    ctx.arc(120, 220, 80, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#12171E";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RECENT SNAPSHOT", 120, 190);
    setFacePhoto(canvas.toDataURL("image/jpeg", 0.9));

    // Generate demo document
    setDocumentName("Jadavpur_University_StudentID_2026.pdf");
    setDocumentSize("142.5 KB");
    setDocumentBase64("data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwgL0xlbmd0aCA1IDAgUiAvRmlsdGVyIC9GbGF0ZURlY29kZSA+PgpzdHJlYW0KeJzLSM3JyVcozy/KSVEEAA/4A4cKZW5kc3RyZWFtCmVuZG9iag==");
    setError(null);
  };

  // Success Confirmation Screen
  if (submitted) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#F3EFE7",
        color: "#12171E",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif"
      }}>
        {/* Top Header */}
        <header style={{ borderBottom: "1px solid #DDD6C7", padding: "18px 48px", background: "#FBF9F4" }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2.5px solid #12171E", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#D9822B" }}></div>
              </div>
              <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "20px", fontWeight: "600" }}>
                Real Access
              </span>
            </div>
            <Link to="/login" style={{ color: "#12171E", fontSize: "14px", textDecoration: "underline", textUnderlineOffset: "3px" }}>
              Back to Sign In
            </Link>
          </div>
        </header>

        {/* Confirmation Card */}
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
          <div style={{
            background: "#FBF9F4",
            border: "1px solid #DDD6C7",
            borderRadius: "16px",
            padding: "40px",
            maxWidth: "520px",
            width: "100%",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)"
          }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "#E7F5ED",
                color: "#15803D",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "26px",
                marginBottom: "14px"
              }}>
                ✓
              </div>
              <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "28px", fontWeight: "500", margin: "0 0 8px" }}>
                Sent to Admin Approval
              </h1>
              <p style={{ color: "#5A6270", fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
                Your registration has been forwarded to the administrator portal. Once confirmed and approved by an administrator, you will be able to log in with your credentials.
              </p>
            </div>

            {/* Application Summary Box */}
            <div style={{
              background: "#F3EFE7",
              border: "1px solid #DDD6C7",
              borderRadius: "10px",
              padding: "16px 20px",
              marginBottom: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              fontSize: "13.5px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                {submittedData?.facePhoto && (
                  <img
                    src={submittedData.facePhoto}
                    alt="Captured portrait"
                    style={{ width: "54px", height: "54px", borderRadius: "50%", objectFit: "cover", border: "2px solid #D9822B" }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 600, fontSize: "15px", color: "#12171E" }}>{submittedData?.name}</div>
                  <div style={{ color: "#5A6270", fontSize: "13px" }}>{submittedData?.email}</div>
                  <div style={{ color: "#5A6270", fontSize: "12.5px" }}>{submittedData?.phone}</div>
                </div>
              </div>

              <div style={{ borderTop: "1px dashed #C4BCAF", paddingTop: "10px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#5A6270" }}>Document:</span>
                <span style={{ fontWeight: 500, color: "#12171E" }}>{submittedData?.documentName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#5A6270" }}>Status:</span>
                <span style={{
                  background: "#FEF3C7",
                  color: "#92400E",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: "999px"
                }}>
                  Pending Admin Approval
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link
                to="/login"
                style={{
                  height: "44px",
                  background: "#12171E",
                  color: "#F5F1E8",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                Back to Sign In
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Registration Form View
  return (
    <div style={{
      minHeight: "100vh",
      background: "#F3EFE7",
      color: "#12171E",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      {/* Header */}
      <header className="auth-header">
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "24px", height: "24px", borderRadius: "50%", border: "2.5px solid #12171E", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#D9822B" }}></div>
            </div>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "20px", fontWeight: "600" }}>
              Real Access
            </span>
          </div>
          <Link to="/login" style={{ color: "#12171E", fontSize: "13px", textDecoration: "underline", textUnderlineOffset: "3px" }}>
            Already have an account? Sign In &rarr;
          </Link>
        </div>
      </header>

      {/* Main Registration Card */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 14px" }}>
        <div className="auth-card" style={{
          maxWidth: step === "consent" ? "680px" : "600px",
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
              <span className="stepper-label-full">Registration Details</span>
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
              <span className="stepper-label-full">Admin Approval</span>
              <span className="stepper-label-short">Approval</span>
            </li>
          </ol>

          {/* Error Banner */}
          {error && (
            <div style={{
              background: "#F6DDD4",
              border: "1px solid #9B3A22",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#9B3A22",
              fontSize: "13px",
              marginBottom: "18px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span style={{ fontWeight: 700 }}>[!]</span>
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: FORM DETAILS */}
          {step === "details" && (
            <div>
              {tokenParam && (
                <div style={{
                  background: "#FBF9F4",
                  border: "1px solid #D9822B",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  marginBottom: "16px",
                  color: "#8B5200",
                  fontSize: "13px",
                  lineHeight: 1.5
                }}>
                  <strong>Invited Registration:</strong> You have been invited to join as <strong>{inviteRole || "a member"}</strong>. Please complete your profile, capture your photo, and attach your student ID for administrator verification.
                </div>
              )}
              {/* Header Title */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.8px", color: "#D9822B", marginBottom: "4px" }}>
                  ACCOUNT REGISTRATION
                </div>
                <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "28px", fontWeight: "500", margin: "0 0 6px" }}>
                  Create New Account
                </h1>
                <p style={{ color: "#5A6270", fontSize: "13.5px", lineHeight: "1.4", margin: 0 }}>
                  All fields are compulsory. Fill out your details, provide a recent live photo and a supporting document, and submit for administrator approval.
                </p>
              </div>

              {/* Mode Toggle: Direct Registration vs Have an Invite Token */}
              <div style={{
                display: "inline-flex",
                background: "#EBE5D8",
                borderRadius: "8px",
                padding: "3px",
                marginBottom: "18px",
                gap: "2px"
              }}>
                <button
                  type="button"
                  onClick={() => { setMode("direct"); setError(null); }}
                  style={{
                    background: mode === "direct" ? "#FBF9F4" : "transparent",
                    color: mode === "direct" ? "#12171E" : "#5A6270",
                    border: 0,
                    borderRadius: "6px",
                    padding: "7px 14px",
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
                    padding: "7px 14px",
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

              {/* Form */}
              <form onSubmit={handleProceedToConsent} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Invite Token Input if mode === 'invite' */}
            {mode === "invite" && (
              <div style={{ background: "#F3EFE7", border: "1px solid #D9822B", borderRadius: "8px", padding: "14px 16px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", marginBottom: "5px", color: "#12171E" }}>
                  Organization Invite Token <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. demo-invite-token-12345"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  className="input-editorial"
                  style={{ height: "40px", fontSize: "14px", fontFamily: "'JetBrains Mono', monospace", background: "#FFFFFF" }}
                />
                <div style={{ fontSize: "11.5px", color: "#5A6270", marginTop: "4px" }}>
                  Enter the secure invite token issued by your university department or club administrator.
                </div>
              </div>
            )}

            {/* 1. Full Name */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px" }}>
                Full Name <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Rahul Sharma"
                value={fullName}
                onChange={handleFullNameChange}
                onKeyDown={(e) => {
                  if (e.key >= "0" && e.key <= "9" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    setNameWarning("Numbers are not permitted in Full Name. Letters only.");
                  }
                }}
                style={{
                  width: "100%",
                  height: "42px",
                  padding: "0 14px",
                  borderRadius: "7px",
                  border: nameWarning ? "1px solid #DC2626" : "1px solid #C4BCAF",
                  background: "#FDFBF7",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
              {nameWarning ? (
                <div style={{ fontSize: "11px", color: "#DC2626", fontWeight: 600, marginTop: "3px" }}>
                  [!] {nameWarning}
                </div>
              ) : (
                <div style={{ fontSize: "11px", color: "#5A6270", marginTop: "3px" }}>
                  Letters only (no numbers allowed)
                </div>
              )}
            </div>

            {/* 2. Phone Number & Email Address (Side-by-side or stacked clean) */}
            {mode === "direct" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px" }}>
                    Phone Number <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <div style={{
                    display: "flex",
                    alignItems: "stretch",
                    width: "100%",
                    borderRadius: "7px",
                    border: phoneWarning ? "1px solid #DC2626" : "1px solid #C4BCAF",
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
                      borderRight: phoneWarning ? "1px solid #DC2626" : "1px solid #C4BCAF",
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
                          padding: "0 22px 0 12px",
                          height: "42px",
                          fontSize: "13px",
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
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      placeholder={`${selectedCountry.placeholder}`}
                      value={phoneNumber}
                      onChange={handlePhoneChange}
                      onKeyDown={(e) => {
                        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                          setPhoneWarning("Letters and text are not permitted in Phone Number. Digits only.");
                        }
                      }}
                      maxLength={selectedCountry.digits}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: "42px",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        padding: "0 14px",
                        fontSize: "14px",
                        color: "#12171E"
                      }}
                    />
                  </div>
                  {/* Character/digit counter & warning helper */}
                  {phoneWarning ? (
                    <div style={{ fontSize: "11px", color: "#DC2626", fontWeight: 600, marginTop: "3px" }}>
                      [!] {phoneWarning}
                    </div>
                  ) : (
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      color: phoneNumber.length === selectedCountry.digits ? "#15803D" : "#5A6270",
                      marginTop: "3px"
                    }}>
                      <span>Numbers only ({selectedCountry.name})</span>
                      <span style={{ fontWeight: 600 }}>{phoneNumber.length} / {selectedCountry.digits} digits</span>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px" }}>
                    Email Address <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="you@college.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: "100%",
                      height: "42px",
                      padding: "0 14px",
                      borderRadius: "7px",
                      border: "1px solid #C4BCAF",
                      background: "#FDFBF7",
                      fontSize: "14px",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>
            )}

            {/* 3. Password */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px" }}>
                Password (min 8 characters) <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    height: "40px",
                    padding: "0 46px 0 12px",
                    borderRadius: "7px",
                    border: "1px solid #C4BCAF",
                    background: "#FDFBF7",
                    fontSize: "13.5px",
                    boxSizing: "border-box"
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

            {/* 4. Recent Clicked Image (Camera / Snapshot) */}
            <div style={{
              background: "#F3EFE7",
              border: "1px solid #DDD6C7",
              borderRadius: "10px",
              padding: "14px 16px"
            }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", marginBottom: "4px" }}>
                Recent Clicked Image <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#5A6270" }}>
                Snap a live camera portrait or upload a recent clear photograph of yourself.
              </p>

              {cameraError && (
                <div style={{ fontSize: "12px", color: "#9B3A22", marginBottom: "8px" }}>
                  {cameraError}
                </div>
              )}

              {/* Live Camera Viewfinder */}
              {isCameraActive && (
                <>
                <div style={{
                  position: "relative",
                  width: "100%",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background: "#12171E",
                  marginBottom: "10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center"
                }}>
                  <video
                    ref={attachVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        videoRef.current.play().catch(() => {});
                      }
                    }}
                    style={{
                      width: "100%",
                      height: "240px",
                      minHeight: "240px",
                      maxHeight: "240px",
                      objectFit: "cover",
                      transform: "scaleX(-1)",
                      display: "block"
                    }}
                  />
                  {/* Face outline guide */}
                  <div style={{
                    position: "absolute",
                    top: "10%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "120px",
                    height: "150px",
                    borderRadius: "50%",
                    border: "2px dashed #D9822B",
                    pointerEvents: "none"
                  }} />
                  <div style={{
                    position: "absolute",
                    bottom: "10px",
                    display: "flex",
                    gap: "8px",
                    zIndex: 2
                  }}>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      style={{
                        background: "#D9822B",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "6px",
                        padding: "7px 16px",
                        fontWeight: 600,
                        fontSize: "12.5px",
                        cursor: "pointer"
                      }}
                    >
                      Snap Photo
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      style={{
                        background: "#2A3340",
                        color: "#E9E4D8",
                        border: "none",
                        borderRadius: "6px",
                        padding: "7px 12px",
                        fontWeight: 500,
                        fontSize: "12px",
                        cursor: "pointer"
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {/* Switch Camera Controls while camera is live */}
                {videoDevices.length > 1 && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    flexWrap: "wrap",
                    background: "#EBE5D8",
                    border: "1px solid #C4BCAF",
                    borderRadius: "7px",
                    padding: "7px 10px",
                    marginBottom: "10px",
                    fontSize: "12px"
                  }}>
                    <span style={{ fontWeight: 600, color: "#12171E", whiteSpace: "nowrap", flexShrink: 0 }}>
                      Switch Camera:
                    </span>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => switchCamera(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        width: "100%",
                        maxWidth: "100%",
                        height: "28px",
                        padding: "0 6px",
                        borderRadius: "4px",
                        border: "1px solid #B0A798",
                        background: "#FFFFFF",
                        fontSize: "12px",
                        color: "#12171E",
                        cursor: "pointer",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        overflow: "hidden"
                      }}
                    >
                      {videoDevices.map((dev, idx) => {
                        const label = dev.label || `Camera ${idx + 1}`;
                        const isIntegrated = (label.toLowerCase().includes("integrated") || label.toLowerCase().includes("internal") || label.toLowerCase().includes("webcam") || label.toLowerCase().includes("facetime") || label.toLowerCase().includes("hd camera"));
                        return (
                          <option key={dev.deviceId || idx} value={dev.deviceId}>
                            {label} {isIntegrated ? "(Computer Camera)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                </>
              )}

              {/* Camera Preference Selector before camera is opened */}
              {!isCameraActive && !facePhoto && videoDevices.length > 1 && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  flexWrap: "wrap",
                  background: "#FBF9F4",
                  border: "1px solid #DDD6C7",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  marginBottom: "10px",
                  fontSize: "12px",
                  color: "#5A6270"
                }}>
                  <span style={{ fontWeight: 500, color: "#12171E", whiteSpace: "nowrap", flexShrink: 0 }}>Camera:</span>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => switchCamera(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      width: "100%",
                      maxWidth: "100%",
                      height: "28px",
                      padding: "0 6px",
                      borderRadius: "4px",
                      border: "1px solid #C4BCAF",
                      background: "#FFFFFF",
                      fontSize: "12px",
                      color: "#12171E",
                      cursor: "pointer",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      overflow: "hidden"
                    }}
                  >
                    {videoDevices.map((dev, idx) => {
                      const label = dev.label || `Camera ${idx + 1}`;
                      const isIntegrated = (label.toLowerCase().includes("integrated") || label.toLowerCase().includes("internal") || label.toLowerCase().includes("webcam") || label.toLowerCase().includes("facetime") || label.toLowerCase().includes("hd camera"));
                      return (
                        <option key={dev.deviceId || idx} value={dev.deviceId}>
                          {label} {isIntegrated ? "(Computer Camera)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Photo Preview if already taken */}
              {facePhoto && !isCameraActive && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "#FBF9F4",
                  border: "1px solid #DDD6C7",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  marginBottom: "8px"
                }}>
                  <img
                    src={facePhoto}
                    alt="Captured portrait preview"
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "6px",
                      objectFit: "cover",
                      border: "1.5px solid #D9822B"
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#15803D" }}>
                      ✓ Recent Photo Captured
                    </div>
                    <div style={{ fontSize: "11px", color: "#5A6270" }}>
                      Portrait is ready for admin review
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setFacePhoto(""); startCamera(); }}
                    style={{
                      background: "#EFECE4",
                      border: "1px solid #C4BCAF",
                      borderRadius: "5px",
                      padding: "4px 8px",
                      fontSize: "11.5px",
                      fontWeight: 500,
                      cursor: "pointer"
                    }}
                  >
                    Retake
                  </button>
                </div>
              )}

              {/* Camera Trigger Buttons (when camera not open and no photo) */}
              {!isCameraActive && !facePhoto && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={startCamera}
                    style={{
                      flex: 1,
                      height: "36px",
                      background: "#12171E",
                      color: "#F5F1E8",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    Use Camera to Snap Photo
                  </button>
                  <label
                    style={{
                      flex: 1,
                      height: "36px",
                      background: "#EFECE4",
                      color: "#12171E",
                      border: "1px solid #C4BCAF",
                      borderRadius: "6px",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* 5. Supported Document */}
            <div style={{
              background: "#F3EFE7",
              border: "1px solid #DDD6C7",
              borderRadius: "10px",
              padding: "14px 16px"
            }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", marginBottom: "4px" }}>
                Supported Document (College ID / Verification Document) <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#5A6270" }}>
                Upload student ID card, library pass, or university verification document (PDF, PNG, JPG).
              </p>

              {documentBase64 ? (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "#FBF9F4",
                  border: "1px solid #DDD6C7",
                  borderRadius: "8px",
                  padding: "8px 12px"
                }}>
                  {docPreview ? (
                    <img
                      src={docPreview}
                      alt="Doc preview"
                      style={{ width: "44px", height: "44px", borderRadius: "4px", objectFit: "cover", border: "1px solid #C4BCAF" }}
                    />
                  ) : (
                    <div style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "4px",
                      background: "#E4DDCF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#5A6270"
                    }}>
                      DOC
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#12171E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {documentName}
                    </div>
                    <div style={{ fontSize: "11px", color: "#5A6270" }}>
                      {documentSize} &bull; Attached successfully
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDocumentBase64(""); setDocumentName(""); setDocPreview(null); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#9B3A22",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "4px 8px"
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1.5px dashed #C4BCAF",
                  borderRadius: "8px",
                  padding: "16px",
                  background: "#FDFBF7",
                  cursor: "pointer",
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1px", color: "#8A4A0F", marginBottom: "4px" }}>ATTACH DOCUMENT</div>
                  <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#12171E" }}>
                    Click to select supporting document
                  </div>
                  <div style={{ fontSize: "11px", color: "#5A6270" }}>
                    PDF, PNG, JPG (maximum 10MB)
                  </div>
                  <input
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg"
                    onChange={handleDocumentUpload}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </div>

            {/* Submit Button to proceed to DPDP Consent */}
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
                fontSize: "14.5px",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: "6px"
              }}
            >
              Continue to Biometric Consent &rarr;
            </button>
          </form>

          {/* Quick Fill for Instant Demo Testing */}
          <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px dashed #DDD6C7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11.5px", color: "#5A6270" }}>Quick Demo:</span>
            <button
              type="button"
              onClick={fillDemoData}
              style={{
                background: "#EBE5D8",
                border: "1px solid #C4BCAF",
                borderRadius: "5px",
                padding: "3px 10px",
                fontSize: "11px",
                fontWeight: 600,
                color: "#12171E",
                cursor: "pointer"
              }}
            >
              Auto-Fill All Compulsory Fields
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: DPDP ACT 2023 INFORMED BIOMETRIC CONSENT FORM */}
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
              Before your registration is forwarded for administrator approval, please review how your identity verification data is handled, stored, and permanently destroyed.
            </p>
          </div>

          {/* Applicant & Documents Summary */}
          <div className="summary-box">
            <div className="summary-box-left">
              {facePhoto && (
                <img
                  src={facePhoto}
                  alt="Applicant preview"
                  style={{ width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover", border: "1.5px solid #D9822B", flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "#12171E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</div>
                <div style={{ color: "#5A6270", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email} &bull; {selectedCountry.dialCode} {phoneNumber}</div>
              </div>
            </div>
            <div className="summary-box-right">
              <div>Document: <strong style={{ color: "#12171E" }}>{documentName || "Attached"}</strong></div>
              <div>Size: {documentSize || "Ready"}</div>
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
                Live camera portrait snapshot, supporting student identification card, and facial geometry ratios. <strong>Your raw camera video is processed entirely in your local browser and never uploaded.</strong> Only the captured portrait and mathematical embeddings are securely transmitted for administrator verification.
              </div>
            </div>

            {/* 2. Why we collect it */}
            <div style={{ background: "#F3EFE7", border: "1px solid #DDD6C7", borderRadius: "10px", padding: "14px 18px" }}>
              <div style={{ fontSize: "13.5px", fontWeight: "600", color: "#12171E", marginBottom: "4px" }}>
                2. Why do we collect it?
              </div>
              <div style={{ fontSize: "13px", color: "#4A5260", lineHeight: "1.5" }}>
                To eliminate unauthorized access, bot accounts, and impersonation. This guarantees that only genuine, living physical human beings affiliated with the institution can obtain active club credentials.
              </div>
            </div>

            {/* 3. Where will it be used */}
            <div style={{ background: "#F3EFE7", border: "1px solid #DDD6C7", borderRadius: "10px", padding: "14px 18px" }}>
              <div style={{ fontSize: "13.5px", fontWeight: "600", color: "#12171E", marginBottom: "4px" }}>
                3. Where will it be used?
              </div>
              <div style={{ fontSize: "13px", color: "#4A5260", lineHeight: "1.5" }}>
                Exclusively within the campus self-hosted single sign-on system for university club authorization (Robotics, Coding, Photography, Athletics, Chess). <strong>Never shared with third parties, advertisers, or outside vendors.</strong>
              </div>
            </div>

            {/* 4. What happens when you leave */}
            <div style={{ background: "#F3EFE7", border: "1px solid #DDD6C7", borderRadius: "10px", padding: "14px 18px" }}>
              <div style={{ fontSize: "13.5px", fontWeight: "600", color: "#12171E", marginBottom: "4px" }}>
                4. What happens when you leave? (Right to Erasure)
              </div>
              <div style={{ fontSize: "13px", color: "#4A5260", lineHeight: "1.5" }}>
                Upon graduation, term expiration, or membership conclusion, all active sessions and tokens are revoked immediately. Your account records and biometric embeddings are permanently destroyed during automated cleanup cycles in full compliance with the Digital Personal Data Protection (DPDP) Act, 2023.
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
                I understand and give my explicit, informed consent for the collection and processing of my live portrait and student identification record for campus single sign-on under the Digital Personal Data Protection (DPDP) Act, 2023.
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
              Identity and biometric consent is required under campus security policy to protect club resources and prevent proxy access. Without consent, your application cannot be submitted for administrator approval. You can return to review or exit to the sign-in page.
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              type="button"
              disabled={!consentChecked || loading}
              onClick={handleConfirmSubmit}
              style={{
                height: "46px",
                width: "100%",
                background: "#12171E",
                color: "#F5F1E8",
                border: 0,
                borderRadius: "8px",
                fontSize: "14.5px",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: (!consentChecked || loading) ? 0.5 : 1,
                cursor: (!consentChecked || loading) ? "not-allowed" : "pointer"
              }}
            >
              {loading ? "Submitting Application..." : "I Consent & Sent to Admin Approval \u2192"}
            </button>

            <div className="action-button-group">
              <button
                type="button"
                onClick={() => { setStep("details"); setError(null); }}
                style={{
                  flex: 1,
                  height: "38px",
                  background: "#EBE5D8",
                  color: "#12171E",
                  border: "1px solid #C4BCAF",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                &larr; Back to Edit Details
              </button>

              <button
                type="button"
                onClick={() => setDeclineNotice(!declineNotice)}
                style={{
                  flex: 1,
                  height: "38px",
                  background: "transparent",
                  color: "#5A6270",
                  border: "1px solid #DDD6C7",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer"
                }}
              >
                I Decline Consent
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </main>
    </div>
  );
}
