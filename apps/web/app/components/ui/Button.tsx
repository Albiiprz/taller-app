import { cn } from "./cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "lg" | "md" | "sm";
};

const variants = {
  primary: "bg-blue-700 text-white hover:bg-blue-800",
  secondary: "bg-white text-slate-900 ring-2 ring-slate-200 hover:bg-slate-50",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

const sizes = {
  lg: "min-h-12 px-5 py-4 text-base rounded-2xl",
  md: "min-h-12 px-4 py-3.5 text-sm rounded-2xl",
  sm: "min-h-11 px-3 py-2.5 text-xs rounded-xl",
};

export function Button({
  className = "",
  variant = "primary",
  size = "md",
  disabled,
  ...props
}: Props) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "btn-tap font-extrabold shadow-sm disabled:opacity-40 disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
