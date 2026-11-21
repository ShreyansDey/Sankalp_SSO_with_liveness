"""
Sankalp SSO — Biometric Face Recognition Engine
Powered by OpenCV YuNet (Face Detection) + SFace/ArcFace (Deep Feature Extraction).

Provides:
- 128-dimensional normalized facial embedding vectors
- High-speed inference (<30ms on standard CPU)
- 1:1 Cosine Similarity Verification
- Robust face cropping & alignment
"""

import os
import io
import base64
import logging
from pathlib import Path
from typing import Optional, List, Tuple, Union

try:
    import numpy as np
    import cv2
    from PIL import Image
    _CV2_AVAILABLE = True
except ImportError:
    _CV2_AVAILABLE = False
    np = None
    cv2 = None
    Image = None

logger = logging.getLogger("sankalp.face_engine")

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
YUNET_PATH = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = MODELS_DIR / "face_recognition_sface_2021dec.onnx"

# Calibration: SFace official cosine similarity threshold is 0.363.
# We set 0.40 for high confidence authentication while tolerating slight angle/light variation.
SIMILARITY_THRESHOLD = 0.40

_detector = None
_recognizer = None

def _get_models():
    """Lazy-load OpenCV YuNet and SFace models with fallback."""
    global _detector, _recognizer
    if not _CV2_AVAILABLE:
        return None, None
    if _detector is not None and _recognizer is not None:
        return _detector, _recognizer

    if not YUNET_PATH.exists() or not SFACE_PATH.exists():
        logger.warning("YuNet or SFace model files missing at %s", MODELS_DIR)
        return None, None

    try:
        # Default input size (320, 320) for detector
        _detector = cv2.FaceDetectorYN.create(
            str(YUNET_PATH),
            "",
            (320, 320),
            score_threshold=0.6,
            nms_threshold=0.3,
            top_k=5000
        )
        _recognizer = cv2.FaceRecognizerSF.create(str(SFACE_PATH), "")
        logger.info("Face recognition engine loaded successfully (YuNet + SFace).")
        return _detector, _recognizer
    except Exception as e:
        logger.error("Failed to initialize OpenCV face models: %s", e)
        return None, None


def is_face_engine_ready() -> bool:
    """Returns True if OpenCV and the YuNet/SFace models are loaded and ready."""
    d, r = _get_models()
    return d is not None and r is not None


def _decode_image_input(image_input: Union[str, bytes, object]) -> Optional[object]:
    """Normalize any image input (path, raw bytes, base64 data URL, PIL Image) into a BGR numpy array."""
    if not _CV2_AVAILABLE:
        return None
    try:
        # 1. Base64 Data URL (e.g. data:image/jpeg;base64,...)
        if isinstance(image_input, str):
            if image_input.startswith("data:image"):
                header, base64_data = image_input.split(",", 1)
                img_bytes = base64.b64decode(base64_data)
                nparr = np.frombuffer(img_bytes, np.uint8)
                return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            elif os.path.exists(image_input):
                return cv2.imread(image_input, cv2.IMREAD_COLOR)
            else:
                # Bare base64 string
                try:
                    img_bytes = base64.b64decode(image_input)
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    if img is not None:
                        return img
                except Exception:
                    pass
                return None

        # 2. Raw Bytes
        elif isinstance(image_input, bytes):
            nparr = np.frombuffer(image_input, np.uint8)
            return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 3. PIL Image
        elif isinstance(image_input, Image.Image):
            rgb = np.array(image_input.convert("RGB"))
            return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

        # 4. Numpy Array
        elif isinstance(image_input, np.ndarray):
            return image_input

    except Exception as e:
        logger.error("Error decoding image input: %s", e)
    return None


def extract_face_embedding(image_input: Union[str, bytes, object]) -> Optional[List[float]]:
    """
    Detects the primary face in an image, aligns it, and computes
    a normalized 128-dimensional deep feature embedding vector.
    Returns: List[float] of length 128, or None if no face detected.
    """
    if not _CV2_AVAILABLE:
        return None
    img = _decode_image_input(image_input)
    if img is None:
        return None

    detector, recognizer = _get_models()
    if detector is None or recognizer is None:
        logger.warning("Models not ready; cannot extract embedding")
        return None

    h, w = img.shape[:2]
    detector.setInputSize((w, h))

    try:
        _, faces = detector.detect(img)
        if faces is None or len(faces) == 0:
            # Try scaling down if the image is extremely large (e.g. 4K camera)
            if max(h, w) > 1280:
                scale = 1280 / max(h, w)
                resized = cv2.resize(img, (int(w * scale), int(h * scale)))
                detector.setInputSize((resized.shape[1], resized.shape[0]))
                _, faces = detector.detect(resized)
                if faces is not None and len(faces) > 0:
                    img = resized

        if faces is None or len(faces) == 0:
            logger.info("No face detected in input frame")
            return None

        # Pick the most prominent face (highest confidence score at index 14)
        best_face = max(faces, key=lambda f: f[14] if len(f) > 14 else f[2] * f[3])

        # Align and crop the face using SFace internal affine warp
        aligned_face = recognizer.alignCrop(img, best_face)

        # Extract deep 128-D feature vector
        feature = recognizer.feature(aligned_face)

        # Unit normalize feature vector for cosine similarity
        norm = np.linalg.norm(feature)
        if norm > 0:
            feature = feature / norm

        return feature.flatten().tolist()
    except Exception as e:
        logger.error("Error during face embedding extraction: %s", e)
        return None


def compare_face_embeddings(
    emb1: List[float],
    emb2: List[float],
    threshold: float = SIMILARITY_THRESHOLD
) -> Tuple[bool, float]:
    """
    Computes Cosine Similarity between two 128-D vectors.
    Returns: (is_match: bool, score: float)
    """
    if not emb1 or not emb2 or len(emb1) != len(emb2):
        return False, 0.0

    if not _CV2_AVAILABLE:
        dot = sum(a * b for a, b in zip(emb1, emb2))
        norm1 = sum(a * a for a in emb1) ** 0.5
        norm2 = sum(b * b for b in emb2) ** 0.5
        if norm1 == 0 or norm2 == 0:
            return False, 0.0
        similarity = float(dot / (norm1 * norm2))
        return similarity >= threshold, round(similarity, 4)

    try:
        v1 = np.array(emb1, dtype=np.float32)
        v2 = np.array(emb2, dtype=np.float32)

        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)

        if norm1 == 0 or norm2 == 0:
            return False, 0.0

        similarity = float(np.dot(v1, v2) / (norm1 * norm2))
        is_match = similarity >= threshold
        return is_match, round(similarity, 4)
    except Exception as e:
        logger.error("Error comparing face embeddings: %s", e)
        return False, 0.0


def verify_live_face_against_stored(
    live_image_input: Union[str, bytes, object],
    stored_embedding: List[float],
    threshold: float = SIMILARITY_THRESHOLD
) -> Tuple[bool, float, str]:
    """
    Convenience method for daily login:
    Extracts embedding from live webcam snapshot and compares it with user's approved embedding.
    Returns: (passed: bool, score: float, message: str)
    """
    if not stored_embedding:
        return False, 0.0, "No registered face embedding found on account"

    live_emb = extract_face_embedding(live_image_input)
    if live_emb is None:
        return False, 0.0, "Could not detect a clear face in the camera frame"

    is_match, score = compare_face_embeddings(live_emb, stored_embedding, threshold=threshold)
    if is_match:
        return True, score, f"Face match confirmed (confidence: {int(score * 100)}%)"
    else:
        return False, score, f"Face does not match registered member account (confidence: {int(score * 100)}% < {int(threshold * 100)}%)"


def verify_live_face_against_candidates(
    live_image_input: Union[str, bytes, object],
    candidates: List[List[float]],
    threshold: float = SIMILARITY_THRESHOLD
) -> Tuple[bool, float, str]:
    """
    Compares live frame against a list of authorized embeddings.
    Returns: (passed: bool, best_score: float, message: str)
    """
    if not candidates:
        return False, 0.0, "No authorized face embeddings registered."

    live_emb = extract_face_embedding(live_image_input)
    if live_emb is None:
        return False, 0.0, "Could not detect a clear face in the camera frame"

    best_score = -1.0
    for emb in candidates:
        if not emb:
            continue
        is_match, score = compare_face_embeddings(live_emb, emb, threshold=threshold)
        if score > best_score:
            best_score = score
        if is_match:
            return True, score, f"Administrator face match confirmed (confidence: {int(score * 100)}%)"

    return False, max(0.0, best_score), f"Face does not match any registered administrator profile (score: {int(best_score * 100)}% < {int(threshold * 100)}%)"

