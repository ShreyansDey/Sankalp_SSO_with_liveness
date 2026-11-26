import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import Liveness from './pages/Liveness';
import Clubs from './pages/Clubs';
import Admin from './pages/Admin';
import Signup from './pages/Signup';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Renew from './pages/Renew';
import Signout from './pages/Signout';
import Setup from './pages/Setup';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-wrapper">
          <Routes>
            <Route path="/setup" element={<Setup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/liveness" element={<Liveness />} />
            <Route path="/clubs" element={<Clubs />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/renew" element={<Renew />} />
            <Route path="/signout" element={<Signout />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
