interface BrandMarkProps {
  size?: number;
}

/** The single brand glyph: a ring with four ticks and one cut notch.
 *  Used by the topbar, auth pages and the favicon so all three agree. */
export function BrandMark({ size = 16 }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="7.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M16.4 7.6l1.7-1.7"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity=".55"
      />
    </svg>
  );
}
