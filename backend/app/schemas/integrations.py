"""
Pydantic Schemas for First-Time Superuser Bootstrap & Universal Integration API.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class ConfigurePrimaryKeyRequest(BaseModel):
    primary_key: str = Field(..., min_length=12, max_length=256)
    bootstrap_username: Optional[str] = Field(None, max_length=120)
    bootstrap_password: Optional[str] = Field(None, min_length=8, max_length=256)
    issue_api_key: bool = True
    api_key_name: str = Field("Initial Integration Key", min_length=2, max_length=120)
    scopes: List[str] = Field(default_factory=lambda: ["sso:read", "sso:write", "apps:manage"])


class BootstrapSuperuserRequest(BaseModel):
    primary_key: str = Field(..., min_length=1)
    bootstrap_username: Optional[str] = None
    bootstrap_password: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=256)
    issue_api_key: bool = True
    api_key_name: str = Field("Primary Super Admin Key", min_length=2, max_length=120)


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    scopes: List[str] = Field(default_factory=lambda: ["sso:read", "sso:write", "apps:manage"])
    expires_in_days: Optional[int] = Field(None, ge=1, le=3650)
    superuser_primary_key: Optional[str] = Field(None, min_length=12, max_length=256)
    bootstrap_username: Optional[str] = Field(None, max_length=120)
    bootstrap_password: Optional[str] = Field(None, min_length=8, max_length=256)


class IntegrationAppCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    redirect_uri: str = Field(..., min_length=5, max_length=500)
    allowed_origins: Optional[str] = None
    api_only: bool = False


class VerifyTokenPayload(BaseModel):
    token: str = Field(..., min_length=10)
