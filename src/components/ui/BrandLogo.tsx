import React from "react";

interface BrandLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  subtitle?: string;
  className?: string;
}

const sizeMap = {
  xs: { icon: "h-6 w-6", text: "text-base", sub: "text-[10px]" },
  sm: { icon: "h-8 w-8", text: "text-lg", sub: "text-xs" },
  md: { icon: "h-10 w-10", text: "text-xl", sub: "text-xs" },
  lg: { icon: "h-12 w-12", text: "text-2xl", sub: "text-xs" },
  xl: { icon: "h-16 w-16", text: "text-3xl", sub: "text-sm" },
};

export function BrandLogo({
  size = "md",
  showText = true,
  subtitle = "Marketing Automation",
  className = "",
}: BrandLogoProps) {
  const currentSize = sizeMap[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Brand Icon with Radiant Glow Effect */}
      <div className={`relative flex items-center justify-center shrink-0 ${currentSize.icon}`}>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-emerald-500/40 via-teal-400/30 to-cyan-500/40 blur-md opacity-75 animate-pulse" />
        <img
          src="/logo.svg"
          alt="Shree AI Messenger Logo"
          className="relative z-10 h-full w-full object-contain drop-shadow-md rounded-xl transition-transform duration-300 hover:scale-105"
        />
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col leading-tight">
          <div className={`font-extrabold tracking-tight flex items-center gap-1.5 ${currentSize.text}`}>
            <span className="text-foreground">Shree</span>
            <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
              AI
            </span>
            <span className="text-foreground font-semibold">Messenger</span>
          </div>
          {subtitle && (
            <span className={`text-muted-foreground font-medium tracking-wide ${currentSize.sub}`}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
