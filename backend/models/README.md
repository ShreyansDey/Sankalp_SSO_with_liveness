# Pre-trained Biometric Neural Network Models

This directory stores offline ONNX neural network model weights used by the computer vision biometric engine (`backend/app/services/face_engine.py`):

1. **`face_detection_yunet_2023mar.onnx`**
   - **Role:** High-speed, lightweight face detector (OpenCV YuNet).
   - **Input:** 320x320 RGB/BGR photographic frame.
   - **Output:** Bounding boxes, confidence score, and 5 facial landmark keypoints (eyes, nose, mouth corners).
   - **Latency:** ~5ms on standard CPU.

2. **`face_recognition_sface_2021dec.onnx`**
   - **Role:** Deep facial feature embedding extraction (OpenCV SFace).
   - **Input:** Cropped and aligned face snapshot.
   - **Output:** 128-dimensional L2 unit-normalized mathematical feature vector.
   - **Latency:** ~20-25ms on standard CPU.
   - **Comparison:** 1:1 Cosine Similarity verification (calibrated threshold $\ge 0.40$).

> [!NOTE]
> Database ORM models (`User`, `Product`, `Invite`, etc.) are located separately in `backend/app/models.py`.
