import Image from "next/image";
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4h2.2l1.6 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.76L19.5 8H6" />
    <circle cx="9.5" cy="20" r="1.2" />
    <circle cx="17" cy="20" r="1.2" />
  </Icon>
);
export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h3.5l1.7 4.2-2.2 1.5a11 11 0 0 0 5.3 5.3l1.5-2.2L19 14.5V18a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </Icon>
);
export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);
export const ArrowIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </Icon>
);
export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-12M9 7V4h6v3" />
  </Icon>
);
export const ExpandIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </Icon>
);
export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const EyeOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20" />
  </Icon>
);

export function VisaBadge({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 38 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Visa"
      role="img"
    >
      <rect width="38" height="24" rx="4" fill="#FFFFFF" stroke="#DCD7CE" strokeWidth="1" />
      <g transform="translate(2.45, 1.39) scale(0.0424)">
        <path
          d="M489.823 143.111C442.988 143.111 401.134 167.393 401.134 212.256C401.134 263.706 475.364 267.259 475.364 293.106C475.364 303.989 462.895 313.731 441.6 313.731C411.377 313.731 388.789 300.119 388.789 300.119L379.123 345.391C379.123 345.391 405.145 356.889 439.692 356.889C490.898 356.889 531.19 331.415 531.19 285.784C531.19 231.419 456.652 227.971 456.652 203.981C456.652 195.455 466.887 186.114 488.122 186.114C512.081 186.114 531.628 196.014 531.628 196.014L541.087 152.289C541.087 152.289 519.818 143.111 489.823 143.111ZM61.3294 146.411L60.1953 153.011C60.1953 153.011 79.8988 156.618 97.645 163.814C120.495 172.064 122.122 176.868 125.971 191.786L167.905 353.486H224.118L310.719 146.411H254.635L198.989 287.202L176.282 167.861C174.199 154.203 163.651 146.411 150.74 146.411H61.3294ZM333.271 146.411L289.275 353.486H342.756L386.598 146.411H333.271ZM631.554 146.411C618.658 146.411 611.825 153.318 606.811 165.386L528.458 353.486H584.542L595.393 322.136H663.72L670.318 353.486H719.805L676.633 146.411H631.554ZM638.848 202.356L655.473 280.061H610.935L638.848 202.356Z"
          fill="#1434CB"
        />
      </g>
    </svg>
  );
}

export function MastercardBadge({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 38 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Mastercard"
      role="img"
    >
      <rect width="38" height="24" rx="4" fill="#FFFFFF" stroke="#DCD7CE" strokeWidth="1" />
      <g transform="translate(2.19, 1.22) scale(0.0431)">
        <path d="M465.738 113.525H313.812V386.475H465.738V113.525Z" fill="#FF5A00" />
        <path
          d="M323.926 250C323.926 194.545 349.996 145.326 390 113.525C360.559 90.3769 323.42 76.3867 282.91 76.3867C186.945 76.3867 109.297 154.035 109.297 250C109.297 345.965 186.945 423.614 282.91 423.614C323.42 423.614 360.559 409.623 390 386.475C349.94 355.123 323.926 305.455 323.926 250Z"
          fill="#EB001B"
        />
        <path
          d="M670.711 250C670.711 345.965 593.062 423.614 497.098 423.614C456.588 423.614 419.449 409.623 390.008 386.475C430.518 354.618 456.082 305.455 456.082 250C456.082 194.545 430.012 145.326 390.008 113.525C419.393 90.3769 456.532 76.3867 497.041 76.3867C593.062 76.3867 670.711 154.541 670.711 250Z"
          fill="#F79E1B"
        />
      </g>
    </svg>
  );
}

export function SwishLogo({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/images/swish-logo.svg"
      width={420}
      height={566}
      alt="Swish"
      className={className}
      sizes="120px"
      unoptimized
    />
  );
}

export function FalconEmblem({ className = "h-8 w-8 text-[#b88e4d]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M32 4 C36 10, 48 12, 58 10 C54 18, 46 22, 40 24 C46 28, 54 29, 60 28 C52 35, 42 37, 34 35 C38 41, 46 45, 52 47 C42 50, 32 46, 26 40 C28 46, 30 52, 34 56 C26 54, 20 48, 18 42 C14 48, 10 52, 6 54 C10 46, 14 38, 18 30 C12 28, 6 24, 2 20 C10 20, 18 22, 24 26 C22 18, 24 10, 32 4 Z" />
    </svg>
  );
}

export const StepPizzaIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21.5L3.5 6a15.2 15.2 0 0 1 17 0L12 21.5Z" />
    <path d="M4.5 7.5a13.5 13.5 0 0 1 15 0" />
    <circle cx="12" cy="11" r="1" fill="currentColor" />
    <circle cx="9.5" cy="15" r="0.9" fill="currentColor" />
    <circle cx="14" cy="16" r="0.9" fill="currentColor" />
  </Icon>
);

export const StepCustomizeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h8M16 8h4M4 16h4M12 16h8" />
    <circle cx="14" cy="8" r="2" />
    <circle cx="10" cy="16" r="2" />
  </Icon>
);

export const StepCalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="18" rx="3" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M8 14h2M14 14h2M8 18h2M14 18h2" />
  </Icon>
);

export const StepBagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 8h12l1.5 12a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2L6 8Z" />
    <path d="M9 10V6a3 3 0 0 1 6 0v4" />
  </Icon>
);

export const FeatureFoodIcon = (p: IconProps) => (
  <Icon {...p}>
    {/* Fork on the left */}
    <path d="M6 3v5a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M8 10v11" />
    {/* Knife/Spoon on the right */}
    <path d="M15 3c2 0 3 1.5 3 4.5s-1.5 4.5-3 4.5M15 3v18" />
  </Icon>
);

export const FeatureAmbianceIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

export const FeatureLocationIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0c0 5-6 10.5-6 10.5Z" />
    <circle cx="12" cy="10.5" r="2.2" />
  </Icon>
);

export const FacebookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </Icon>
);

export const InstagramIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Icon>
);



