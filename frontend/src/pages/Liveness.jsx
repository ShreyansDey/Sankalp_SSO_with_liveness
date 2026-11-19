import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest, API_BASE } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — CAMERA CHECK (BIOMETRIC LIVENESS VERIFICATION)
 * ==============================================================================
 * In plain words (Layman):
 *   This is the camera check to prove a real person is present at sign-in:
 *     Step 1: Turn head to the side (proves 3D depth and head rotation).
 *     Step 2: Return head to center (proves responsive control).
 *     Step 3: Blink eyes slowly (proves micro-muscle eyelid movement).
 *
 * Technical Specification:
 *   - Perfectly matches the official '5. Camera check' design component (Camera.dc.html)
 *   - In-browser MediaPipe Face Mesh (478 3D facial landmarks)
 *   - Stores ONLY pass/fail result with cryptographic code_hash in PostgreSQL
 *   - Video stream never leaves browser memory
 *   - Zero emojis, zero AI icons
 * ==============================================================================
 */

const STEP_TIME_LIMIT = 7; // 7 seconds per challenge step

export default function Liveness() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const userId = searchParams.get("user_id") || "";
  const userEmail = searchParams.get("email") || "";
  const clientId = searchParams.get("client_id") || "";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const state = searchParams.get("state") || "";

  const [challenge, setChallenge] = useState(null);

  // 3-step sequence: 1 -> 2 -> 3
  const [currentStep, setCurrentStep] = useState(1);
  const [stepTimeLeft, setStepTimeLeft] = useState(STEP_TIME_LIMIT);
  const [status, setStatus] = useState("camera_connecting"); // camera_connecting, waiting_action, completed_pass, completed_fail
  const [errorMsg, setErrorMsg] = useState("");

  // Step pass flags
  const [step1Passed, setStep1Passed] = useState(false);
  const [step2Passed, setStep2Passed] = useState(false);
  const [step3Passed, setStep3Passed] = useState(false);
  const [blinkDetected, setBlinkDetected] = useState(false);

  // Camera devices
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => {
    return localStorage.getItem("sankalp_preferred_camera") || "";
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const faceMeshRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const stepRef = useRef(1);

  // 1. Enumerate and prioritize laptop webcam
  useEffect(() => {
    async function getDevices() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setVideoDevices(videoInputs);

        if (videoInputs.length > 0) {
          const saved = localStorage.getItem("sankalp_preferred_camera");
          const savedExists = videoInputs.some((d) => d.deviceId === saved);

          if (saved && savedExists) {
            setSelectedDeviceId(saved);
          } else {
            const integrated = videoInputs.find((d) => {
              const label = (d.label || "").toLowerCase();
              return (
                (label.includes("integrated") ||
                  label.includes("internal") ||
                  label.includes("webcam") ||
                  label.includes("facetime") ||
                  label.includes("hd camera")) &&
                !label.includes("oppo") &&
                !label.includes("phone") &&
                !label.includes("link") &&
                !label.includes("virtual")
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
    }
    getDevices();
  }, []);

  // 2. Fetch challenge from backend
  const fetchChallenge = async () => {
    try {
      isSubmittingRef.current = false;
      stepRef.current = 1;
      setCurrentStep(1);
      setStep1Passed(false);
      setStep2Passed(false);
      setStep3Passed(false);
      setBlinkDetected(false);
      setStepTimeLeft(STEP_TIME_LIMIT);
      setErrorMsg("");

      const data = await apiRequest("/liveness/challenge", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });

      setChallenge(data);
      setStatus("waiting_action");
    } catch (err) {
      if (err.error === "rate_limited") {
        setErrorMsg("Too many attempts. Maximum 5 per 10 minutes. Please wait before retrying.");
      } else {
        setErrorMsg(err.message || "Failed to initiate challenge");
      }
      setStatus("completed_fail");
    }
  };

  // 3. Initialize or switch camera
  useEffect(() => {
    let active = true;

    async function initCamera() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      setStatus("camera_connecting");

      try {
        const constraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (active) {
              videoRef.current.play().then(() => {
                fetchChallenge();
              }).catch((e) => console.warn("Video play error:", e));
            }
          };
        }
      } catch (err) {
        console.warn("Camera init error:", err);
        setStatus("completed_fail");
        setErrorMsg("Camera busy or disconnected. Click 'Quick Demo Verification' below to proceed.");
      }
    }

    initCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [selectedDeviceId]);

  // 4. Per-step timer countdown (7s limit per step)
  useEffect(() => {
    let timer;
    if (status === "waiting_action" && stepTimeLeft > 0) {
      timer = setInterval(() => {
        setStepTimeLeft((prev) => {
          if (prev <= 1) {
            submitResult(false, `Timeout on step ${stepRef.current}`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, stepTimeLeft, currentStep]);

  // 5. Submit final challenge result to backend
  const submitResult = async (passed, failReason = null) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    try {
      if (challenge) {
        await apiRequest("/liveness/result", {
          method: "POST",
          body: JSON.stringify({
            challenge_id: challenge.challenge_id,
            code: challenge.code,
            result: passed ? "pass" : "fail",
            fail_reason: failReason,
          }),
        });
      }

      if (passed) {
        setStatus("completed_pass");
      } else {
        setStatus("completed_fail");
        setErrorMsg(failReason || "Verification failed");
      }
    } catch (err) {
      console.error("Submit result error:", err);
      setStatus("completed_fail");
      setErrorMsg(err.message || "Failed to record liveness result");
    }
  };

  const handleRedirectAfterPass = () => {
    if (clientId && redirectUri) {
      window.location.href = `${API_BASE}/sso/authorize?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    } else {
      navigate("/clubs", { replace: true });
    }
  };

  // 6. MediaPipe FaceMesh detection loop
  useEffect(() => {
    if (!window.FaceMesh) return;

    const faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults(onFaceMeshResults);
    faceMeshRef.current = faceMesh;

    let isProcessing = false;

    async function sendFrame() {
      if (
        videoRef.current &&
        videoRef.current.readyState >= 2 &&
        !isProcessing &&
        status === "waiting_action" &&
        !isSubmittingRef.current
      ) {
        isProcessing = true;
        try {
          await faceMesh.send({ image: videoRef.current });
        } catch (e) {
          // Frame dropped
        } finally {
          isProcessing = false;
        }
      }
      if (status === "waiting_action" && !isSubmittingRef.current) {
        animationFrameRef.current = requestAnimationFrame(sendFrame);
      }
    }

    if (status === "waiting_action") {
      animationFrameRef.current = requestAnimationFrame(sendFrame);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [status, challenge]);

  // Compute Eye Aspect Ratio (EAR)
  function computeEAR(p1, p2, p3, p4, p5, p6) {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const num = dist(p2, p6) + dist(p3, p5);
    const den = 2 * dist(p1, p4);
    return den === 0 ? 0 : num / den;
  }

  // 7. Step state machine
  const onFaceMeshResults = (results) => {
    if (isSubmittingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    // Landmark references
    const nose = landmarks[1];
    const leftEar = landmarks[234];
    const rightEar = landmarks[454];

    // Compute yaw ratio: asymmetry between left and right side of nose
    const distToLeft = Math.hypot(nose.x - leftEar.x, nose.y - leftEar.y);
    const distToRight = Math.hypot(nose.x - rightEar.x, nose.y - rightEar.y);
    const totalDist = distToLeft + distToRight;
    const yawRatio = totalDist === 0 ? 0.5 : distToLeft / totalDist;

    // Eye Aspect Ratio (EAR)
    const leftEAR = computeEAR(
      landmarks[33],
      landmarks[160],
      landmarks[158],
      landmarks[133],
      landmarks[153],
      landmarks[144]
    );
    const rightEAR = computeEAR(
      landmarks[362],
      landmarks[385],
      landmarks[387],
      landmarks[263],
      landmarks[373],
      landmarks[380]
    );
    const ear = (leftEAR + rightEAR) / 2;

    const activeStep = stepRef.current;

    // STEP 1: Head Turn
    if (activeStep === 1) {
      const targetTurn = challenge?.type || "turn_left";
      const isTurned = targetTurn === "turn_left" ? yawRatio > 0.62 : yawRatio < 0.38;

      if (isTurned) {
        setStep1Passed(true);
        stepRef.current = 2;
        setCurrentStep(2);
        setStepTimeLeft(STEP_TIME_LIMIT);
      }
    }
    // STEP 2: Return to Center
    else if (activeStep === 2) {
      const isCentered = yawRatio >= 0.42 && yawRatio <= 0.58;

      if (isCentered) {
        setStep2Passed(true);
        stepRef.current = 3;
        setCurrentStep(3);
        setStepTimeLeft(STEP_TIME_LIMIT);
      }
    }
    // STEP 3: Natural Blink
    else if (activeStep === 3) {
      if (ear < 0.19) {
        setBlinkDetected(true);
      } else if (blinkDetected && ear > 0.24) {
        setStep3Passed(true);
        submitResult(true);
      }
    }
  };

  const getStepHeadline = () => {
    if (currentStep === 1) {
      const dir = challenge?.type === "turn_left" ? "left" : "right";
      return `Turn head ${dir}`;
    } else if (currentStep === 2) {
      return "Return to center";
    } else {
      return "Blink twice";
    }
  };

  const getStepDescription = () => {
    if (currentStep === 1) {
      return "Turn your head to the side to prove natural 3D depth. A photo cannot do this.";
    } else if (currentStep === 2) {
      return "Look straight ahead towards the camera to confirm responsive control.";
    } else {
      return "Look at the camera and blink slowly. A printed photo or replay cannot do this.";
    }
  };

  const guideColor =
    status === "completed_pass"
      ? "#4FA58F"
      : status === "completed_fail"
        ? "#E0735A"
        : "#D9822B";

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#12171E",
      background: "#F3EFE7",
      display: "flex",
      flexDirection: "column"
    }}>
      {/* HEADER: Matches Camera.dc.html */}
      <header>
        <div style={{
          maxWidth: "1100px",
          margin: "0 auto",
          boxSizing: "border-box",
          padding: "24px 48px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="#B8651A" strokeWidth="2"></circle>
              <circle cx="16" cy="16" r="5" fill="#B8651A"></circle>
              <path d="M2 16h6M24 16h6" stroke="#B8651A" strokeWidth="2" strokeLinecap="round"></path>
            </svg>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "22px", fontWeight: 600 }}>
              Real Access
            </span>
          </div>

          <ol style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "13px",
            fontWeight: 500
          }}>
            <li style={{ display: "flex", alignItems: "center", gap: "8px", color: "#1F6B3F" }}>
              <span style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#1F6B3F",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2.5 7.5l3 3 6-6.5" stroke="#F5F1E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </span>
              Sign in
            </li>
            <li aria-hidden="true" style={{ width: "32px", height: "1px", background: "#B9B2A3" }}></li>
            <li aria-current="step" style={{ display: "flex", alignItems: "center", gap: "8px", color: "#12171E" }}>
              <span style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#12171E",
                color: "#F3EFE7",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px"
              }}>
                2
              </span>
              Camera check
            </li>
          </ol>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main style={{
        flex: 1,
        width: "100%",
        maxWidth: "1100px",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: "8px 48px 48px",
        display: "flex",
        flexDirection: "column",
        gap: "24px"
      }}>
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "48px",
          alignItems: "center",
          background: "#FBF9F4",
          border: "1px solid #DDD6C7",
          borderRadius: "20px",
          padding: "40px"
        }}>

          {/* LEFT: Camera Viewport */}
          <div style={{ flex: "1 1 400px", minWidth: "300px" }}>
            <div style={{
              position: "relative",
              width: "100%",
              aspectRatio: "4 / 3",
              background: "#12171E",
              borderRadius: "16px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)"
                }}
              />
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  transform: "scaleX(-1)"
                }}
              />

              {/* Dashed Oval Guide */}
              <div style={{
                position: "absolute",
                width: "46%",
                aspectRatio: "3 / 4",
                borderRadius: "50%",
                border: `3px dashed ${guideColor}`,
                pointerEvents: "none",
                transition: "border-color 0.3s ease"
              }}></div>

              {/* Status Pill Badge */}
              <div style={{
                position: "absolute",
                top: "14px",
                left: "14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                fontWeight: 500,
                color: "#F5F1E8",
                background: "rgba(18, 23, 30, 0.8)",
                borderRadius: "999px",
                padding: "6px 12px",
                zIndex: 5
              }}>
                <span style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: status === "camera_connecting" ? "#D9822B" : "#7FD1A0"
                }}></span>
                {status === "camera_connecting" ? "Connecting camera..." : "Camera on · this device only"}
              </div>
            </div>

            {/* Webcam selection if multiple cameras exist */}
            {videoDevices.length > 1 && (
              <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#5A6270" }}>
                <span>Webcam:</span>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const devId = e.target.value;
                    setSelectedDeviceId(devId);
                    localStorage.setItem("sankalp_preferred_camera", devId);
                  }}
                  style={{
                    flex: 1,
                    height: "30px",
                    padding: "0 8px",
                    borderRadius: "6px",
                    border: "1px solid #C4BCAF",
                    background: "#FDFBF7",
                    fontSize: "12px",
                    color: "#12171E"
                  }}
                >
                  {videoDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* RIGHT: Status & Instructions */}
          <div style={{ flex: "1 1 360px", minWidth: "300px", display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* VIEW 1: CHECKING IN PROGRESS */}
            {(status === "waiting_action" || status === "camera_connecting") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "2.2px", color: "#8A4A0F" }}>
                    CAMERA CHECK
                  </div>
                  <h1 style={{
                    margin: 0,
                    fontFamily: "'Newsreader', Georgia, serif",
                    fontWeight: 500,
                    fontSize: "48px",
                    lineHeight: 1.05,
                    color: "#12171E"
                  }}>
                    {getStepHeadline()}
                  </h1>
                  <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.55, color: "#5A6270" }}>
                    {getStepDescription()}
                  </p>
                </div>

                {/* Step Progress Segments */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 500, color: "#12171E" }}>
                    <span>Step {currentStep} of 3</span>
                    <span style={{ color: "#5A6270" }}>
                      {currentStep === 1 ? "Turn Head" : currentStep === 2 ? "Center Face" : "Natural Blink"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1, height: "8px", borderRadius: "4px", background: currentStep >= 1 ? "#12171E" : "#DDD6C7" }}></div>
                    <div style={{ flex: 1, height: "8px", borderRadius: "4px", background: currentStep >= 2 ? "#12171E" : "#DDD6C7" }}></div>
                    <div style={{ flex: 1, height: "8px", borderRadius: "4px", background: currentStep >= 3 ? "#12171E" : "#DDD6C7" }}></div>
                  </div>
                </div>

                {/* Countdown */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#5A6270" }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="10" r="7.5" stroke="#5A6270" strokeWidth="1.5"></circle>
                    <path d="M10 5.5V10l3 2" stroke="#5A6270" strokeWidth="1.5" strokeLinecap="round"></path>
                  </svg>
                  <span>This step expires in {stepTimeLeft} seconds</span>
                </div>

                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px", fontSize: "13.5px", color: "#4A5260" }}>
                  <li>&bull; Face the light and keep your face inside the oval.</li>
                  <li>&bull; Take off glasses if they reflect the screen.</li>
                </ul>

                {/* Clean Demo Actions (Zero AI icons) */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", paddingTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => submitResult(true)}
                    style={{
                      height: "44px",
                      padding: "0 22px",
                      background: "#12171E",
                      color: "#F5F1E8",
                      border: 0,
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Quick Demo Verification
                  </button>
                  <button
                    type="button"
                    onClick={() => submitResult(false, "Simulated still photo check failure")}
                    style={{
                      height: "44px",
                      padding: "0 18px",
                      background: "transparent",
                      color: "#9B3A22",
                      border: "1px solid #DDD6C7",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer"
                    }}
                  >
                    Test Photo Fail
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 2: PASSED */}
            {status === "completed_pass" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <h1 style={{
                    margin: 0,
                    fontFamily: "'Newsreader', Georgia, serif",
                    fontWeight: 500,
                    fontSize: "48px",
                    lineHeight: 1.05,
                    color: "#12171E"
                  }}>
                    You are verified
                  </h1>
                  <p style={{ margin: 0, fontSize: "16px", lineHeight: 1.55, color: "#5A6270" }}>
                    Thank you. Only the result is saved. Your video was never sent anywhere.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRedirectAfterPass}
                  style={{
                    alignSelf: "flex-start",
                    height: "48px",
                    padding: "0 28px",
                    display: "flex",
                    alignItems: "center",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#F5F1E8",
                    background: "#12171E",
                    borderRadius: "8px",
                    border: 0,
                    cursor: "pointer"
                  }}
                >
                  Open my clubs
                </button>
              </div>
            )}

            {/* VIEW 3: FAILED */}
            {status === "completed_fail" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#F6DDD4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="#9B3A22" strokeWidth="2.2" strokeLinecap="round"></path>
                  </svg>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <h1 style={{
                    margin: 0,
                    fontFamily: "'Newsreader', Georgia, serif",
                    fontWeight: 500,
                    fontSize: "44px",
                    lineHeight: 1.08,
                    color: "#12171E"
                  }}>
                    We could not confirm that
                  </h1>
                  <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.55, color: "#5A6270" }}>
                    {errorMsg || "The check timed out. Move to a brighter spot and try again."}
                  </p>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px" }}>
                  <button
                    type="button"
                    onClick={fetchChallenge}
                    style={{
                      height: "46px",
                      padding: "0 28px",
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#F5F1E8",
                      background: "#12171E",
                      border: 0,
                      borderRadius: "8px",
                      cursor: "pointer"
                    }}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => submitResult(true)}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: "14px",
                      color: "#12171E",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                      cursor: "pointer"
                    }}
                  >
                    Quick Demo Verification
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Privacy Note */}
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              paddingTop: "20px",
              borderTop: "1px solid #E6E0D2"
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
                <path d="M10 2l6 2.5v4.7c0 3.9-2.5 7-6 8.3-3.5-1.3-6-4.4-6-8.3V4.5L10 2z" stroke="#5A6270" strokeWidth="1.5" strokeLinejoin="round"></path>
              </svg>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.55, color: "#5A6270" }}>
                Your video stays in this browser and is never uploaded. Only pass or fail is stored.
              </p>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
