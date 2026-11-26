"""
Pydantic Schemas for Active Physical Liveness Verification.
"""
from typing import Optional
from pydantic import BaseModel


class ChallengeRequest(BaseModel):
    user_id: Optional[str] = None
    login_ticket: Optional[str] = None


class ResultRequest(BaseModel):
    challenge_id: str
    code: str
    passed: bool
    fail_reason: Optional[str] = None
    live_frame: Optional[str] = None
    login_ticket: Optional[str] = None
