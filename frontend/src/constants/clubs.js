/**
 * Central Definition of the 5 Connected University Campus Club Applications
 */
export function resolveClubUrl(club) {
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
      const targetDomain = subdomains[club.id] || `${club.id}.sa`;
      return `${proto}//${targetDomain}`;
    }
    if (host.includes("ngrok") || host.includes("trycloudflare") || host.includes("loca.lt")) {
      return `${window.location.origin}/${club.id}/`;
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return `http://localhost:${club.port}`;
    }
    return `${proto}//${host}:${club.port}`;
  }
  return `http://localhost:${club.port}`;
}

export const CAMPUS_CLUBS = [
  {
    id: "app-a",
    clientId: "app-a",
    name: "Photography Club",
    code: "Club A",
    port: 5174,
    url: "http://localhost:5174",
    description: "Campus photography archives, darkroom equipment booking, and member gallery.",
    category: "Creative Arts",
    image: "/images/photography.jpg",
    accentColor: "#2563EB", // Blue
    borderHover: "hover:border-blue-500",
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500/20"
  },
  {
    id: "app-b",
    clientId: "app-b",
    name: "Robotics Research Lab",
    code: "Lab B",
    port: 5175,
    url: "http://localhost:5175",
    description: "Embedded systems workbench, ROS2 testbed, and 3D printing cluster access.",
    category: "Engineering",
    image: "/images/robotics.jpg",
    accentColor: "#10B981", // Emerald
    borderHover: "hover:border-emerald-500",
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
  },
  {
    id: "app-c",
    clientId: "app-c",
    name: "Coding & AI Society",
    code: "Club C",
    port: 5176,
    url: "http://localhost:5176",
    description: "GPU compute cluster, competitive programming portal, and open-source hackathons.",
    category: "Technology",
    image: "/images/coding.jpg",
    accentColor: "#8B5CF6", // Purple
    borderHover: "hover:border-purple-500",
    badgeBg: "bg-purple-500/10 text-purple-400 border-purple-500/20"
  },
  {
    id: "app-d",
    clientId: "app-d",
    name: "Chess & Mind Sports",
    code: "Club D",
    port: 5177,
    url: "http://localhost:5177",
    description: "Rated tournaments, puzzle analysis database, and inter-collegiate league board.",
    category: "Strategy",
    image: "/images/chess.jpg",
    accentColor: "#F59E0B", // Amber
    borderHover: "hover:border-amber-500",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/20"
  },
  {
    id: "app-e",
    clientId: "app-e",
    name: "Athletics & Sports Complex",
    code: "Club E",
    port: 5178,
    url: "http://localhost:5178",
    description: "Gym facility pass, track & field scheduling, and intramural team rosters.",
    category: "Physical Fitness",
    image: "/images/athletics.jpg",
    accentColor: "#EC4899", // Pink
    borderHover: "hover:border-pink-500",
    badgeBg: "bg-pink-500/10 text-pink-400 border-pink-500/20"
  }
];
