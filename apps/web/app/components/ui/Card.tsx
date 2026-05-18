import { cn } from "./cn";

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-3xl border-2 border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 pt-5", className)}>{children}</div>;
}

export function CardContent({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}
