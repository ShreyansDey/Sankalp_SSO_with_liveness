import React from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import Register from "./Register";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — ONBOARDING GATEWAY (/signup)
 * ==============================================================================
 * In plain words (Layman):
 *   Whether a student registers directly or clicks an invite link with a token,
 *   they are routed to the full institutional e-KYC registration page:
 *     1. Enter credentials / invite token
 *     2. Snap live webcam face portrait
 *     3. Upload supporting student document (PDF/Image)
 *     4. Grant DPDP Act 2023 biometric consent
 *     5. Application submitted to Admin Review ('pending_approval')
 * ==============================================================================
 */
export default function Signup() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  // If token is present, preserve it and open Register in invite mode
  return <Register />;
}
