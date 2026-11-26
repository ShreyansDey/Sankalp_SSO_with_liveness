"""
Pydantic Schemas for Administrator Operations.
"""
from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


class CreateInviteRequest(BaseModel):
    email: str
    role: str = "member"
    term_end: Optional[date] = None


class DisableRequest(BaseModel):
    reason: str = "admin"


class CreateProductRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    redirect_uri: str = Field(..., min_length=5, max_length=500)
    allowed_origins: Optional[str] = None
    api_only: bool = False


class RejectApplicationRequest(BaseModel):
    reason: Optional[str] = None


class RenewalActionRequest(BaseModel):
    notes: Optional[str] = None


class AddAdminFaceRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    face_photo: str


class ToggleRestrictionRequest(BaseModel):
    enforce: bool


class VerifyDisableOtpRequest(BaseModel):
    otp: str = Field(..., min_length=4, max_length=12)
