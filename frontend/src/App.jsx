import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Register from "./pages/Register";
import Liveness from "./pages/Liveness";
import Admin from "./pages/Admin";
import Clubs from "./pages/Clubs";
import Signout from "./pages/Signout";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Renew from "./pages/Renew";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — FRONTEND APPLICATION ROUTER
 * ==============================================================================
 * In plain words (Layman):
 *   This file is the traffic cop of our web app. It looks at the website's address
 *   bar and displays the right page:
 *     - /login    -> Sign in with email and password
 *     - /signup   -> Accept an invite link to join
 *     - /liveness -> Camera check to prove a real person is present
 *     - /clubs    -> Your active campus clubs hub (launch any club with 1 click)
 *     - /admin    -> Admin dashboard (view members, run cleanup, instant access removal)
 *
 * Technical Architecture:
 *   - Client-side React Router 6
 *   - Unmatched paths automatically redirect to /login
 * ==============================================================================
 */

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/register" element={<Register />} />
        <Route path="/liveness" element={<Liveness />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route path="/clubs" element={<Clubs />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/renew" element={<Renew />} />
        <Route path="/signed-out" element={<Signout />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
