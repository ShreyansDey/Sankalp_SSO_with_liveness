import React from "react";

export default function AdminCleanupTab({
  cleaning,
  onRunCleanup
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "600px" }}>
      <div>
        <h1 style={{ margin: "0 0 6px", fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: "40px" }}>
          Automated Cleanup Job
        </h1>
        <p style={{ color: "#5A6270", fontSize: "14px", margin: 0 }}>
          Evaluates all student accounts against two conditions: (1) term end date expired, or (2) no activity for 60 days.
        </p>
      </div>

      <div style={{ background: "#FBF9F4", border: "1px solid #DDD6C7", borderRadius: "14px", padding: "28px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "20px" }}>On-Demand Execution (Demo Trigger)</h3>
        <p style={{ fontSize: "14px", color: "#5A6270", margin: 0 }}>
          In production, this job executes automatically every 24 hours via APScheduler. Click below to run it immediately and see expired accounts disabled.
        </p>
        <button
          type="button"
          disabled={cleaning}
          onClick={onRunCleanup}
          className="btn-dark"
          style={{ alignSelf: "flex-start" }}
        >
          {cleaning ? "Evaluating Accounts..." : "Run Cleanup Job Now"}
        </button>
      </div>
    </div>
  );
}
