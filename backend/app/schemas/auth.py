"""
Pydantic Schemas for Authentication & User Registration.
"""
from typing import Optional
from pydantic import BaseModel, Field

class SignupRequest(BaseModel):
    invite_token: Optional[str] = None
    email: Optional[str] = None
    name: str = Field(..., min_length=1)
    phone: Optional[str] = None
    password: str = Field(..., min_length=8)
    consent_given: Optional[bool] = True

class ApplyRequest(BaseModel):
    invite_token: str
    name: str = Field(..., min_length=1)
    password: str = Field(..., min_length=8)
    face_photo: str  # Base64 data URL from webcam snapshot
    document_base64: Optional[str] = None  # Base64 supporting document (Student ID / letter)
    document_name: Optional[str] = None

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3)
    name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=1)
    password: str = Field(..., min_length=8)
    face_photo: str = Field(..., min_length=10)  # Base64 data URL from camera snapshot or image upload
    document_base64: str = Field(..., min_length=10)  # Base64 document
    document_name: Optional[str] = "supporting_document.pdf"
    consent_given: Optional[bool] = True
    invite_token: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    phone: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: str

class VerifyResetTokenRequest(BaseModel):
    token: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8)

class SubmitRenewalRequest(BaseModel):
    email: str
    reason: str
