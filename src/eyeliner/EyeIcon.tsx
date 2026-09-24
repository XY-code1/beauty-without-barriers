export function EyeIcon({ large = false }: { large?: boolean }) {
  return (
    <svg
      width={large ? 110 : 32}
      height={large ? 65 : 22}
      viewBox="0 0 110 65"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 35C25 7 66 5 91 32M7 35C32 58 70 56 91 32M91 32L105 13"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M48 19C30 37 57 56 67 36"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M76 20L99 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
