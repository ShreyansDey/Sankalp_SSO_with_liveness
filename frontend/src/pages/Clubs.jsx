import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

/**
 * ==============================================================================
 * REAL ACCESS / SANKALP SSO — YOUR CLUBS (CLUBS HUB)
 * ==============================================================================
 * In plain words (Layman):
 *   This is the member's home screen. Once a student signs in and passes the
 *   camera check, they see all connected campus clubs. Clicking 'Open' launches
 *   any club with instant 1-Click Single Sign-On—no new password, no repeated
 *   camera check!
 *
 * Technical Role:
 *   - Matches the '2. Your clubs' design component (Clubs.dc.html)
 *   - Verifies session with GET /me
 *   - Links to all 5 active client apps on localhost ports 5174 through 5178
 *   - Demonstrates active vs ended access states
 * ==============================================================================
 */

export default function Clubs() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUser() {
      try {
        const data = await apiRequest("/me");
        if (data && data.status === "active") {
          setUser(data);
        } else {
          navigate("/login");
        }
      } catch (e) {
        navigate("/login");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [navigate]);

  const handleSignOut = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (e) {
      // Ignore
    }
    navigate("/login");
  };

  const getInitials = (name) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3EFE7" }}>
        <p style={{ color: "#5A6270", fontSize: "15px" }}>Loading your active club memberships...</p>
      </div>
    );
  }

  // 5 Active University Campus Clubs
  const activeClubs = [
    {
      id: "app-b",
      name: "Robotics Society",
      desc: "Build nights, parts inventory and competition teams.",
      port: 5175,
      url: "http://localhost:5175",
      headerBg: "#E4DDCF",
      roleText: "Member · until 30 Jun 2027",
      iconSvg: (
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
          <circle cx="22" cy="22" r="7" stroke="#12171E" strokeWidth="2"></circle>
          <path d="M22 6v6M22 32v6M6 22h6M32 22h6M10.7 10.7l4.3 4.3M29 29l4.3 4.3M33.3 10.7L29 15M15 29l-4.3 4.3" stroke="#12171E" strokeWidth="2" strokeLinecap="round"></path>
        </svg>
      )
    },
    {
      id: "app-a",
      name: "Photography Club",
      desc: "Shared gallery, gear bookings and photo walks.",
      port: 5174,
      url: "http://localhost:5174",
      headerBg: "#EBD5C7",
      roleText: "Member · until 30 Jun 2027",
      iconSvg: (
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
          <path d="M6 15h8l3-5h10l3 5h8v19H6V15z" stroke="#12171E" strokeWidth="2" strokeLinejoin="round"></path>
          <circle cx="22" cy="24" r="6" stroke="#12171E" strokeWidth="2"></circle>
        </svg>
      )
    },
    {
      id: "app-c",
      name: "Coding & AI Club",
      desc: "Weekly challenges, project showcase and hackathon teams.",
      port: 5176,
      url: "http://localhost:5176",
      headerBg: "#D5DCD3",
      roleText: "Member · until 30 Jun 2027",
      iconSvg: (
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
          <path d="M16 14l-9 8 9 8M28 14l9 8-9 8M25 10l-6 24" stroke="#12171E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
      )
    },
    {
      id: "app-d",
      name: "Chess & Mind Sports",
      desc: "Tournament brackets, ELO ranking and blitz arena nights.",
      port: 5177,
      url: "http://localhost:5177",
      headerBg: "#E4DDCF",
      roleText: "Member · until 31 Mar 2027",
      iconSvg: (
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
          <path d="M14 34h16M18 10h8M19 14h6M16 34l2-16h8l2 16" stroke="#12171E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
      )
    },
    {
      id: "app-e",
      name: "Athletics & Sports",
      desc: "Gymnasium access, team rosters and fitness lockers.",
      port: 5178,
      url: "http://localhost:5178",
      headerBg: "#D3DAE3",
      roleText: "Member · until 30 Jun 2027",
      iconSvg: (
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
          <circle cx="22" cy="14" r="5" stroke="#12171E" strokeWidth="2"></circle>
          <path d="M14 26l8-4 8 4M22 22v14M16 36l6-4 6 4" stroke="#12171E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
      )
    }
  ];

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#12171E",
      background: "#F3EFE7",
      display: "flex",
      flexDirection: "column"
    }}>

      {/* TOP NAVIGATION BAR */}
      <header style={{ borderBottom: "1px solid #DDD6C7", background: "#F3EFE7" }}>
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto",
          boxSizing: "border-box",
          padding: "20px 48px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px"
        }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="#B8651A" strokeWidth="2"></circle>
              <circle cx="16" cy="16" r="5" fill="#B8651A"></circle>
              <path d="M2 16h6M24 16h6" stroke="#B8651A" strokeWidth="2" strokeLinecap="round"></path>
            </svg>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "22px", fontWeight: 600 }}>
              Real Access
            </span>
          </div>

          {/* User Status Strip */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#1F6B3F",
              background: "#DDEFE2",
              borderRadius: "999px",
              padding: "6px 14px"
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2.5 7.5l3 3 6-6.5" stroke="#1F6B3F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path>
              </svg>
              Camera check passed
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "#12171E",
                color: "#F5F1E8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 600
              }}>
                {getInitials(user?.name)}
              </div>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>{user?.name || "Student"}</div>
                <div style={{ fontSize: "12px", color: "#5A6270", textTransform: "capitalize" }}>{user?.role || "Member"}</div>
              </div>
            </div>

            {user?.role === "admin" && (
              <Link
                to="/admin"
                style={{
                  height: "36px",
                  padding: "0 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#12171E",
                  background: "#EBE5D8",
                  border: "1px solid #B9B2A3",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none"
                }}
              >
                Admin Console
              </Link>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              style={{
                height: "36px",
                padding: "0 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#12171E",
                background: "transparent",
                border: "1px solid #B9B2A3",
                borderRadius: "8px",
                cursor: "pointer"
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={{
        flex: 1,
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
        boxSizing: "border-box",
        padding: "48px 48px 40px",
        display: "flex",
        flexDirection: "column",
        gap: "40px"
      }}>

        {/* Welcome Header & Session Widget */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyBetween: "space-between", gap: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "2.4px", color: "#8A4A0F" }}>
              YOUR CLUBS
            </div>
            <h1 style={{
              margin: 0,
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(36px, 5vw, 48px)",
              lineHeight: 1.1
            }}>
              Welcome, {user?.name?.split(" ")[0] || "Member"}.
            </h1>
            <p style={{ margin: 0, fontSize: "16px", lineHeight: "1.5", color: "#5A6270", maxWidth: "540px" }}>
              You signed in once. Open any club below with one click, with no new password and no camera check.
            </p>
          </div>

          <div style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "#FBF9F4",
            border: "1px solid #DDD6C7",
            borderRadius: "12px",
            padding: "14px 18px"
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" stroke="#5A6270" strokeWidth="1.5"></circle>
              <path d="M10 5.5V10l3 2" stroke="#5A6270" strokeWidth="1.5" strokeLinecap="round"></path>
            </svg>
            <div style={{ lineHeight: 1.4 }}>
              <div style={{ fontSize: "14px", fontWeight: 500 }}>Session active</div>
              <div style={{ fontSize: "13px", color: "#5A6270" }}>Ends in 7 h 59 min</div>
            </div>
          </div>
        </div>

        {/* CLUBS GRID */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
          gap: "24px"
        }}>

          {/* 5 Real Connected Campus Clubs */}
          {activeClubs.map((club) => (
            <div
              key={club.id}
              style={{
                display: "flex",
                flexDirection: "column",
                background: "#FBF9F4",
                border: "1px solid #DDD6C7",
                borderRadius: "14px",
                overflow: "hidden"
              }}
            >
              <div style={{
                height: "112px",
                background: club.headerBg,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                {club.iconSvg}
                <span style={{
                  position: "absolute",
                  top: "14px",
                  right: "14px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#1F6B3F",
                  background: "#DDEFE2",
                  borderRadius: "999px",
                  padding: "3px 10px"
                }}>
                  Active · Port {club.port}
                </span>
              </div>

              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
                <div>
                  <h2 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 600, fontSize: "24px" }}>
                    {club.name}
                  </h2>
                  <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "#5A6270" }}>
                    {club.desc}
                  </p>
                </div>

                <div style={{ fontSize: "13px", color: "#5A6270", marginTop: "auto" }}>
                  {club.roleText}
                </div>

                <a
                  href={club.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    height: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#F5F1E8",
                    background: "#12171E",
                    borderRadius: "8px",
                    textDecoration: "none"
                  }}
                >
                  Open <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 9h12M10 4l5 5-5 5" stroke="#F5F1E8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                </a>
              </div>
            </div>
          ))}

          {/* Ended Access Demonstration Card */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            background: "#F7F4EC",
            border: "1px dashed #B9B2A3",
            borderRadius: "14px",
            overflow: "hidden"
          }}>
            <div style={{
              height: "112px",
              background: "#E7E3DA",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                <path d="M8 12h28v16H20l-8 6v-6H8V12z" stroke="#6B7280" strokeWidth="2" strokeLinejoin="round"></path>
                <path d="M16 20h12" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"></path>
              </svg>
              <span style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                fontSize: "12px",
                fontWeight: 500,
                color: "#9B3A22",
                background: "#F6DDD4",
                borderRadius: "999px",
                padding: "3px 10px"
              }}>
                Access ended
              </span>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
              <div>
                <h2 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 600, fontSize: "24px", color: "#4A5260" }}>
                  Debating Club
                </h2>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "#5A6270" }}>
                  Your membership term ended, so this club closed to you automatically.
                </p>
              </div>

              <div style={{ fontSize: "13px", color: "#5A6270", marginTop: "auto" }}>
                Term ended 31 Oct 2026
              </div>

              <button
                type="button"
                onClick={() => alert("Your term ended on 31 Oct 2026. Contact your administrator to renew membership.")}
                style={{
                  height: "44px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#12171E",
                  border: "1px solid #12171E",
                  background: "transparent",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
              >
                Ask the club admin
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid #DDD6C7", marginTop: "auto" }}>
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto",
          boxSizing: "border-box",
          padding: "20px 48px",
          fontSize: "13px",
          color: "#5A6270"
        }}>
          Opening a club never asks for the camera again. Your access ends everywhere when your term does.
        </div>
      </footer>
    </div>
  );
}
