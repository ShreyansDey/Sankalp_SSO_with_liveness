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
          navigate("/login", { replace: true });
        }
      } catch (e) {
        navigate("/login", { replace: true });
      } finally {
        setLoading(false);
      }
    }
    loadUser();

    // Defeat Back-Forward Cache (bfcache): re-verify session if browser navigates back
    const handlePageShow = (event) => {
      if (event.persisted) {
        loadUser();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [navigate]);

  const handleSignOut = async () => {
    const userName = user?.name || "Student";
    const userRole = user?.role || "member";
    const enrolledClubs = userRole === "admin" ? [] : activeClubs.map(c => c.name);
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (e) {
      // Ignore
    }
    navigate("/signed-out", {
      replace: true,
      state: {
        name: userName,
        role: userRole,
        clubs: enrolledClubs
      }
    });
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

  const getClubUrl = (port, path) => {
    if (typeof window !== "undefined") {
      const proto = window.location.protocol;
      const host = window.location.hostname;
      if (host.endsWith(".sa")) {
        const subdomains = {
          "app-a": "photoclub.sa",
          "app-b": "roboticsclub.sa",
          "app-c": "codingclub.sa",
          "app-d": "chessclub.sa",
          "app-e": "sportsclub.sa"
        };
        const targetDomain = subdomains[path] || `${path}.sa`;
        return `${proto}//${targetDomain}`;
      }
      // If accessed via ngrok, tunnel, or any remote domain, route through the Vite proxy subpath
      if (host.includes("ngrok") || host.includes("trycloudflare") || host.includes("loca.lt")) {
        return `${window.location.origin}/${path}/`;
      }
      if (host === "localhost" || host === "127.0.0.1") {
        return `http://localhost:${port}`;
      }
      return `${proto}//${host}:${port}`;
    }
    return `http://localhost:${port}`;
  };

  // 5 Active University Campus Clubs
  const activeClubs = [
    {
      id: "app-b",
      name: "Robotics Society",
      desc: "Build nights, parts inventory and competition teams.",
      url: getClubUrl(5175, "app-b"),
      image: "/images/robotics.jpg",
      roleText: "Member · until 30 Jun 2027",
    },
    {
      id: "app-a",
      name: "Photography Club",
      desc: "Shared gallery, gear bookings and photo walks.",
      url: getClubUrl(5174, "app-a"),
      image: "/images/photography.jpg",
      roleText: "Member · until 30 Jun 2027",
    },
    {
      id: "app-c",
      name: "Coding & AI Club",
      desc: "Weekly challenges, project showcase and hackathon teams.",
      url: getClubUrl(5176, "app-c"),
      image: "/images/coding.jpg",
      roleText: "Member · until 30 Jun 2027",
    },
    {
      id: "app-d",
      name: "Chess & Mind Sports",
      desc: "Tournament brackets, ELO ranking and blitz arena nights.",
      url: getClubUrl(5177, "app-d"),
      image: "/images/chess.jpg",
      roleText: "Member · until 31 Mar 2027",
    },
    {
      id: "app-e",
      name: "Athletics & Sports",
      desc: "Gymnasium access, team rosters and fitness lockers.",
      url: getClubUrl(5178, "app-e"),
      image: "/images/athletics.jpg",
      roleText: "Member · until 30 Jun 2027",
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
          padding: "clamp(12px, 3vw, 20px) clamp(14px, 4vw, 48px)",
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
        padding: "clamp(20px, 4vw, 48px) clamp(14px, 4vw, 48px) 40px",
        display: "flex",
        flexDirection: "column",
        gap: "clamp(20px, 4vw, 40px)"
      }}>

        {/* Welcome Header & Session Widget */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "min(100%, 300px)", flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "2.4px", color: "#8A4A0F" }}>
              YOUR CLUBS
            </div>
            <h1 style={{
              margin: 0,
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 500,
              fontSize: "clamp(28px, 5vw, 48px)",
              lineHeight: 1.15
            }}>
              Welcome, {user?.name?.split(" ")[0] || "Member"}.
            </h1>
            <p style={{ margin: 0, fontSize: "15px", lineHeight: "1.5", color: "#5A6270", maxWidth: "540px" }}>
              You signed in once. Open any club below with one click, with no new password and no camera check.
            </p>
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "#FBF9F4",
            border: "1px solid #DDD6C7",
            borderRadius: "12px",
            padding: "12px 16px"
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
                height: "190px",
                position: "relative",
                overflow: "hidden"
              }}>
                <img
                  src={club.image}
                  alt={club.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: club.id === "app-a" ? "center 25%" : "center"
                  }}
                />
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
                  {user?.role === "admin" ? "Administrator · System Oversight" : club.roleText}
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
                  {user?.role === "admin" ? "Inspect Club" : "Open"} <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 9h12M10 4l5 5-5 5" stroke="#F5F1E8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                </a>
              </div>
            </div>
          ))}

          {/* Coming Soon Club Card (Debating Club) */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            background: "#FBF9F4",
            border: "1px solid #DDD6C7",
            borderRadius: "14px",
            overflow: "hidden"
          }}>
            <div style={{
              height: "190px",
              position: "relative",
              overflow: "hidden"
            }}>
              <img
                src="/images/debating.jpg"
                alt="Debating Club"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center 30%",
                  filter: "brightness(0.92)"
                }}
              />
              <span style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#4A5260",
                background: "#EAE4D6",
                borderRadius: "999px",
                padding: "3px 12px"
              }}>
                Coming Soon
              </span>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
              <div>
                <h2 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 600, fontSize: "24px", color: "#12171E" }}>
                  Debating Club
                </h2>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "#5A6270" }}>
                  Parliamentary debate rounds, speaker workshops, and inter-collegiate tournament leagues.
                </p>
              </div>

              <div style={{ fontSize: "13px", color: "#5A6270", marginTop: "auto" }}>
                Launches next semester &bull; Open to all students
              </div>

              <button
                type="button"
                disabled
                style={{
                  height: "44px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#8C8574",
                  border: "1px solid #DDD6C7",
                  background: "#EBE5D8",
                  borderRadius: "8px",
                  cursor: "not-allowed"
                }}
              >
                Coming Soon
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
