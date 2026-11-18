import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Liveness from "./pages/Liveness";
import Admin from "./pages/Admin";
import Clubs from "./pages/Clubs";

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
        <Route path="/liveness" element={<Liveness />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/clubs" element={<Clubs />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
