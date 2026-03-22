import React from "react";
import "./ScrollToRealtimeButton.css";

export default function ScrollToRealtimeButton({
  visible = false,
  onClick,
  className = "",
  tooltipText = "Rolar para a barra mais recente",
  hotkeyLabel = ["Alt", "Shift", "→"],
  style,
}) {
  if (!visible) return null;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(e);
    }
  };

  return (
    <div
      className={`scroll-to-realtime-wrap ${className}`.trim()}
      style={style}
    >
      <div className="scroll-to-realtime-tooltip" aria-hidden="true">
        <span className="scroll-to-realtime-tooltip__text">{tooltipText}</span>

        <div className="scroll-to-realtime-tooltip__keys">
          {hotkeyLabel.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="scroll-to-realtime-tooltip__key"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="scroll-to-realtime-button"
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-label={tooltipText}
      >
        <svg
          viewBox="0 0 22 22"
          className="scroll-to-realtime-button__icon"
          focusable="false"
          aria-hidden="true"
        >
          <path
            d="M7.2 6.2L11.2 11L7.2 15.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.15"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11.25 6.15L16.1 11L11.25 15.85"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.45"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}