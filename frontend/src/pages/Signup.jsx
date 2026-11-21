import React from "react";
import Register from "./Register";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — SIGNUP ALIAS (DELEGATES TO REGISTER)
 * ==============================================================================
 * Signup is unified with the comprehensive Register page (e-KYC, camera check,
 * supporting document upload, and DPDP 2023 biometric consent).
 * ==============================================================================
 */
export default function Signup() {
  return <Register />;
}
