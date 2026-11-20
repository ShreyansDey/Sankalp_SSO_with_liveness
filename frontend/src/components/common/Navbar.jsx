import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../../api";

export default function Navbar({ currentUser, activePage }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Logout error:", e);
    } finally {
      navigate("/signed-out");
    }
  };

  const isAdmin = currentUser?.role === "admin";

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link to="/clubs" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              S
            </div>
            <div>
              <span className="font-semibold text-zinc-100 tracking-tight block text-sm sm:text-base leading-tight">
                Sankalp SSO
              </span>
              <span className="text-[10px] text-zinc-400 font-mono block">Real Person &bull; Real Access</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-zinc-800">
            <Link
              to="/clubs"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activePage === "clubs"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              Campus Clubs Hub
            </Link>

            {isAdmin && (
              <Link
                to="/admin"
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activePage === "admin"
                    ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                Admin Security Desk
              </Link>
            )}
          </nav>
        </div>

        {/* User Identity & Logout */}
        <div className="flex items-center gap-3 sm:gap-4">
          {currentUser && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-200">
                {currentUser.name ? currentUser.name[0].toUpperCase() : currentUser.email[0].toUpperCase()}
              </div>
              <div className="hidden sm:block text-right">
                <span className="text-xs font-medium text-zinc-200 block leading-tight">
                  {currentUser.name || currentUser.email}
                </span>
                <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1 justify-end">
                  {isAdmin ? (
                    <span className="text-blue-400 font-semibold">Admin</span>
                  ) : (
                    <span>Member</span>
                  )}
                  <span>&bull;</span>
                  <span className="text-emerald-400">Verified</span>
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/20 transition-all flex items-center gap-1.5"
            title="End SSO Session"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
