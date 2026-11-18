#!/usr/bin/env python3
"""
Implementation Plan Generator for Sankalp SSO
Automatically scans the implementation_plans folder, determines the next sequential
number (e.g. 01, 02, 03...), grabs local date, time, and git username, and creates
the standardized plan markdown file.
"""

import os
import sys
import re
import datetime
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PLANS_DIR = ROOT_DIR / "implementation_plans"

def get_git_info():
    """Retrieve git user name and email from local git config or defaults."""
    default_name = "arkapaul-git"
    try:
        name = subprocess.check_output(["git", "config", "user.name"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        name = default_name

    try:
        email = subprocess.check_output(["git", "config", "user.email"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        email = "team-sankalp@jadavpur.edu"

    # Set arkapaul-git as the designated author handle for implementation plans
    if not name or name == "Team Sankalp":
        name = default_name

    return name, email or "team-sankalp@jadavpur.edu"

def get_next_plan_index():
    """Scan implementation_plans folder and return the next formatted index string ('01', '02', etc.)."""
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    existing_files = list(PLANS_DIR.glob("implimentation_plan_*.md")) + list(PLANS_DIR.glob("implementation_plan_*.md"))

    max_idx = 0
    for f in existing_files:
        match = re.search(r"(\d+)", f.stem)
        if match:
            idx = int(match.group(1))
            if idx > max_idx:
                max_idx = idx

    next_idx = max_idx + 1
    return f"{next_idx:02d}"

def create_new_plan(title="Next Generation Security Pipeline", content=None):
    """Creates a new implementation plan file with automatic sequential numbering and metadata."""
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    idx_str = get_next_plan_index()
    filename = f"implimentation_plan_{idx_str}.md"
    filepath = PLANS_DIR / filename

    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    git_user, git_email = get_git_info()

    if content is None:
        header = f"""# Implementation Plan {idx_str} — {title}

| Metadata | Details |
|---|---|
| **Document ID** | `implimentation_plan_{idx_str}.md` |
| **Creation Date** | {date_str} |
| **Creation Time** | {time_str} IST |
| **Git User** | {git_user} (`{git_email}`) |
| **Status** | Proposed / Draft |

---

## 1. Executive Summary
Brief high-level overview of the proposed architecture and deliverables.

## 2. Current System Gap Analysis
Where the current system lacks and why this improvement is required.

## 3. Architecture & End-to-End Pipeline
Detailed step-by-step pipeline description.

## 4. Technical Work Breakdown
Specific implementation tasks and technical components.

## 5. Security & Privacy Guarantees
Compliance, threat mitigation, and cryptographic boundaries.
"""
        final_content = header
    else:
        # If content provided, ensure header has the exact metadata
        header = f"""# Implementation Plan {idx_str} — {title}

| Metadata | Details |
|---|---|
| **Document ID** | `implimentation_plan_{idx_str}.md` |
| **Creation Date** | {date_str} |
| **Creation Time** | {time_str} IST |
| **Git User** | {git_user} (`{git_email}`) |
| **Status** | Active Implementation Blueprint |

---
"""
        final_content = header + "\n" + content.strip() + "\n"

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(final_content)

    print(f"✅ Generated new plan: {filepath.name} (Path: {filepath})")
    return filepath

if __name__ == "__main__":
    title_arg = sys.argv[1] if len(sys.argv) > 1 else "Next Generation Multi-Modal Identity Pipeline"
    create_new_plan(title=title_arg)
