import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-400",
  secondary:
    "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
  danger:
    "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "text-zinc-600 hover:bg-zinc-100",
};

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: "default" | "compact" }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 ${size === "compact" ? "h-7 px-2 text-xs" : "h-9 px-3.5 text-sm"} ${variants[variant]} ${className}`}
    />
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
