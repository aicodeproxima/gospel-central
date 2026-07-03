import type { SVGProps } from 'react';

export function PersonCurrentlyStudyingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="7.7" r="2.7" fill="currentColor" stroke="none" />
      <path d="M6.4 18.7c.7-3.6 2.6-5.5 5.6-5.5s4.9 1.9 5.6 5.5" />
      <path d="M8.9 18.7h6.2" />
    </svg>
  );
}

export function GrapesBearingFruitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12.4 5.5c1.5-1.6 3.3-1.9 5.1-.9-.8 1.4-2.4 2.1-4.7 1.9" />
      <circle cx="10" cy="9.5" r="2.2" />
      <circle cx="14.2" cy="9.5" r="2.2" />
      <circle cx="8.3" cy="13.3" r="2.2" />
      <circle cx="12.2" cy="13.3" r="2.2" />
      <circle cx="16.1" cy="13.3" r="2.2" />
      <circle cx="10.3" cy="17.2" r="2.2" />
      <circle cx="14.2" cy="17.2" r="2.2" />
    </svg>
  );
}
