import React, { useEffect } from "react";

export default function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-xl" }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className={`relative w-full ${maxWidth} bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-8 z-10 animate-in fade-in zoom-in-95 duration-150`}>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
