/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — FRONTEND API CLIENT
 * ==============================================================================
 * In plain words (Layman):
 *   This file is the telephone between our frontend pages (the screens students
 *   and admins see) and the backend server on port 8001. It makes sure every
 *   request automatically carries the student's secure session cookie so they
 *   stay logged in across pages.
 *
 * Technical Architecture:
 *   - Base URL: http://localhost:8001
 *   - Automatically includes `credentials: "include"` for HttpOnly cookie forwarding
 *   - Parses JSON payloads and handles network errors with structured error exceptions
 * ==============================================================================
 */

export const API_BASE = "http://localhost:8001";

export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders = {
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: "include", // Essential for HttpOnly sso_session cookie
  });

  let data = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorObj = typeof data === "object" && data !== null ? data : { message: data || response.statusText };
    throw errorObj;
  }

  return data;
}
