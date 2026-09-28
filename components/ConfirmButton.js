'use client';

// A submit button that asks for confirmation first.
export default function ConfirmButton({ message, className, disabled, children }) {
  return (
    <button
      className={className}
      disabled={disabled}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
