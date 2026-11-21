"""
Sankalp SSO — Central Schemas Package
Re-exports all Pydantic request and response models across domains.
"""
from app.schemas.auth import (
    SignupRequest,
    ApplyRequest,
    RegisterRequest,
    LoginRequest,
    ForgotPasswordRequest,
    VerifyResetTokenRequest,
    ResetPasswordRequest,
    SubmitRenewalRequest,
)
from app.schemas.admin import (
    CreateInviteRequest,
    DisableRequest,
    CreateProductRequest,
    RenewalActionRequest,
)
from app.schemas.liveness import (
    ChallengeRequest,
    ResultRequest,
)
from app.schemas.sso import (
    TokenRequest,
    RefreshRequest,
)

__all__ = [
    "SignupRequest",
    "ApplyRequest",
    "RegisterRequest",
    "LoginRequest",
    "ForgotPasswordRequest",
    "VerifyResetTokenRequest",
    "ResetPasswordRequest",
    "SubmitRenewalRequest",
    "CreateInviteRequest",
    "DisableRequest",
    "CreateProductRequest",
    "RenewalActionRequest",
    "ChallengeRequest",
    "ResultRequest",
    "TokenRequest",
    "RefreshRequest",
]
