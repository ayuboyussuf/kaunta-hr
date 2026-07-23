"use client";

import { cn } from "@/lib/utils";

interface KauntaBellProps {
  className?: string;
  size?: number;
  color?: string;
}

export function KauntaBell({
  className,
  size = 32,
  color = "currentColor",
}: KauntaBellProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="38 68 214 214"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-label="Kaunta logo"
    >
      {/* Σ letterform — user's exact Canva paths */}
      <path
        fill={color}
        fillRule="nonzero"
        d="M 72.835938 214.800781 L 82.222656 126.46875 L 106.855469 126.714844 L 106.503906 130.015625 C 101.648438 129.910156 97.871094 130.503906 95.179688 131.800781 C 92.488281 133.09375 90.398438 135.039062 88.917969 137.632812 C 87.4375 140.226562 86.40625 144.480469 85.828125 150.390625 L 81.554688 190.605469 L 123.261719 158.761719 L 158.605469 203.800781 L 163.359375 159.074219 C 164.21875 150.964844 163.808594 144.65625 162.117188 140.144531 C 160.425781 135.632812 156.289062 131.941406 149.699219 129.074219 L 150.695312 125.84375 L 179.472656 133.996094 L 169.789062 225.105469 L 167.214844 224.832031 L 127.992188 174.8125 L 75.410156 215.074219 Z"
      />
      {/* % diagonal — anchored at sigma's inner-V tip so it reads as one merged shape */}
      <line
        x1="128" y1="175"
        x2="178" y2="232"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Left circle — solid dot (reads clean at all sizes) */}
      <circle cx="120" cy="208" r="20" fill={color} />
      {/* Right circle — solid dot */}
      <circle cx="200" cy="208" r="20" fill={color} />
    </svg>
  );
}

/** Full wordmark: mark + "Kaunta" text */
export function KauntaWordmark({
  className,
  size = "md",
  theme = "dark",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  theme?: "dark" | "light" | "copper";
}) {
  const sizeMap     = { sm: 22, md: 30, lg: 40 };
  const textSizeMap = { sm: "text-xl", md: "text-2xl", lg: "text-3xl" };
  const colors = {
    dark:   { bell: "#C4622D", text: "#0F1923" },
    light:  { bell: "#C4622D", text: "#FFFFFF" },
    copper: { bell: "#FFFFFF", text: "#FFFFFF" },
  };
  const c = colors[theme];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <KauntaBell size={sizeMap[size]} color={c.bell} />
      <span
        className={cn("font-display tracking-tight leading-none", textSizeMap[size])}
        style={{ color: c.text }}
      >
        Kaunta
      </span>
    </div>
  );
}

export default KauntaWordmark;
