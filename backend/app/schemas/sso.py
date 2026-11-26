"""
Pydantic Schemas for OAuth 2.0 / SSO Operations.
"""
from typing import Optional
from pydantic import BaseModel


class AuthorizeCodeRequest(BaseModel):
    client_id: str
    redirect_uri: str
    state: Optional[str] = None
    code_challenge: Optional[str] = None
    code_challenge_method: Optional[str] = "S256"


class TokenRequest(BaseModel):
    grant_type: str = "authorization_code"
    code: str
    client_id: str
    client_secret: str
    code_verifier: Optional[str] = None
    redirect_uri: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str
    client_id: str
    client_secret: str


class IntrospectRequest(BaseModel):
    token: str
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


class RevokeRequest(BaseModel):
    token: str
    token_type_hint: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
