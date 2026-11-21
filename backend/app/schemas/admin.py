"""
Pydantic Schemas for Administrator Operations.
"""
from datetime import date
from typing import Optional
from pydantic import BaseModel

class CreateInviteRequest(BaseModel):
    email: str
    role: str = "member"
    term_end: Optional[date] = None

class DisableRequest(BaseModel):
    reason: str = "admin"

class CreateProductRequest(BaseModel):
    name: str
    redirect_uri: str

class RenewalActionRequest(BaseModel):
    notes: Optional[str] = None

class AddAdminFaceRequest(BaseModel):
    label: str
    face_photo: str

class ToggleRestrictionRequest(BaseModel):
    enforce: bool
