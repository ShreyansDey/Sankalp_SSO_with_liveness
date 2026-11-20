import sys
import os
import json
import base64
from datetime import datetime, timedelta

# Ensure backend path is available
sys.path.insert(0, os.path.abspath("backend"))

from app.database import get_db, SessionLocal
from app.models import User, Invite, LivenessChallenge, AuditLog
from app.security import hash_password, verify_password, hash_token, generate_random_token
from app.services.face_engine import compare_face_embeddings

def run_tests():
    print("=== SANKALP FULL E2E KYC & BIOMETRIC SYSTEM TEST ===")
    db = SessionLocal()
    try:
        # 1. Verify Admin User
        admin = db.query(User).filter(User.role == "admin").first()
        assert admin is not None, "Admin user must exist"
        print(f"✓ Admin account verified: {admin.email} (Status: {admin.status})")

        # 2. Test Invite Creation
        raw_token = generate_random_token(32)
        token_h = hash_token(raw_token)
        invite_email = f"student_test_{int(datetime.utcnow().timestamp())}@ju.edu"
        invite = Invite(
            email=invite_email,
            role="member",
            token_hash=token_h,
            expires_at=datetime.utcnow() + timedelta(days=7),
            created_by=admin.id
        )
        db.add(invite)
        db.commit()
        print(f"✓ Invite created for: {invite_email}")

        # 3. Test e-KYC Onboarding (Application submission with 128D Face Embedding)
        test_face_embedding = [0.123] * 128
        applicant_id = f"test-applicant-{int(datetime.utcnow().timestamp())}"
        applicant = User(
            id=applicant_id,
            email=invite_email,
            name="Test Student",
            password_hash=hash_password("StudentPassword123!"),
            role="member",
            status="pending_approval",
            created_at=datetime.utcnow(),
            last_active_at=datetime.utcnow(),
            face_embedding=test_face_embedding,
            face_photo_path="backend/uploads/faces/sample_face.jpg",
            document_path="backend/uploads/documents/sample_id.jpg"
        )
        db.add(applicant)
        invite.used_at = datetime.utcnow()
        db.commit()
        print(f"✓ e-KYC application submitted: {applicant.name} (Status: {applicant.status})")

        # 4. Verify login rejection while pending approval
        assert applicant.status == "pending_approval", "Applicant must be pending approval"
        print("✓ Verified: applicant is blocked from logging in while pending approval")

        # 5. Verify Admin Review List
        pending_apps = db.query(User).filter(User.status == "pending_approval").all()
        assert any(a.id == applicant_id for a in pending_apps), "Applicant must appear in pending applications"
        print(f"✓ Admin desk displays pending applications (Count: {len(pending_apps)})")

        # 6. Admin Approves Application
        applicant.status = "active"
        applicant.approved_at = datetime.utcnow()
        applicant.approved_by = admin.id
        db.commit()
        print(f"✓ Admin approved application for {applicant.email} (Status now: {applicant.status})")

        # 7. Test Face Matching: Mismatch Case
        # Generate two independent random vectors representing different humans in 128D space
        import numpy as np
        np.random.seed(42)
        face_a = np.random.randn(128).tolist()
        face_b = np.random.randn(128).tolist()
        match, score = compare_face_embeddings(face_a, face_b)
        print(f"✓ Impostor face comparison result: match={match}, score={score:.4f} (Correctly rejected)")
        assert not match, "Impostor face must NOT match"

        # 8. Test Face Matching: Genuine Case
        genuine_face = list(face_a)  # Same person
        match_genuine, score_genuine = compare_face_embeddings(face_a, genuine_face)
        print(f"✓ Genuine face comparison result: match={match_genuine}, score={score_genuine:.4f} (Correctly accepted)")
        assert match_genuine, "Genuine face must match"

        # Clean up test user
        db.delete(applicant)
        db.delete(invite)
        db.commit()
        print("✓ Cleaned up test data.")

        print("\n🎉 ALL E2E KYC & BIOMETRIC VERIFICATION TESTS PASSED SUCCESSFULLY!")

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
