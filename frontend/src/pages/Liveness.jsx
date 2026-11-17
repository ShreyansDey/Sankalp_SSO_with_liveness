import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest, API_BASE } from "../api";
import { Camera, CheckCircle2, XCircle, RotateCcw, AlertTriangle, ShieldCheck } from "lucide-react";

export default function Liveness() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const userId = searchParams.get("user_id") || "";
  const userEmail = searchParams.get("email") || "";
  const clientId = searchParams.get("client_id") || "";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const state = searchParams.get("state") || "";

  const [challenge, setChallenge] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [status, setStatus] = useState("loading"); // loading, waiting_action, completed_pass, completed_fail, camera_denied
  const [errorMsg, setErrorMsg] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [headTurned, setHeadTurned] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const faceMeshRef = useRef(null);

  // Request new challenge from backend
  const fetchChallenge = async () => {
    try {
      setStatus("loading");
      setErrorMsg("");
      setBlinkCount(0);
      setHeadTurned(false);
      setTimeLeft(30);

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

  useEffect(() => {
    fetchChallenge();
  }, [userId]);

  // Start webcam
  useEffect(() => {
    let active = true;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
        }
      } catch (err) {
        console.warn("Camera access denied or unavailable:", err);
        setCameraActive(false);
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
  }, []);

  // 30-second countdown timer
  useEffect(() => {
    if (status !== "waiting_action" || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, timeLeft]);

  // Handle timeout expiry
  const handleTimeExpired = async () => {
    if (status === "waiting_action") {
      submitResult(false, "Challenge expired after 30 seconds");
    }
  };

  // Submit result to backend
  const submitResult = async (passed, reason = "") => {
    if (!challenge) return;

    try {
      setStatus(passed ? "completed_pass" : "completed_fail");
      if (reason) setErrorMsg(reason);

      const res = await apiRequest("/liveness/result", {
        method: "POST",
        body: JSON.stringify({
          challenge_id: challenge.challenge_id,
          code: challenge.code,
          passed: passed,
        }),
      });

      if (passed && res.passed) {
        setTimeout(() => {
          if (clientId && redirectUri) {
            // Bounce to /authorize to issue code and redirect back to app
            window.location.href = `${API_BASE}/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
          } else {
            navigate("/admin");
          }
        }, 1500);
      }
    } catch (err) {
      setStatus("completed_fail");
      setErrorMsg(err.message || "Failed to submit liveness verification");
    }
  };

  // MediaPipe detection loop if MediaPipe is available in window
  useEffect(() => {
    if (!cameraActive || status !== "waiting_action" || !challenge) return;

    let isClosedEye = false;
    let localBlinks = 0;

    const onResults = (results) => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // Draw subtle mesh / face outline
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 1.5;

        // Draw facial bounding guide
        const nose = landmarks[1];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];

        if (challenge.type === "blink") {
          // Eye Aspect Ratio approx via landmarks 159 (top), 145 (bottom)
          const eyeDist = Math.abs(landmarks[159].y - landmarks[145].y);
          if (eyeDist < 0.018 && !isClosedEye) {
            isClosedEye = true;
          } else if (eyeDist > 0.025 && isClosedEye) {
            isClosedEye = false;
            localBlinks += 1;
            setBlinkCount(localBlinks);
            if (localBlinks >= 2) {
              submitResult(true);
            }
          }
        } else if (challenge.type === "turn_left") {
          // Nose moves right in mirrored canvas
          const yaw = nose.x - (leftEye.x + rightEye.x) / 2;
          if (yaw > 0.05) {
            setHeadTurned(true);
            submitResult(true);
          }
        } else if (challenge.type === "turn_right") {
          const yaw = nose.x - (leftEye.x + rightEye.x) / 2;
          if (yaw < -0.05) {
            setHeadTurned(true);
            submitResult(true);
          }
        }
      }
    };

    if (window.FaceMesh && videoRef.current) {
      try {
        const faceMesh = new window.FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        faceMesh.onResults(onResults);
        faceMeshRef.current = faceMesh;

        const processVideo = async () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            await faceMesh.send({ image: videoRef.current });
          }
          if (status === "waiting_action") {
            animationFrameRef.current = requestAnimationFrame(processVideo);
          }
        };
        processVideo();
      } catch (e) {
        console.warn("MediaPipe init error:", e);
      }
    }
  }, [cameraActive, status, challenge]);

  const getChallengeDescription = () => {
    if (!challenge) return "Preparing challenge...";
    switch (challenge.type) {
      case "blink":
        return "Please Blink Twice Slowly";
      case "turn_left":
        return "Turn Your Head Left";
      case "turn_right":
        return "Turn Your Head Right";
      default:
        return "Follow the on-screen prompt";
    }
  };

  return (
    <div className="auth-wrapper" style={{ maxWidth: "560px" }}>
      <div className="card">
        <div className="card-header" style={{ textAlign: "center", marginBottom: "16px" }}>
          <div style={{ display: "inline-flex", padding: "10px", background: "var(--primary-light)", borderRadius: "10px", color: "var(--primary)", marginBottom: "8px" }}>
            <ShieldCheck size={28} />
          </div>
          <h1 className="card-title" style={{ fontSize: "1.3rem" }}>Liveness Verification</h1>
          <p className="card-subtitle">
            Proving a real human is present. Only pass/fail is stored — video stays private in this browser.
          </p>
        </div>

        {/* Video & Camera Container */}
        <div className="camera-container">
          <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
          <canvas ref={canvasRef} width={640} height={480} className="camera-canvas" />

          <div className="camera-overlay">
            {/* Top countdown bar */}
            <div>
              <div className="countdown-bar">
                <div
                  className="countdown-progress"
                  style={{
                    width: `${(timeLeft / 30) * 100}%`,
                    background: timeLeft < 10 ? "var(--danger)" : "var(--primary)",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "0.75rem", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                <span>Code: <strong>{challenge?.code || "..."}</strong></span>
                <span>{timeLeft}s remaining</span>
              </div>
            </div>

            {/* Prompt */}
            {status === "waiting_action" && (
              <div className="challenge-prompt">
                🎯 {getChallengeDescription()}
                {challenge?.type === "blink" && (
                  <div style={{ fontSize: "0.8rem", marginTop: "4px", color: "#93c5fd" }}>
                    Blinks detected: {blinkCount} / 2
                  </div>
                )}
              </div>
            )}

            {/* Success state */}
            {status === "completed_pass" && (
              <div className="challenge-prompt" style={{ background: "rgba(22, 163, 74, 0.9)" }}>
                <CheckCircle2 size={24} style={{ display: "inline", verticalAlign: "middle", marginRight: "8px" }} />
                Real Person Verified! Creating session...
              </div>
            )}

            {/* Failure state */}
            {status === "completed_fail" && (
              <div className="challenge-prompt" style={{ background: "rgba(220, 38, 38, 0.9)" }}>
                <XCircle size={24} style={{ display: "inline", verticalAlign: "middle", marginRight: "8px" }} />
                Verification Failed: Still photo or time expired
              </div>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>{errorMsg}</div>
          </div>
        )}

        {/* Demo and Presentation Controls */}
        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "16px" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>
            Presentation & Test Controls (Demo Reliability)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "8px 12px", fontSize: "0.82rem" }}
              onClick={() => submitResult(true)}
              disabled={status !== "waiting_action"}
            >
              ✅ Pass Live Person
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "8px 12px", fontSize: "0.82rem", borderColor: "var(--danger)", color: "var(--danger)" }}
              onClick={() => submitResult(false, "Simulated still photo failed challenge")}
              disabled={status !== "waiting_action"}
            >
              ❌ Test Still Photo (Fail)
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchChallenge}
            disabled={status === "loading"}
          >
            <RotateCcw size={16} /> Request New Challenge
          </button>
          {status === "completed_fail" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => submitResult(true)} // Admin fallback mode
            >
              Admin Fallback Override
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
