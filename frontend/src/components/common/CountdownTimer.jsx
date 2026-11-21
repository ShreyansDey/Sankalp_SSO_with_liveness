import React, { useState, useEffect } from "react";

export default function CountdownTimer({ targetDate, onExpire, className = "" }) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  function calculateTimeLeft() {
    if (!targetDate) return { hours: 0, minutes: 0, seconds: 0, total: 0 };
    const diff = new Date(targetDate).getTime() - new Date().getTime();
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, total: 0 };

    return {
      hours: Math.floor(diff / (1000 * 60 * 60)),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      total: diff
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining.total <= 0) {
        clearInterval(timer);
        if (onExpire) onExpire();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const pad = (n) => String(n).padStart(2, "0");

  if (timeLeft.total <= 0) {
    return (
      <span className={`text-red-400 font-mono text-xs font-semibold ${className}`}>
        Expired &bull; Hard Purge Imminent
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${className}`}>
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
      <span className="text-amber-400">{pad(timeLeft.hours)}h {pad(timeLeft.minutes)}m {pad(timeLeft.seconds)}s</span>
    </div>
  );
}
