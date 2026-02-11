import { cn } from "./cn";

export function Badge({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", className)}>
      {children}
    </span>
  );
}
