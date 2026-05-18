export type TimeBlockKind = "APPOINTMENT" | "VACATION" | "INTERNAL";

export function timeBlockLabel(kind: TimeBlockKind): string {
  if (kind === "APPOINTMENT") return "Cita";
  if (kind === "VACATION") return "Vacaciones";
  return "Bloqueo interno";
}

export function timeBlockFormLabel(kind: "VACATION" | "INTERNAL"): string {
  return kind === "VACATION" ? "Vacaciones" : "Bloqueo interno";
}

