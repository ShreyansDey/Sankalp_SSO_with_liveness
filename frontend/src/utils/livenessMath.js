// MediaPipe Face Mesh landmark indices and geometric liveness helpers

export const LEFT_EYE = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

export function euclideanDist(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.hypot(dx, dy);
}

export function computeEAR(landmarks, eyeIndices) {
  const [p1, p2, p3, p4, p5, p6] = eyeIndices.map((idx) => landmarks[idx]);
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 1.0;
  const vertical1 = euclideanDist(p2, p6);
  const vertical2 = euclideanDist(p3, p5);
  const horizontal = euclideanDist(p1, p4);
  if (horizontal < 1e-6) return 1.0;
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

export function computeYawRatio(landmarks) {
  const noseTip = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  if (!noseTip || !leftCheek || !rightCheek) return 0;
  const midX = (leftCheek.x + rightCheek.x) / 2;
  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  if (faceWidth < 1e-6) return 0;
  return (noseTip.x - midX) / faceWidth;
}

export function captureVideoFrameBase64(videoEl) {
  if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
