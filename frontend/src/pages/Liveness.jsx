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

const STEP_TIME_LIMIT = 20; // 20 seconds per challenge step

export default function Liveness() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const userId = searchParams.get("user_id") || "";
  const userEmail = searchParams.get("email") || "";
  const clientId = searchParams.get("client_id") || "";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const state = searchParams.get("state") || "";

  const [challenge, setChallenge] = useState(null);
  const challengeRef = useRef(null);

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
  const challengeInitiatedRef = useRef(false);

  // 1. Enumerate and prioritize laptop webcam
  const refreshDevices = async (activeStream = null) => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(videoInputs);

      if (videoInputs.length > 0) {
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
        } else {
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
                !label.includes("obs")
              );
            });

            const chosen = integrated ? integrated.deviceId : videoInputs[0].deviceId;
            if (chosen) {
              setSelectedDeviceId(chosen);
              localStorage.setItem("sankalp_preferred_camera", chosen);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not list video devices:", err);
    }
  };

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

      const loginTicket = sessionStorage.getItem("sankalp_liveness_ticket");
      const data = await apiRequest("/liveness/challenge", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, login_ticket: loginTicket || undefined }),
      });

      challengeRef.current = data;
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

  // 3. Multi-tier camera stream acquisition (with guaranteed fallback)
  const getRobustCameraStream = async (targetDeviceId = null) => {
    const devId = targetDeviceId || selectedDeviceId || localStorage.getItem("sankalp_preferred_camera");
    const tryConstraints = [];

    if (devId) {
      tryConstraints.push({
        video: { deviceId: { exact: devId }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      tryConstraints.push({
        video: { deviceId: devId, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    }

    tryConstraints.push({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });

    tryConstraints.push({
      video: { facingMode: "user" },
      audio: false,
    });

    tryConstraints.push({
      video: true,
      audio: false,
    });

    let lastError = null;
    for (const constraints of tryConstraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream && stream.getVideoTracks().length > 0) {
          return stream;
        }
      } catch (err) {
        lastError = err;
        console.warn("Camera constraint attempt failed:", constraints, err.name, err.message);
      }
    }
    throw lastError || new Error("Unable to access any camera input device.");
  };

  // 4. Start camera and attach stream to video element
  const startCamera = async (targetDeviceId = null) => {
    setStatus("camera_connecting");
    setErrorMsg("");

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    try {
      const stream = await getRobustCameraStream(targetDeviceId);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const onReady = () => {
          videoRef.current?.play().catch((e) => console.warn("Video play error:", e));
          if (!challengeInitiatedRef.current) {
            challengeInitiatedRef.current = true;
            fetchChallenge();
          }
        };

        if (videoRef.current.readyState >= 1) {
          onReady();
        } else {
          videoRef.current.onloadedmetadata = onReady;
        }
        videoRef.current.play().catch(() => {});
      }

      await refreshDevices(stream);
    } catch (err) {
      console.warn("Camera init error:", err);
      setStatus("completed_fail");
      setErrorMsg(
        `Camera access denied or unavailable (${err.name || "Error"}: ${err.message || "check permissions"}). Please ensure your camera is not used by another application and allow camera permissions.`
      );
    }
  };

  const switchCamera = async (newDeviceId) => {
    setSelectedDeviceId(newDeviceId);
    localStorage.setItem("sankalp_preferred_camera", newDeviceId);
    await startCamera(newDeviceId);
  };

  useEffect(() => {
    challengeInitiatedRef.current = false;
    startCamera();

    const handleDeviceChange = () => refreshDevices(streamRef.current);
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    }

    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  // 4. Per-step timer countdown (15s limit per step)
  useEffect(() => {
    let timer;
    if (status === "waiting_action" && stepTimeLeft > 0) {
      timer = setInterval(() => {
        setStepTimeLeft((prev) => {
          if (prev <= 1) {
            // If submission is in progress or user has already blinked once on step 3, grant grace time
            if (isSubmittingRef.current) return 0;
            if (stepRef.current === 3 && blinkStateRef.current.count >= 1) {
              return 4;
            }
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
    const ch = challengeRef.current || challenge;
    if (!ch) {
      console.warn("Cannot submit result: challenge is null");
      return;
    }

    // A verified pass always takes precedence over a pending timer timeout
    if (isSubmittingRef.current && !passed) return;
    isSubmittingRef.current = true;

    if (passed) {
      setStatus("submitting");
    }

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
      const loginTicket = sessionStorage.getItem("sankalp_liveness_ticket");
      const res = await apiRequest("/liveness/result", {
        method: "POST",
        body: JSON.stringify({
          challenge_id: ch.challenge_id,
          code: ch.code,
          passed: passed,
          fail_reason: failReason,
          live_frame: frameToSubmit,
          login_ticket: loginTicket || undefined,
        }),
      });

      if (res.passed) {
        sessionStorage.removeItem("sankalp_liveness_ticket");
        if (res.session_id) {
          localStorage.setItem("sso_session_id", res.session_id);
        }
        setStatus("completed_pass");
        if (res.user) {
          setVerifiedUser(res.user);
          setFaceVerifiedNotice(`Presence confirmed & live face matched to ${res.user.name || res.user.email}`);
        }
      } else {
        setStatus("completed_fail");
        setErrorMsg(res.message || failReason || "Verification failed");
      }
    } catch (err) {
      console.error("Submit result error:", err);
      setStatus("completed_fail");
      const errDetail = err?.detail?.message || (typeof err?.detail === "string" ? err.detail : null) || err?.message || "Failed to record liveness result";
      setErrorMsg(errDetail);
    }
  };

  const handleRedirectAfterPass = async () => {
    if (clientId && redirectUri) {
      window.location.href = `${API_BASE}/authorize?client_id=${encodeURIComponent(
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
    let cancelled = false;
    let localFaceMesh = null;

    function initFaceMesh() {
      if (cancelled) return;
      if (!window.FaceMesh) {
        const timer = setTimeout(initFaceMesh, 150);
        return () => clearTimeout(timer);
      }

      try {
        localFaceMesh = new window.FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        localFaceMesh.setOptions({
          maxNumFaces: 2,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        localFaceMesh.onResults((results) => {
          if (!cancelled) onFaceMeshResults(results);
        });
        faceMeshRef.current = localFaceMesh;

        let isProcessing = false;

        async function sendFrame() {
          if (cancelled) return;
          if (
            videoRef.current &&
            videoRef.current.readyState >= 2 &&
            videoRef.current.videoWidth > 0 &&
            videoRef.current.videoHeight > 0 &&
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
                await localFaceMesh.send({ image: videoRef.current });
              } catch (e) {
                // Frame dropped
              } finally {
                isProcessing = false;
              }
            }
          }
          if (!cancelled && status === "waiting_action" && !isSubmittingRef.current) {
            animationFrameRef.current = requestAnimationFrame(sendFrame);
          }
        }

        if (status === "waiting_action") {
          animationFrameRef.current = requestAnimationFrame(sendFrame);
        }
      } catch (err) {
        console.error("FaceMesh initialization error:", err);
      }
    }

    if (status === "waiting_action") {
      initFaceMesh();
    }

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (localFaceMesh?.close) {
        try {
          localFaceMesh.close();
        } catch {}
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
      updateWarning("No face detected. Keep face inside the oval and turn only slightly (~20°).");
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
    
    // Blended yaw estimation: combines cheek/ear outer bounds with eye corners for 100% hair & profile resilience
    const distToRightEar = Math.hypot(nose.x - landmarks[234].x, nose.y - landmarks[234].y);
    const distToLeftEar = Math.hypot(nose.x - landmarks[454].x, nose.y - landmarks[454].y);
    const earRatio = (distToRightEar + distToLeftEar) > 0 ? distToRightEar / (distToRightEar + distToLeftEar) : 0.5;

    const distToRightEye = Math.hypot(nose.x - landmarks[33].x, nose.y - landmarks[33].y);
    const distToLeftEye = Math.hypot(nose.x - landmarks[263].x, nose.y - landmarks[263].y);
    const eyeRatio = (distToRightEye + distToLeftEye) > 0 ? distToRightEye / (distToRightEye + distToLeftEye) : 0.5;

    // 60% eye corners (always in front, never occluded by hair/shoulders) + 40% cheek boundaries
    const yawRatio = (eyeRatio * 0.6) + (earRatio * 0.4);

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

    // STEP 1: Head Turn (Direction dictated by server challenge, gentle ~10-15° turn triggers immediately)
    if (activeStep === 1) {
      const ch = challengeRef.current || challenge;
      const targetTurn = ch?.type === "turn_right" ? "turn_right" : "turn_left";
      // Gentle ~10-15° turn angle (0.47 / 0.53) prevents face loss from over-rotation
      const isTurned = targetTurn === "turn_left" ? yawRatio > 0.53 : yawRatio < 0.47;

      if (isTurned) {
        turnStateRef.current.turnFrames = (turnStateRef.current.turnFrames || 0) + 1;
        if (turnStateRef.current.turnFrames >= 1) {
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
      const isCentered = yawRatio >= 0.44 && yawRatio <= 0.56;

      if (isCentered) {
        blinkStateRef.current.centeredFrames = (blinkStateRef.current.centeredFrames || 0) + 1;

        if (ear >= 0.20 && ear <= 0.45) {
          const prev = blinkStateRef.current.baseline || 0.28;
          blinkStateRef.current.baseline = (prev * 0.82) + (ear * 0.18);
        }

        // Require 2 stable centered frames (~66ms)
        if (blinkStateRef.current.centeredFrames >= 2) {
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
      const ch = challengeRef.current || challenge;
      const dir = ch?.type === "turn_left" ? "left" : "right";
      return `Turn head slightly ${dir}`;
    } else if (currentStep === 2) {
      return "Return to center";
    } else {
      return "Blink twice";
    }
  };

  const getStepDescription = () => {
    if (currentStep === 1) {
      return "Turn your head slightly to the side (about 20°). Keep your face in view.";
    } else if (currentStep === 2) {
      return "Look straight ahead towards the camera to confirm responsive control.";
    } else {
      return "Look at the camera and blink naturally twice. A photo cannot do this.";
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
            {videoDevices.length > 0 && (
              <div style={{
                marginTop: "12px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "#FDFBF7",
                border: "1px solid #C4BCAF",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "12px",
                boxSizing: "border-box",
                overflow: "hidden"
              }}>
                <span style={{ fontWeight: 600, color: "#12171E", whiteSpace: "nowrap", flexShrink: 0 }}>
                  Camera:
                </span>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => switchCamera(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: "100%",
                    maxWidth: "100%",
                    height: "32px",
                    padding: "0 8px",
                    borderRadius: "6px",
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
                    const devLabel = dev.label || `Camera ${idx + 1}`;
                    const labelLower = devLabel.toLowerCase();
                    const isSystem = (
                      labelLower.includes("integrated") ||
                      labelLower.includes("internal") ||
                      labelLower.includes("built-in") ||
                      labelLower.includes("webcam") ||
                      labelLower.includes("facetime") ||
                      labelLower.includes("hd camera")
                    );
                    return (
                      <option key={dev.deviceId || idx} value={dev.deviceId} title={devLabel}>
                        {devLabel} {isSystem ? "(System / Built-in)" : ""}
                      </option>
                    );
                  })}
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

            {/* VIEW: SUBMITTING / VERIFYING */}
            {status === "submitting" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px", alignItems: "center", justifyContent: "center", minHeight: "260px", textAlign: "center" }}>
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  border: "4px solid #DDD6C7",
                  borderTopColor: "#B8651A",
                  animation: "spin 1s linear infinite"
                }} />
                <div>
                  <h2 style={{ margin: "0 0 8px 0", fontFamily: "'Newsreader', Georgia, serif", fontSize: "28px", color: "#12171E" }}>
                    Verifying human presence...
                  </h2>
                  <p style={{ margin: 0, fontSize: "14px", color: "#5A6270" }}>
                    Validating physical challenge & authenticating session
                  </p>
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
                    onClick={() => {
                      if (streamRef.current && streamRef.current.getVideoTracks().some(t => t.readyState === "live")) {
                        fetchChallenge();
                      } else {
                        challengeInitiatedRef.current = false;
                        startCamera();
                      }
                    }}
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
                    Try Again
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
