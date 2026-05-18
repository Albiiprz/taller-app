import { cn } from "./cn";

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string };

export function Input({ className = "", label, hint, ...props }: Props) {
  return (
    <label className="block">
      {label && <div className="text-sm font-extrabold text-slate-800">{label}</div>}
      <input
        className={cn(
          "mt-2 w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-4 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100",
          className
        )}
        {...props}
      />
      {hint && <div className="mt-2 text-xs font-semibold text-slate-600">{hint}</div>}
    </label>
  );
}
