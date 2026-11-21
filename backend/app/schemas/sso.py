"""
Pydantic Schemas for OAuth 2.0 / SSO Operations.
"""
from pydantic import BaseModel

class TokenRequest(BaseModel):
    grant_type: str = "authorization_code"
    code: str
    client_id: str
    client_secret: str

class RefreshRequest(BaseModel):
    refresh_token: str
    client_id: str
    client_secret: str
