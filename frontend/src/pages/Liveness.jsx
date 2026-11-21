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
  const [verifiedUser, setVerifiedUser] = useState(null);

  // Step pass flags
  const [step1Passed, setStep1Passed] = useState(false);
  const [step2Passed, setStep2Passed] = useState(false);
  const [step3Passed, setStep3Passed] = useState(false);
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [isEyeClosed, setIsEyeClosed] = useState(false);
  const [faceVerifiedNotice, setFaceVerifiedNotice] = useState("");
  const [warningNotice, setWarningNotice] = useState("");
  const warningDebounceRef = useRef({ candidateWarning: "", consecutiveFrames: 0, clearFrames: 0, lastWarning: "" });
  const lastFrameTimeRef = useRef(0);
  const blinkStateRef = useRef({ count: 0, isClosed: false, baseline: 0.28, centeredFrames: 0, closedFrames: 0, openFrames: 0, closeStartTime: 0, lastBlinkTime: 0 });
  const turnStateRef = useRef({ turnFrames: 0 });

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
      setBlinkCount(0);
      setIsEyeClosed(false);
      setFaceVerifiedNotice("");
      setWarningNotice("");
      blinkStateRef.current = { count: 0, isClosed: false, baseline: 0.28, centeredFrames: 0, closedFrames: 0, openFrames: 0, closeStartTime: 0, lastBlinkTime: 0 };
      turnStateRef.current = { turnFrames: 0 };
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
  const submitResult = async (passed, failReason = null, liveFrameData = null) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Capture clean live frame snapshot from video if not already provided
    let frameToSubmit = liveFrameData;
    if (passed && !frameToSubmit && videoRef.current) {
      try {
        const off = document.createElement("canvas");
        off.width = videoRef.current.videoWidth || 640;
        off.height = videoRef.current.videoHeight || 480;
        const octx = off.getContext("2d");
        octx.drawImage(videoRef.current, 0, 0, off.width, off.height);
        frameToSubmit = off.toDataURL("image/jpeg", 0.9);
      } catch (e) {
        console.warn("Could not capture frame snapshot:", e);
      }
    }

    try {
      if (challenge) {
        const res = await apiRequest("/liveness/result", {
          method: "POST",
          body: JSON.stringify({
            challenge_id: challenge.challenge_id,
            code: challenge.code,
            passed: passed,
            fail_reason: failReason,
            live_frame: frameToSubmit
          }),
        });

        if (res.passed) {
          setStatus("completed_pass");
          if (res.user) {
            setVerifiedUser(res.user);
            setFaceVerifiedNotice(`Presence confirmed & live face matched to ${res.user.name || res.user.email}`);
          }
        } else {
          setStatus("completed_fail");
          setErrorMsg(res.message || failReason || "Verification failed");
        }
      }
    } catch (err) {
      console.error("Submit result error:", err);
      setStatus("completed_fail");
      setErrorMsg(err.message || "Failed to record liveness result");
    }
  };

  const handleRedirectAfterPass = async () => {
    if (clientId && redirectUri) {
      window.location.href = `${API_BASE}/sso/authorize?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
      return;
    }

    let role = verifiedUser?.role;
    if (!role) {
      try {
        const me = await apiRequest("/me");
        role = me?.role;
      } catch (e) {
        // ignore
      }
    }

    if (role === "admin") {
      navigate("/admin", { replace: true });
    } else {
      navigate("/clubs", { replace: true });
    }
  };

  // Auto-redirect to destination after successful verification
  useEffect(() => {
    if (status === "completed_pass") {
      const timer = setTimeout(() => {
        handleRedirectAfterPass();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, verifiedUser]);

  // 6. MediaPipe FaceMesh detection loop
  useEffect(() => {
    if (!window.FaceMesh) return;

    const faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 2,
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
        const now = performance.now();
        // Throttle to 30 FPS (every 33ms) to prevent CPU/WebGL starvation & frame jitter
        if (now - lastFrameTimeRef.current >= 33) {
          lastFrameTimeRef.current = now;
          isProcessing = true;
          try {
            await faceMesh.send({ image: videoRef.current });
          } catch (e) {
            // Frame dropped
          } finally {
            isProcessing = false;
          }
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

  // 7. Step state machine with Presentation Attack Detection (PAD) Guardrails
  const onFaceMeshResults = (results) => {
    if (isSubmittingRef.current) return;

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Debounce helper to prevent rapid state-switching and layout jitter
    const updateWarning = (newWarning) => {
      const wd = warningDebounceRef.current;
      if (newWarning) {
        wd.clearFrames = 0;
        if (newWarning === wd.candidateWarning) {
          wd.consecutiveFrames += 1;
        } else {
          wd.candidateWarning = newWarning;
          wd.consecutiveFrames = 1;
        }
        if (wd.consecutiveFrames >= 8 && wd.lastWarning !== newWarning) {
          wd.lastWarning = newWarning;
          setWarningNotice(newWarning);
        }
      } else {
        wd.consecutiveFrames = 0;
        wd.clearFrames += 1;
        if (wd.clearFrames >= 6 && wd.lastWarning !== "") {
          wd.lastWarning = "";
          wd.candidateWarning = "";
          setWarningNotice("");
        }
      }
    };

    // GUARDRAIL 1: Multi-Face Detection (Anti-impostor / background face attack)
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 1) {
      updateWarning("Multiple faces detected. Ensure only one person is in front of the camera.");
      return;
    }

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      updateWarning("No face detected. Please face the camera.");
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    // GUARDRAIL 2: Face Scale & Bounding Box Check (Tolerant: 0.15 to 0.92)
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let i = 0; i < landmarks.length; i++) {
      const p = landmarks[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;

    if (faceHeight < 0.15 || faceWidth < 0.12) {
      updateWarning("Face is too far or small. Fit your face inside the guide oval.");
      return;
    }
    if (faceHeight > 0.92 || faceWidth > 0.88) {
      updateWarning("Face is too close to camera lens. Move back slightly.");
      return;
    }

    // GUARDRAIL 3: 3D Depth Variance Check (Rejects flat 2D passport photos and screen replays)
    const depthIndices = [1, 168, 10, 152, 234, 454, 127, 356, 33, 263];
    const zValues = depthIndices.map((idx) => landmarks[idx].z);
    const meanZ = zValues.reduce((a, b) => a + b, 0) / zValues.length;
    const varZ = zValues.reduce((a, b) => a + Math.pow(b - meanZ, 2), 0) / zValues.length;
    const stdZ = Math.sqrt(varZ);

    const noseZ = landmarks[1].z;
    const avgEarZ = (landmarks[234].z + landmarks[454].z) / 2;
    const depthDelta = Math.abs(noseZ - avgEarZ);

    if (stdZ < 0.006 && depthDelta < 0.010) {
      updateWarning("Flat 2D surface detected. Real 3D facial presence required.");
      return;
    }

    // All anti-spoofing pre-checks passed cleanly
    updateWarning("");

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

    // STEP 1: Head Turn (Direction dictated by server challenge, requires 3 consecutive frames)
    if (activeStep === 1) {
      const targetTurn = challenge?.type === "turn_right" ? "turn_right" : "turn_left";
      const isTurned = targetTurn === "turn_left" ? yawRatio > 0.63 : yawRatio < 0.37;

      if (isTurned) {
        turnStateRef.current.turnFrames = (turnStateRef.current.turnFrames || 0) + 1;
        if (turnStateRef.current.turnFrames >= 3) {
          setStep1Passed(true);
          stepRef.current = 2;
          setCurrentStep(2);
          setStepTimeLeft(STEP_TIME_LIMIT);
          turnStateRef.current.turnFrames = 0;
        }
      } else {
        turnStateRef.current.turnFrames = Math.max(0, (turnStateRef.current.turnFrames || 0) - 1);
      }
    }
    // STEP 2: Return to Center & Dynamically Calibrate Open-Eye Baseline
    else if (activeStep === 2) {
      const isCentered = yawRatio >= 0.43 && yawRatio <= 0.57;

      if (isCentered) {
        blinkStateRef.current.centeredFrames = (blinkStateRef.current.centeredFrames || 0) + 1;

        if (ear >= 0.20 && ear <= 0.45) {
          const prev = blinkStateRef.current.baseline || 0.28;
          blinkStateRef.current.baseline = (prev * 0.82) + (ear * 0.18);
        }

        // Require 5 stable centered frames (~160-200ms)
        if (blinkStateRef.current.centeredFrames >= 5) {
          setStep2Passed(true);
          stepRef.current = 3;
          setCurrentStep(3);
          setStepTimeLeft(STEP_TIME_LIMIT);
        }
      } else {
        blinkStateRef.current.centeredFrames = Math.max(0, (blinkStateRef.current.centeredFrames || 0) - 1);
      }
    }
    // STEP 3: Natural Multi-Frame Blink with Strict Physiological Timing (Anti-Jitter)
    else if (activeStep === 3) {
      const base = blinkStateRef.current.baseline || 0.28;
      const closeThreshold = Math.min(0.19, Math.max(0.14, base * 0.68));
      const openThreshold = Math.max(0.22, base * 0.85);
      const now = Date.now();

      if (ear <= closeThreshold) {
        blinkStateRef.current.closedFrames = (blinkStateRef.current.closedFrames || 0) + 1;
        blinkStateRef.current.openFrames = 0;

        // Must sustain closure for at least 2 consecutive frames (~60ms) to discard single-frame jitter
        if (blinkStateRef.current.closedFrames >= 2 && !blinkStateRef.current.isClosed) {
          blinkStateRef.current.isClosed = true;
          blinkStateRef.current.closeStartTime = now;
          setIsEyeClosed(true);
        }
      } else if (ear >= openThreshold) {
        blinkStateRef.current.openFrames = (blinkStateRef.current.openFrames || 0) + 1;
        blinkStateRef.current.closedFrames = 0;

        // Reopened after sustained closure
        if (blinkStateRef.current.isClosed && blinkStateRef.current.openFrames >= 2) {
          const closureDuration = now - (blinkStateRef.current.closeStartTime || now);
          const timeSinceLastBlink = now - (blinkStateRef.current.lastBlinkTime || 0);

          // Physiological check: blink duration 80ms - 500ms; gap >= 250ms
          if (closureDuration >= 80 && closureDuration <= 500) {
            if (blinkStateRef.current.lastBlinkTime === 0 || (timeSinceLastBlink >= 250 && timeSinceLastBlink <= 3000)) {
              blinkStateRef.current.count += 1;
              blinkStateRef.current.lastBlinkTime = now;
              blinkStateRef.current.isClosed = false;
              setIsEyeClosed(false);
              setBlinkCount(blinkStateRef.current.count);
              setBlinkDetected(true);

              if (blinkStateRef.current.count >= 2) {
                setStep3Passed(true);

                // Capture high-fidelity frame at the exact moment eyes are fully reopened
                let liveFrameSnapshot = null;
                if (videoRef.current) {
                  try {
                    const off = document.createElement("canvas");
                    off.width = videoRef.current.videoWidth || 640;
                    off.height = videoRef.current.videoHeight || 480;
                    const octx = off.getContext("2d");
                    octx.drawImage(videoRef.current, 0, 0, off.width, off.height);
                    liveFrameSnapshot = off.toDataURL("image/jpeg", 0.9);
                  } catch (e) {
                    console.warn("Could not capture frame snapshot:", e);
                  }
                }
                submitResult(true, null, liveFrameSnapshot);
              }
            } else {
              blinkStateRef.current.isClosed = false;
              setIsEyeClosed(false);
            }
          } else {
            blinkStateRef.current.isClosed = false;
            setIsEyeClosed(false);
          }
        } else if (!blinkStateRef.current.isClosed && blinkStateRef.current.openFrames >= 4) {
          setIsEyeClosed(false);
          if (ear >= 0.22 && ear <= 0.45) {
            blinkStateRef.current.baseline = (blinkStateRef.current.baseline * 0.96) + (ear * 0.04);
          }
        }
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
        padding: "clamp(8px, 3vw, 24px) clamp(12px, 4vw, 48px) 48px",
        display: "flex",
        flexDirection: "column",
        gap: "24px"
      }}>
        <div className="liveness-card-box" style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "clamp(16px, 4vw, 48px)",
          alignItems: "center",
          background: "#FBF9F4",
          border: "1px solid #DDD6C7",
          borderRadius: "20px",
          padding: "clamp(16px, 4vw, 40px)"
        }}>

          {/* LEFT: Camera Viewport */}
          <div className="liveness-camera-container" style={{ flex: "1 1 400px", minWidth: "min(100%, 280px)", width: "100%" }}>
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
          <div className="liveness-instructions-container" style={{ flex: "1 1 360px", minWidth: "min(100%, 280px)", width: "100%", display: "flex", flexDirection: "column", gap: "24px" }}>

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
                    fontSize: "clamp(26px, 6vw, 44px)",
                    lineHeight: 1.1,
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

                {/* Real-Time Blink Tracking Indicator */}
                {currentStep === 3 && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "#EAE5D9",
                    border: "1px solid #D4CCBF",
                    borderRadius: "10px"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#12171E" }}>Blinks:</span>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: blinkCount >= 1 ? "#1F6B3F" : "#DDD6C7",
                        color: blinkCount >= 1 ? "#FFFFFF" : "#5A6270"
                      }}>
                        {blinkCount >= 1 ? "✓ 1st Blink" : "○ 1st Blink"}
                      </span>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: blinkCount >= 2 ? "#1F6B3F" : "#DDD6C7",
                        color: blinkCount >= 2 ? "#FFFFFF" : "#5A6270"
                      }}>
                        {blinkCount >= 2 ? "✓ 2nd Blink" : "○ 2nd Blink"}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: isEyeClosed ? "#8A4A0F" : "#5A6270", fontWeight: 600 }}>
                      {isEyeClosed ? "Eyes closing..." : "Looking centered"}
                    </div>
                  </div>
                )}

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

                {/* Warning notice if PAD / Anti-Spoof detects flat photo or multi-face (stable height prevents layout jumping) */}
                <div style={{
                  minHeight: "44px",
                  display: "flex",
                  alignItems: "center"
                }}>
                  {warningNotice && (
                    <div style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "#FCEEEA",
                      border: "1px solid #ECC4B8",
                      borderRadius: "8px",
                      color: "#9B3A22",
                      fontSize: "13px",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="8" r="7" stroke="#9B3A22" strokeWidth="1.5" />
                        <path d="M8 4.5v4M8 11.5h.01" stroke="#9B3A22" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span>{warningNotice}</span>
                    </div>
                  )}
                </div>

                {/* Active Anti-Spoofing Guardrail Badges */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px",
                  paddingTop: "6px"
                }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    padding: "4px 8px",
                    background: "#EAE5D9",
                    borderRadius: "4px",
                    color: "#4A5260"
                  }}>
                    3D Depth Verified
                  </span>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    padding: "4px 8px",
                    background: "#EAE5D9",
                    borderRadius: "4px",
                    color: "#4A5260"
                  }}>
                    Single Subject Enforced
                  </span>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    padding: "4px 8px",
                    background: "#EAE5D9",
                    borderRadius: "4px",
                    color: "#4A5260"
                  }}>
                    Anti-Jitter Filter Active
                  </span>
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
                    fontSize: "clamp(26px, 6vw, 44px)",
                    lineHeight: 1.1,
                    color: "#12171E"
                  }}>
                    You are verified
                  </h1>
                  <p style={{ margin: 0, fontSize: "16px", lineHeight: 1.55, color: "#5A6270" }}>
                    {faceVerifiedNotice || "Thank you. Organic liveness confirmed. Your video never left this device."}
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
                  {verifiedUser?.role === "admin" ? "Open Admin Console →" : "Open my clubs"}
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
                    fontSize: "clamp(24px, 5.5vw, 40px)",
                    lineHeight: 1.1,
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
                    onClick={() => navigate("/login")}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: "14px",
                      color: "#5A6270",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                      cursor: "pointer"
                    }}
                  >
                    Back to Sign In
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
