# demo-script.md — 4-Minute Presentation Walkthrough

**Project:** Real Person, Real Access · **Product:** Sankalp SSO  
**Team:** Sankalp (Shreyans Dey, Arka Paul) · **Event:** Hack N Pitch 2026, Jadavpur University E-Cell  
**Target Duration:** Exactly 4 minutes (with 2 minutes Q&A)  

---

## ⏱️ Timeline & Presentation Cue Card

```mermaid
timeline
    title 4-Minute Judge Presentation Schedule
    0:00 - 0:25 : Opening Hook (Rahul's Ghost Account Problem)
    0:25 - 1:15 : Live Sign-In & 3-Step Camera Liveness
    1:15 - 1:55 : One-Click Single Sign-On (Clubs Switch)
    1:55 - 2:35 : Live Presentation Attack Test (Photo Fails)
    2:35 - 3:15 : Rahul Leaves (Instant Mark as Left Revocation)
    3:15 - 3:45 : Automated Janitor (Term Expiration Cleanup)
    3:45 - 4:00 : Summary & Honest Architectural Limits
```

---

## 🎬 Step-by-Step Script Walkthrough

### 0:00 – 0:25: The Opening Hook (25 seconds)
- **Visual**: Show the slide or whiteboard with two simple sentences:
  > *"Rahul left the university photography club in June. In November, his login still works."*
- **Spoken**:  
  > *"Respected judges, every year, university clubs, research labs, and small teams struggle with two massive security vulnerabilities: **passwords alone cannot prove that a real person is sitting at the screen**, and **nobody remembers to clean up old accounts** when students graduate or leave.*  
  > *Today, Team Sankalp presents **Sankalp SSO**: Real Person, Real Access. One sign-in, instant biometric presence verification, and immediate access termination everywhere."*

---

### 0:25 – 1:15: Step 1 — Sign In & Biometric Liveness (50 seconds)
- **Visual**: Open browser tab at `http://localhost:5174` (App A: Photography Club).
  1. Click **"Sign In with Sankalp SSO"**. Browser seamlessly redirects to Central Login (`http://localhost:5173`).
  2. Enter credentials: `rahul@ju.edu` / `RahulPass123!`.
  3. Camera activates. Screen presents random challenge: *"Turn head Left, center gaze, blink twice"*.
  4. Rahul turns head left, centers gaze, and blinks twice naturally.
  5. Green checkmark flashes: *"Liveness Confirmed & Biometric Face Match Verified (94%)"*.
  6. Browser redirects back to Photography Club: **"Welcome, Rahul Sharma!"**
- **Spoken**:  
  > *"Watch what just happened. App A redirected to our central gateway. rahul entered his password, but the system didn't stop there. It issued an unpredictable, 30-second challenge. rahul turned his head to establish 3D depth, calibrated his gaze, and blinked naturally.*  
  > *Crucially: **no video stream ever left the browser**. Only a single frame snapshot was checked by our OpenCV YuNet and SFace biometric engine against his enrolled profile. Access is granted!"*

---

### 1:15 – 1:55: Step 2 — The One-Click Single Sign-On Part (40 seconds)
- **Visual**: In a new tab, open `http://localhost:5175` (App B: Robotics Lab).
  1. Click **"Sign In with Sankalp SSO"**.
  2. The page flashes for 0.35 seconds and renders: **"Welcome, Rahul Sharma! (Robotics Lab Dashboard)"**.
  3. No password prompt. No camera check.
- **Spoken**:  
  > *"Now rahul needs to access the 3D printers in the Robotics Lab. He clicks one button. Because his central SSO session is live, our server recognizes his secure HttpOnly session cookie and grants access in **350 milliseconds**.*  
  > *One login unlocks all 5 connected campus facilities!"*

---

### 1:55 – 2:35: Step 3 — Presentation Attack Test: Holding a Photo (40 seconds)
- **Visual**: Open an incognito window or log out. Enter Rahul's email and password.
  1. When camera screen appears, hold up a printed color photograph or a smartphone displaying Rahul's photo.
  2. The system evaluates 3D Z-depth variance and displays a prominent warning:
     > ⚠️ *"Flat 2D surface detected. Real 3D facial presence required."*
  3. The challenge times out after 30 seconds. Login is blocked.
- **Spoken**:  
  > *"What if an attacker steals Rahul's password and holds up his photograph to the camera?*  
  > *Our MediaPipe vision pipeline computes the 3D Z-depth variance across 10 anatomical landmarks. A flat photo has zero depth. It cannot turn or execute natural eye blinks. The photo fails completely. Digital identity is bound to physical human reality."*

---

### 2:35 – 3:15: Step 4 — Rahul Leaves: Instant Cross-System Revocation (40 seconds)
- **Visual**: Switch to Admin Console (`http://localhost:5173/admin`).
  1. Locate Rahul Sharma in the Member Directory.
  2. Click the red **"Mark as left"** button.
  3. Status updates to `disabled`.
  4. Switch back to the Photography Club tab (`:5174`) and Robotics Lab tab (`:5175`) and hit Refresh.
  5. Both tabs instantly display a bright red card: **"ACCESS DENIED — Account Disabled"**.
- **Spoken**:  
  > *"Now the core problem: Rahul graduates. In traditional setups, admins have to log into 5 different club portals to delete him.*  
  > *With Sankalp, the admin clicks **'Mark as left'** once. In **under 0.2 seconds**, our server revokes his SSO session and every refresh token. On the next check, both clubs slam the door shut instantly. Rahul's access leaves when he leaves."*

---

### 3:15 – 3:45: Step 5 — Automated Janitor Cleanup (30 seconds)
- **Visual**: In the Admin Console, scroll to the Janitor section.
  1. Click **"Run Cleanup Now"**.
  2. An alert shows: *"1 expired member automatically disabled (Term End reached)"*.
  3. Scroll down to the Audit Log. Show the real-time entry:
     > `user_disabled_auto | Target: alumni@ju.edu | Reason: term_end`
- **Spoken**:  
  > *"What if the admin forgets to click 'Mark as left'? Our APScheduler janitor runs automatically every 24 hours. Any student whose membership term has expired, or who hasn't logged in for 60 days, is automatically disabled. Everything is logged in an append-only, tamper-resistant audit trail."*

---

### 3:45 – 4:00: Summary & Closing (15 seconds)
- **Spoken**:  
  > *"Sankalp SSO is self-hosted, lightweight, private by design, and built for real-world campus security.*  
  > *Thank you! We are now open for your questions."*

---

## 💡 Anticipated Judge Questions & Technical Answers

### Q1: How is this different from commercial enterprise solutions like Okta or Ping Identity?
> **Answer**: *"Enterprise tools like Okta or Ping are multi-thousand-dollar SaaS solutions requiring vendor hosting, external cloud connections, and continuous subscription costs. They are too heavy and expensive for student clubs, research labs, and small colleges. Sankalp is self-hosted, runs 100% offline on local hardware, and natively integrates browser-based physical liveness and automatic lifecycle janitors without requiring external biometric cloud APIs."*

### Q2: Where does the student's face video go? Is it stored on the server?
> **Answer**: *"No. Camera video streams never leave the user's browser RAM. MediaPipe processes video frames locally using WebAssembly. Only at the exact millisecond of verified eye reopening is a single frame snapshot sent to the backend, which converts it into a unit-normalized list of 128 mathematical numbers (a vector). The temporary frame is purged, and only the 128 numbers are retained. It is mathematically impossible to reconstruct a face photo from these numbers."*

### Q3: Can a sophisticated deepfake bypass your camera check?
> **Answer**: *"Our system stops 2D printed photographs, video replays, and phone screens through 3D depth analysis, dynamic yaw movements, and unpredictable 30-second server challenges. As an honest architectural limit, real-time 3D neural diffusion generative deepfakes driven by virtual camera drivers represent future work that we plan to address with active optical reflection challenges."*

### Q4: What happens if a student has an eye condition or the camera malfunctions?
> **Answer**: *"The system dynamically calibrates the Eye Aspect Ratio (EAR) baseline to individual facial structures during the center-gaze step, accommodating glasses and diverse eye shapes. If camera hardware fails entirely, an administrator-approved fallback verification protocol allows temporary manual override recorded in the audit log."*

### Q5: How do you prevent accidental immediate account deletion?
> **Answer**: *"Sankalp enforces a mandatory two-step deletion safeguard: an account cannot be deleted directly. It must first be disabled, and a mandatory 30-day waiting period must elapse before an administrator can approve permanent deletion."*
