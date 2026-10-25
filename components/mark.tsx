export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path d="M7 37 22 8h4l15 29H30l-6-12-6 12H7Z" fill="currentColor" />
      <path d="M9 41h30M16 19h16" stroke="currentColor" strokeWidth="3" />
      <path d="m21 37 3-5 3 5h-6Z" fill="currentColor" />
    </svg>
  );
}
