import React from "react";
import { Navigate } from "react-router-dom";

/**
 * Dedicated administrator bypass has been deprecated.
 * Administrators authenticate through /login and pass the camera liveness check.
 */
export default function AdminLogin() {
  return <Navigate to="/login" replace />;
}
