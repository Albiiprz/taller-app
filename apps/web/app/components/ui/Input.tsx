import { cn } from "./cn";

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string };

export function Input({ className = "", label, hint, ...props }: Props) {
  return (
    <label className="block">
      {label && <div className="text-sm font-medium text-gray-800">{label}</div>}
      <input
        className={cn(
          "mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100",
          className
        )}
        {...props}
      />
      {hint && <div className="mt-2 text-xs text-gray-500">{hint}</div>}
    </label>
  );
}
