import React from "react";

export default function AlertBanner({ type = "info", message, onClose, className = "" }) {
  if (!message) return null;

  const styles = {
    success: {
      bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    error: {
      bg: "bg-red-500/10 border-red-500/30 text-red-300",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    warning: {
      bg: "bg-amber-500/10 border-amber-500/30 text-amber-300",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    info: {
      bg: "bg-blue-500/10 border-blue-500/30 text-blue-300",
      icon: (
        <svg className="w-5 h-5 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  };

  const style = styles[type] || styles.info;

  return (
    <div className={`p-4 rounded-xl border flex items-start gap-3 backdrop-blur-sm ${style.bg} ${className}`}>
      {style.icon}
      <div className="flex-1 text-sm leading-relaxed">{message}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 transition-colors -mr-1 -mt-1 p-1 rounded-lg"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
