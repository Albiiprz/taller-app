import { cn } from "./cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "lg" | "md" | "sm";
};

const variants = {
  primary: "bg-gray-900 text-white hover:bg-gray-800",
  secondary: "bg-white text-gray-900 ring-1 ring-gray-200 hover:bg-gray-50",
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

const sizes = {
  lg: "px-5 py-4 text-base rounded-2xl",
  md: "px-4 py-3 text-sm rounded-2xl",
  sm: "px-3 py-2 text-xs rounded-xl",
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
        "font-semibold shadow-sm active:scale-[0.99] transition disabled:opacity-40 disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
