'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MobileNav from "../components/MobileNav";
import { Icon } from "../components/ui/Icon";
import InfoHint from "../components/ui/InfoHint";
import { useSession } from "../components/useSession";
import { timeBlockFormLabel } from "../core/labels";
import { useUndoAction } from "../components/useUndoAction";
import VoiceAppointment from "../components/VoiceAppointment";
import { getReminderTargetMonday, markReminderDone } from "../core/weeklyScheduleReminder";
import {
  cancelAppointment,
  applyMaluScheduleRotation,
  createTechnicianScheduleRule,
  createTechnicianTimeBlock,
  deleteTechnicianScheduleRule,
  deleteTechnicianTimeBlock,
  getCalendarSummary,
  listUsers,
  listTechnicianScheduleRules,
  type ScheduleRule,
  type CalendarSummaryItem,
} from "../core/ordersApi";

type CalendarPane = "summary" | "blocks" | "schedule";
type SummaryView = "day" | "week" | "month";
type BlockType = "APPOINTMENT" | "VACATION" | "INTERNAL";

type EmployeeColor = { soft: string; solid: string; text: string };
type UiSummaryEvent = CalendarSummaryItem["blocks"][number] & {
  technicianId: string;
  techName: string;
  color: EmployeeColor;
  dateKey: string;
  title: string;
  timeLabel: string;
};

const PREFERRED_TECH_ORDER = ["tecnico", "alberto", "daniel", "miguel", "victor", "josete"];

function normalizeName(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const EMPLOYEE_COLORS = [
  { soft: "#eff6ff", solid: "#2563eb", text: "#1e3a8a" },
  { soft: "#ecfdf5", solid: "#059669", text: "#065f46" },
  { soft: "#fff7ed", solid: "#ea580c", text: "#9a3412" },
  { soft: "#faf5ff", solid: "#9333ea", text: "#6b21a8" },
  { soft: "#fdf2f8", solid: "#db2777", text: "#9d174d" },
  { soft: "#f0fdf4", solid: "#16a34a", text: "#166534" },
  { soft: "#fefce8", solid: "#ca8a04", text: "#854d0e" },
  { soft: "#ecfeff", solid: "#0891b2", text: "#155e75" },
];

const DAY_STEP_MINUTES = 10;
const DAY_ROW_HEIGHT = 18;
const DAY_START_MINUTES = 7 * 60;
const DAY_END_MINUTES = 19 * 60;
const VISIBLE_DAY_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;
const DAY_ROWS = VISIBLE_DAY_MINUTES / DAY_STEP_MINUTES;
const DAY_GRID_HEIGHT = DAY_ROWS * DAY_ROW_HEIGHT;

function todayYmd() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function plusDaysYmd(days: number, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function shiftYmd(ymd: string, days: number) {
  const base = new Date(`${ymd}T12:00:00`);
  return plusDaysYmd(days, base);
}

function startOfMonthYmd(ymd: string) {
  const base = new Date(`${ymd}T12:00:00`);
  base.setDate(1);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function endOfMonthYmd(ymd: string) {
  const base = new Date(`${ymd}T12:00:00`);
  base.setMonth(base.getMonth() + 1, 0);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function shiftMonthYmd(ymd: string, months: number) {
  const base = new Date(`${ymd}T12:00:00`);
  base.setMonth(base.getMonth() + months, 1);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function toIsoStart(ymd: string) {
  return `${ymd}T00:00:00.000Z`;
}

function toIsoEnd(ymd: string) {
  return `${ymd}T23:59:59.000Z`;
}

function formatDayTitle(ymd: string) {
  const date = new Date(`${ymd}T12:00:00`);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatMonthTitle(ymd: string) {
  const date = new Date(`${ymd}T12:00:00`);
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDayTitle(ymd: string) {
  const date = new Date(`${ymd}T12:00:00`);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function startOfWeekYmd(ymd: string) {
  const base = new Date(`${ymd}T12:00:00`);
  const diff = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - diff);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function endOfWeekYmd(ymd: string) {
  return shiftYmd(startOfWeekYmd(ymd), 6);
}

function dateKeyFromIso(iso: string) {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatSummaryTitle(view: SummaryView, selectedDay: string, selectedMonth: string) {
  if (view === "day") return formatDayTitle(selectedDay);
  if (view === "week") return `${formatShortDayTitle(startOfWeekYmd(selectedDay))} - ${formatShortDayTitle(endOfWeekYmd(selectedDay))}`;
  return formatMonthTitle(selectedMonth);
}

function minutesSinceStartOfDay(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function getEmployeeColor(index: number) {
  return EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length];
}

function getBlockTypeLabel(type: BlockType) {
  if (type === "APPOINTMENT") return "Cita";
  if (type === "VACATION") return "Vacaciones";
  return "Bloqueo";
}

function getBlockTypeBadgeClass(type: BlockType) {
  if (type === "VACATION") return "bg-rose-100 text-rose-800";
  if (type === "INTERNAL") return "bg-amber-100 text-amber-900";
  return "bg-blue-100 text-blue-800";
}

function getBlockSurfaceStyle(
  type: BlockType,
  color: { soft: string; solid: string; text: string },
) {
  if (type === "VACATION") {
    return {
      backgroundColor: color.soft,
      borderColor: color.solid,
      color: color.text,
      borderLeftWidth: "6px",
      borderStyle: "solid" as const,
    };
  }

  if (type === "INTERNAL") {
    return {
      backgroundColor: color.soft,
      borderColor: color.solid,
      color: color.text,
      borderStyle: "dashed" as const,
      backgroundImage: `repeating-linear-gradient(135deg, ${color.soft}, ${color.soft} 10px, rgba(255,255,255,0.6) 10px, rgba(255,255,255,0.6) 20px)`,
    };
  }

  return {
    backgroundColor: color.soft,
    borderColor: color.solid,
    color: color.text,
    borderStyle: "solid" as const,
  };
}

function getBlockTitle(block: CalendarSummaryItem["blocks"][number]) {
  if (block.appointment?.vehiclePlate && block.appointment?.clientName) {
    return `${block.appointment.vehiclePlate} · ${block.appointment.clientName}`;
  }
  if (block.appointment?.workOrderTitle) return block.appointment.workOrderTitle;
  if (block.appointment?.workType) return block.appointment.workType;
  if (block.appointment?.clientName) return block.appointment.clientName;
  if (block.note) return block.note;
  if (block.type === "APPOINTMENT" && block.sourceId) return `Cita #${block.sourceId}`;
  return getBlockTypeLabel(block.type);
}

export default function CalendarioPage() {
  const { hasRole } = useSession();
  const canView = hasRole("Administración") || hasRole("Oficina") || hasRole("Jefe de Taller");
  const canEdit = hasRole("Administración");
  const canCancelAppointments = hasRole("Administración") || hasRole("Oficina");

  const [selectedDay, setSelectedDay] = useState(todayYmd());
  const [selectedMonth, setSelectedMonth] = useState(startOfMonthYmd(todayYmd()));
  const [items, setItems] = useState<CalendarSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [pane, setPane] = useState<CalendarPane>("summary");
  const [summaryView, setSummaryView] = useState<SummaryView>("week");
  const [activeEvent, setActiveEvent] = useState<UiSummaryEvent | null>(null);

  const [blockTech, setBlockTech] = useState("");
  const [blockType, setBlockType] = useState<"VACATION" | "INTERNAL">("VACATION");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockNote, setBlockNote] = useState("");
  const [savingBlock, setSavingBlock] = useState(false);
  const [techOptions, setTechOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [ruleDay, setRuleDay] = useState(1);
  const [ruleStart, setRuleStart] = useState("08:00");
  const [ruleEnd, setRuleEnd] = useState("14:00");
  const [weekStart, setWeekStart] = useState("08:00");
  const [weekEnd, setWeekEnd] = useState("17:00");
  const [replaceWeekRules, setReplaceWeekRules] = useState(true);
  const [savingWeekRules, setSavingWeekRules] = useState(false);
  const [applyingRotation, setApplyingRotation] = useState(false);
  const { pending, scheduleAction, undoAction } = useUndoAction();
  const [nowTs, setNowTs] = useState(Date.now());
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [cancelModal, setCancelModal] = useState<{ apptId: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setError("");
    setOkMsg("");
    setTimeout(() => setToast(null), 3500);
  }

  const dayLabel = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  function getSummaryRange() {
    if (summaryView === "week") {
      return {
        from: toIsoStart(startOfWeekYmd(selectedDay)),
        to: toIsoEnd(endOfWeekYmd(selectedDay)),
      };
    }

    if (summaryView === "month") {
      return {
        from: toIsoStart(startOfMonthYmd(selectedMonth)),
        to: toIsoEnd(endOfMonthYmd(selectedMonth)),
      };
    }

    return {
      from: toIsoStart(selectedDay),
      to: toIsoEnd(selectedDay),
    };
  }

  function moveSummaryView(direction: -1 | 1) {
    if (summaryView === "month") {
      setSelectedMonth((current) => shiftMonthYmd(current, direction));
      return;
    }

    setSelectedDay((current) => shiftYmd(current, summaryView === "week" ? direction * 7 : direction));
  }

  function changeSummaryView(next: SummaryView) {
    setSummaryView(next);
    if (next === "month") {
      setSelectedMonth(startOfMonthYmd(selectedDay));
    }
  }

  async function load() {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const summaryRange = getSummaryRange();
      const monthFrom = toIsoStart(startOfMonthYmd(selectedMonth));
      const monthTo = toIsoEnd(endOfMonthYmd(selectedMonth));
      const from = pane === "summary" ? summaryRange.from : monthFrom;
      const to = pane === "summary" ? summaryRange.to : monthTo;
      const data = await getCalendarSummary({ from, to });
      setItems(data);
      if (!blockTech && data[0]) setBlockTech(data[0].technicianId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar calendario");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [selectedDay, selectedMonth, pane, summaryView, canView]);

  useEffect(() => {
    async function loadUsersForCalendar() {
      if (!canEdit) return;
      try {
        const users = await listUsers();
        const options = users.filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.name }));
        setTechOptions(options);
        if (!blockTech && options[0]) setBlockTech(options[0].id);
      } catch (e) {
        setTechOptions([]);
        setError(e instanceof Error ? e.message : "No se pudieron cargar usuarios");
      }
    }
    void loadUsersForCalendar();
  }, [canEdit, blockTech]);

  useEffect(() => {
    async function loadRules() {
      if (!canEdit || !blockTech) return;
      try {
        const data = await listTechnicianScheduleRules({ technicianId: blockTech });
        setRules(data);
      } catch {
        setRules([]);
      }
    }
    void loadRules();
  }, [blockTech, canEdit]);

  useEffect(() => {
    if (pending.length === 0) return;
    const t = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [pending.length]);

  async function createBlock() {
    if (!canEdit) {
      setError("No tienes permiso para crear bloqueos");
      return;
    }
    if (!blockTech) {
      setError("Selecciona un usuario");
      return;
    }
    if (!blockStart || !blockEnd) {
      setError("Indica inicio y fin");
      return;
    }
    const start = new Date(blockStart);
    const end = new Date(blockEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Formato de fecha inválido");
      return;
    }
    if (end <= start) {
      setError("La hora fin debe ser mayor que la hora inicio");
      return;
    }
    setSavingBlock(true);
    try {
      await createTechnicianTimeBlock({
        technicianId: blockTech,
        type: blockType,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        note: blockNote || undefined,
      });
      showToast("success", "Bloque guardado.");
      setBlockNote("");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "No se pudo guardar el bloqueo");
    } finally {
      setSavingBlock(false);
    }
  }

  async function createRule() {
    if (!canEdit || !blockTech || !ruleStart || !ruleEnd) return;
    try {
      await createTechnicianScheduleRule({
        technicianId: blockTech,
        dayOfWeek: ruleDay,
        startTime: ruleStart,
        endTime: ruleEnd,
      });
      showToast("success", "Horario guardado.");
      const data = await listTechnicianScheduleRules({ technicianId: blockTech });
      setRules(data);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "No se pudo guardar el horario");
    }
  }

  async function applyWeekTemplate() {
    if (!canEdit || !blockTech || !weekStart || !weekEnd) return;
    if (weekStart >= weekEnd) {
      setError("La hora de inicio debe ser menor que la de fin");
      return;
    }
    setSavingWeekRules(true);
    try {
      if (replaceWeekRules) {
        const existing = await listTechnicianScheduleRules({ technicianId: blockTech });
        const toDelete = existing.filter((r) => r.dayOfWeek >= 1 && r.dayOfWeek <= 5);
        for (const rule of toDelete) {
          await deleteTechnicianScheduleRule({ technicianId: blockTech, ruleId: rule.id });
        }
      }

      for (const day of [1, 2, 3, 4, 5]) {
        await createTechnicianScheduleRule({
          technicianId: blockTech,
          dayOfWeek: day,
          startTime: weekStart,
          endTime: weekEnd,
        });
      }

      const targetMonday = getReminderTargetMonday(new Date());
      markReminderDone(targetMonday);
      showToast("success", `Horario L-V aplicado (${weekStart} - ${weekEnd})`);
      const data = await listTechnicianScheduleRules({ technicianId: blockTech });
      setRules(data);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "No se pudo aplicar horario semanal");
    } finally {
      setSavingWeekRules(false);
    }
  }

  async function applyMaluRotation() {
    if (!canEdit) return;
    setApplyingRotation(true);
    try {
      await applyMaluScheduleRotation();
      showToast("success", "Horarios alternos (Semana A/B) cargados.");
      if (blockTech) {
        const data = await listTechnicianScheduleRules({ technicianId: blockTech });
        setRules(data);
      }
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "No se pudieron cargar los horarios alternos");
    } finally {
      setApplyingRotation(false);
    }
  }

  async function removeRule(ruleId: string) {
    if (!canEdit || !blockTech) return;
    try {
      await deleteTechnicianScheduleRule({ technicianId: blockTech, ruleId });
      showToast("success", "Tramo eliminado.");
      const data = await listTechnicianScheduleRules({ technicianId: blockTech });
      setRules(data);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "No se pudo eliminar el tramo");
    }
  }

  async function removeBlock(technicianId: string, blockId: string) {
    if (!canEdit) return;
    try {
      await deleteTechnicianTimeBlock({ technicianId, blockId });
      showToast("success", "Bloque eliminado.");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "No se pudo eliminar el bloqueo");
    }
  }

  function cancelAppt(apptId: string) {
    if (!canCancelAppointments) return;
    setCancelReason("Cliente cancela");
    setCancelModal({ apptId });
  }

  function confirmCancel() {
    if (!cancelModal) return;
    const { apptId } = cancelModal;
    const reason = cancelReason.trim() || "Cliente cancela";
    setCancelModal(null);
    scheduleAction({
      label: `Cancelar cita #${apptId}`,
      delayMs: 10_000,
      run: async () => {
        try {
          await cancelAppointment({ id: apptId, reason });
          showToast("success", "Cita cancelada.");
          await load();
        } catch (e) {
          showToast("error", e instanceof Error ? e.message : "No se pudo cancelar la cita");
        }
      },
    });
    showToast("success", "Cancelación programada — puedes deshacer en 10 s.");
  }

  const totals = useMemo(() => {
    const blocks = items.flatMap((tech) => tech.blocks);
    return {
      appointments: blocks.filter((b) => b.type === "APPOINTMENT").length,
      vacations: blocks.filter((b) => b.type === "VACATION").length,
      internal: blocks.filter((b) => b.type === "INTERNAL").length,
    };
  }, [items]);

  const orderedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aName = normalizeName(a.name);
      const bName = normalizeName(b.name);
      const aRank = PREFERRED_TECH_ORDER.findIndex((name) => aName.includes(name));
      const bRank = PREFERRED_TECH_ORDER.findIndex((name) => bName.includes(name));
      if (aRank !== -1 || bRank !== -1) {
        if (aRank === -1) return 1;
        if (bRank === -1) return -1;
        if (aRank !== bRank) return aRank - bRank;
      }
      return aName.localeCompare(bName, "es");
    });
  }, [items]);

  const dayGrid = useMemo(() => {
    return Array.from({ length: DAY_ROWS }, (_, index) => {
      const minutes = DAY_START_MINUTES + index * DAY_STEP_MINUTES;
      const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
      const mm = String(minutes % 60).padStart(2, "0");
      return {
        index,
        label: `${hh}:${mm}`,
        isHour: minutes % 60 === 0,
      };
    });
  }, []);

  const summaryRows = useMemo(() => {
    return orderedItems.map((tech, index) => {
      const color = getEmployeeColor(index);
      const blocks = tech.blocks
        .filter((block) => block.isActive)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        .map((block) => {
          const startMinutes = minutesSinceStartOfDay(block.startAt);
          const endMinutes = minutesSinceStartOfDay(block.endAt);
          const clampedStart = Math.max(DAY_START_MINUTES, startMinutes);
          const clampedEnd = Math.min(DAY_END_MINUTES, Math.max(startMinutes + 10, endMinutes));
          if (clampedEnd <= DAY_START_MINUTES || clampedStart >= DAY_END_MINUTES) {
            return null;
          }
          const safeEndMinutes = Math.max(clampedStart + 10, clampedEnd);
          const top = ((clampedStart - DAY_START_MINUTES) / DAY_STEP_MINUTES) * DAY_ROW_HEIGHT;
          const height = Math.max(DAY_ROW_HEIGHT, ((safeEndMinutes - clampedStart) / DAY_STEP_MINUTES) * DAY_ROW_HEIGHT);
          return {
            ...block,
            top,
            height,
            timeLabel: `${formatTime(block.startAt)} - ${formatTime(block.endAt)}`,
          };
        })
        .filter((block): block is NonNullable<typeof block> => block !== null);
      return { ...tech, color, blocks };
    });
  }, [orderedItems]);

  const summaryEvents = useMemo<UiSummaryEvent[]>(() => {
    return orderedItems.flatMap((tech, index) => {
      const color = getEmployeeColor(index);
      return tech.blocks
        .filter((block) => block.isActive)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        .flatMap((block) => {
          const start = new Date(block.startAt);
          const end = new Date(block.endAt);
          const cursor = new Date(start);
          cursor.setHours(12, 0, 0, 0);
          const final = new Date(end);
          final.setHours(12, 0, 0, 0);
          const events: Array<typeof block & {
            techName: string;
            color: ReturnType<typeof getEmployeeColor>;
            dateKey: string;
            title: string;
            timeLabel: string;
          }> = [];

          while (cursor <= final) {
            const dateKey = new Date(cursor.getTime() - cursor.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            events.push({
              ...block,
              technicianId: tech.technicianId,
              techName: tech.name,
              color,
              dateKey,
              title: getBlockTitle(block),
              timeLabel: `${formatTime(block.startAt)} - ${formatTime(block.endAt)}`,
            });
            cursor.setDate(cursor.getDate() + 1);
          }

          return events;
        });
    });
  }, [orderedItems]);

  const weekGrid = useMemo(() => {
    const start = startOfWeekYmd(selectedDay);
    return Array.from({ length: 7 }, (_, index) => {
      const ymd = shiftYmd(start, index);
      return {
        ymd,
        label: formatShortDayTitle(ymd),
        isToday: ymd === todayYmd(),
        events: summaryEvents.filter((event) => event.dateKey === ymd),
      };
    });
  }, [selectedDay, summaryEvents]);

  const weekHours = useMemo(() => {
    return Array.from({ length: DAY_END_MINUTES - DAY_START_MINUTES }, (_, offset) => {
      if (offset % 60 !== 0) return null;
      const total = DAY_START_MINUTES + offset;
      const hh = String(Math.floor(total / 60)).padStart(2, "0");
      return `${hh}:00`;
    }).filter((x): x is string => x !== null);
  }, []);

  const weekEventsByHour = useMemo(() => {
    const start = startOfWeekYmd(selectedDay);
    const end = endOfWeekYmd(selectedDay);
    const map = new Map<string, typeof summaryEvents>();

    summaryEvents.forEach((event) => {
      if (event.dateKey < start || event.dateKey > end) return;
      const startMinutes = minutesSinceStartOfDay(event.startAt);
      if (startMinutes < DAY_START_MINUTES || startMinutes >= DAY_END_MINUTES) return;
      const hour = String(Math.floor(startMinutes / 60)).padStart(2, "0");
      const key = `${event.dateKey}-${hour}:00`;
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    });

    map.forEach((list, key) => {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      map.set(key, list);
    });

    return map;
  }, [selectedDay, summaryEvents]);

  const summaryMonthGrid = useMemo(() => {
    const monthStart = new Date(`${startOfMonthYmd(selectedMonth)}T12:00:00`);
    const monthEnd = new Date(`${endOfMonthYmd(selectedMonth)}T12:00:00`);
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - firstWeekday);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      const ymd = local.toISOString().slice(0, 10);
      return {
        ymd,
        day: date.getDate(),
        inMonth: date >= monthStart && date <= monthEnd,
        isToday: ymd === todayYmd(),
        events: summaryEvents.filter((event) => event.dateKey === ymd),
      };
    });
  }, [selectedMonth, summaryEvents]);

  const monthGrid = useMemo(() => {
    const monthStart = new Date(`${startOfMonthYmd(selectedMonth)}T12:00:00`);
    const monthEnd = new Date(`${endOfMonthYmd(selectedMonth)}T12:00:00`);
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - firstWeekday);

    const blocksByDay = new Map<string, Array<{
      id: string;
      techName: string;
      technicianId: string;
      note?: string;
      type: "VACATION" | "INTERNAL";
      timeLabel: string;
      color: ReturnType<typeof getEmployeeColor>;
    }>>();

    orderedItems.forEach((tech, index) => {
      const color = getEmployeeColor(index);
      tech.blocks
        .filter((block) => block.isActive && block.type !== "APPOINTMENT")
        .forEach((block) => {
          const monthBlock = block as typeof block & { type: "VACATION" | "INTERNAL" };
          const start = new Date(monthBlock.startAt);
          const end = new Date(monthBlock.endAt);
          const cursor = new Date(start);
          cursor.setHours(12, 0, 0, 0);
          const final = new Date(end);
          final.setHours(12, 0, 0, 0);

          while (cursor <= final) {
            const key = new Date(cursor.getTime() - cursor.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            if (key >= startOfMonthYmd(selectedMonth) && key <= endOfMonthYmd(selectedMonth)) {
              const list = blocksByDay.get(key) ?? [];
              list.push({
                id: monthBlock.id,
                techName: tech.name,
                technicianId: tech.technicianId,
                note: monthBlock.note || undefined,
                type: monthBlock.type,
                timeLabel: `${formatTime(monthBlock.startAt)} - ${formatTime(monthBlock.endAt)}`,
                color,
              });
              blocksByDay.set(key, list);
            }
            cursor.setDate(cursor.getDate() + 1);
          }
        });
    });

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      const ymd = local.toISOString().slice(0, 10);
      return {
        ymd,
        day: date.getDate(),
        inMonth: date >= monthStart && date <= monthEnd,
        isToday: ymd === todayYmd(),
        blocks: blocksByDay.get(ymd) ?? [],
      };
    });
  }, [orderedItems, selectedMonth]);

  function renderHoverCard(event: UiSummaryEvent) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-72 -translate-x-1/2 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-2xl group-hover:block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">{getBlockTypeLabel(event.type)}</p>
            <p className="mt-1 line-clamp-2 text-base font-black text-slate-900">{event.title}</p>
          </div>
          <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: event.color.solid }} />
        </div>
        <div className="mt-3 space-y-1 text-sm font-semibold text-slate-700">
          <p><span className="font-extrabold text-slate-900">Persona:</span> {event.techName}</p>
          <p><span className="font-extrabold text-slate-900">Hora:</span> {event.timeLabel}</p>
          {event.appointment?.clientName ? <p><span className="font-extrabold text-slate-900">Cliente:</span> {event.appointment.clientName}</p> : null}
          {event.appointment?.clientPhone ? <p><span className="font-extrabold text-slate-900">Teléfono:</span> {event.appointment.clientPhone}</p> : null}
          {event.appointment?.vehiclePlate ? <p><span className="font-extrabold text-slate-900">Matrícula:</span> {event.appointment.vehiclePlate}</p> : null}
          {event.appointment?.workType ? <p><span className="font-extrabold text-slate-900">Trabajo:</span> {event.appointment.workType}</p> : null}
          <p><span className="font-extrabold text-slate-900">Detalle:</span> {event.note || event.appointment?.notes || "Sin detalle añadido"}</p>
          {event.sourceId ? <p><span className="font-extrabold text-slate-900">Referencia:</span> #{event.sourceId}</p> : null}
        </div>
      </div>
    );
  }

  function renderSummaryChip(event: UiSummaryEvent, compact = false) {
    return (
      <button
        type="button"
        key={`${event.dateKey}-${event.id}`}
        onClick={() => setActiveEvent(event)}
        className={`btn-tap group relative w-full rounded-2xl border text-left shadow-sm ${compact ? "px-2 py-2" : "px-3 py-2.5"}`}
        style={getBlockSurfaceStyle(event.type, event.color)}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={`${compact ? "text-[10px]" : "text-xs"} font-extrabold`}>{event.timeLabel}</p>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${getBlockTypeBadgeClass(event.type)}`}>
            {event.techName}
          </span>
        </div>
        <p className={`mt-1 line-clamp-2 ${compact ? "text-[11px]" : "text-sm"} font-black`}>{event.title}</p>
        {renderHoverCard(event)}
      </button>
    );
  }

  const heroTitle =
    pane === "blocks"
      ? formatMonthTitle(selectedMonth)
      : formatSummaryTitle(summaryView, selectedDay, selectedMonth);

  function goToday() {
    const today = todayYmd();
    setSelectedDay(today);
    setSelectedMonth(startOfMonthYmd(today));
  }

  return (
    <main className="min-h-screen app-bg module-calendar mobile-nav-safe">
      {!canView ? (
        <section className="mx-auto mt-4 w-full max-w-6xl rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          No tienes permiso para ver este calendario.
        </section>
      ) : (
        <>
          {/* ── HERO ── */}
          <div
            className="relative overflow-hidden px-4 pb-6 pt-5 lg:pt-6"
            style={{
              backgroundImage:
                "linear-gradient(135deg, rgba(11,42,74,0.78) 0%, rgba(18,40,64,0.72) 55%, rgba(29,41,59,0.78) 100%), url('/banner-taller.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          >
            <div
              className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full opacity-10"
              style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }}
            />
            <div
              className="pointer-events-none absolute -bottom-8 left-0 h-48 w-48 rounded-full opacity-5"
              style={{ background: "radial-gradient(circle, #60a5fa 0%, transparent 70%)" }}
            />

            <div className="relative mx-auto w-full max-w-6xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-amber-400">Calendario</p>
                  <h1 className="mt-1 text-2xl font-black text-white capitalize sm:text-3xl">{heroTitle}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold text-white/80">
                      Citas: {totals.appointments}
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold text-white/80">
                      Vacaciones: {totals.vacations}
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold text-white/80">
                      Internos: {totals.internal}
                    </span>
                  </div>
                </div>

                <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
                  {/* Pestañas + Nueva cita */}
                  <div className="flex flex-wrap gap-2">
                    <VoiceAppointment />
                    <Link
                      href="/citas/nueva"
                      className="btn-tap rounded-full bg-amber-500 px-4 py-2 text-sm font-extrabold text-white shadow-md"
                    >
                      + Nueva cita
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPane("summary")}
                      className={`btn-tap rounded-full px-4 py-2 text-sm font-extrabold ${
                        pane === "summary" ? "bg-white text-slate-900" : "border border-white/20 bg-white/10 text-white/85"
                      }`}
                    >
                      Agenda
                    </button>
                    {canEdit ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setPane("blocks")}
                          className={`btn-tap rounded-full px-4 py-2 text-sm font-extrabold ${
                            pane === "blocks" ? "bg-white text-slate-900" : "border border-white/20 bg-white/10 text-white/85"
                          }`}
                        >
                          Bloqueos
                        </button>
                        <button
                          type="button"
                          onClick={() => setPane("schedule")}
                          className={`btn-tap rounded-full px-4 py-2 text-sm font-extrabold ${
                            pane === "schedule" ? "bg-white text-slate-900" : "border border-white/20 bg-white/10 text-white/85"
                          }`}
                        >
                          Horarios
                        </button>
                      </>
                    ) : null}
                  </div>

                  {/* Controles */}
                  {pane === "summary" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-2xl border border-white/15 bg-white/10 p-1">
                        {([
                          { key: "day" as const, label: "Día" },
                          { key: "week" as const, label: "Semana" },
                          { key: "month" as const, label: "Mes" },
                        ] as const).map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => changeSummaryView(opt.key)}
                            className={`btn-tap rounded-xl px-3 py-2 text-xs font-extrabold ${
                              summaryView === opt.key ? "bg-white text-slate-900" : "text-white/80 hover:bg-white/10"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => moveSummaryView(-1)}
                        className="btn-tap rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-extrabold text-white/85"
                        title="Anterior"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={goToday}
                        className="btn-tap rounded-xl bg-amber-500 px-3 py-2 text-xs font-extrabold text-slate-900"
                      >
                        Hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSummaryView(1)}
                        className="btn-tap rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-extrabold text-white/85"
                        title="Siguiente"
                      >
                        ›
                      </button>

                      <label className="relative inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white/85">
                        <Icon name="calendar" className="h-4 w-4" />
                        <span className="sr-only">Elegir fecha</span>
                        {summaryView === "month" ? (
                          <input
                            type="month"
                            className="absolute inset-0 cursor-pointer opacity-0"
                            value={selectedMonth.slice(0, 7)}
                            onChange={(e) => setSelectedMonth(`${e.target.value}-01`)}
                          />
                        ) : (
                          <input
                            type="date"
                            className="absolute inset-0 cursor-pointer opacity-0"
                            value={selectedDay}
                            onChange={(e) => {
                              setSelectedDay(e.target.value);
                              setSelectedMonth(startOfMonthYmd(e.target.value));
                            }}
                          />
                        )}
                      </label>
                    </div>
                  ) : pane === "blocks" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMonth((current) => shiftMonthYmd(current, -1))}
                        className="btn-tap rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-extrabold text-white/85"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={goToday}
                        className="btn-tap rounded-xl bg-amber-500 px-3 py-2 text-xs font-extrabold text-slate-900"
                      >
                        Este mes
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMonth((current) => shiftMonthYmd(current, 1))}
                        className="btn-tap rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-extrabold text-white/85"
                      >
                        ›
                      </button>
                      <input
                        type="month"
                        className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-extrabold text-white/85"
                        value={selectedMonth.slice(0, 7)}
                        onChange={(e) => setSelectedMonth(`${e.target.value}-01`)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* ── KPI STRIP ── */}
          <div className="mx-auto w-full max-w-6xl px-4 pt-4">
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => { setPane("summary"); setSummaryView("week"); }}
                className={`btn-tap rounded-2xl p-4 text-left text-white transition-opacity ${pane === "summary" ? "bg-[#0b2a4a]" : "bg-[#0b2a4a]/70"}`}
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70">Citas</p>
                <p className="mt-1 text-5xl font-black leading-none">{totals.appointments}</p>
                <p className="mt-1 text-xs font-semibold opacity-75">Este periodo</p>
              </button>
              <button
                onClick={() => { setPane("blocks"); }}
                className="btn-tap rounded-2xl bg-rose-600 p-4 text-left text-white"
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70">Vacaciones</p>
                <p className="mt-1 text-5xl font-black leading-none">{totals.vacations}</p>
                <p className="mt-1 text-xs font-semibold opacity-75">Activas</p>
              </button>
              <button
                onClick={() => { setPane("blocks"); }}
                className="btn-tap rounded-2xl bg-amber-500 p-4 text-left text-white"
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70">Bloqueos</p>
                <p className="mt-1 text-5xl font-black leading-none">{totals.internal}</p>
                <p className="mt-1 text-xs font-semibold opacity-75">Internos</p>
              </button>
            </div>
          </div>

          {/* ── CONTENIDO ── */}
          <div className="mx-auto w-full max-w-6xl px-4 pt-4">
            {pending.length > 0 && (
              <section className="space-y-2">
                {pending.map((item) => {
                  const secs = Math.max(0, Math.ceil((item.executeAt - nowTs) / 1000));
                  return (
                    <article key={item.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-extrabold text-amber-900">{item.label} en {secs}s</p>
                        <button onClick={() => undoAction(item.id)} className="btn-tap rounded-xl bg-amber-500 px-3 py-2 text-xs font-extrabold text-slate-900">
                          Deshacer
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}

          {canEdit && pane === "blocks" && (
            <section className="mt-4 space-y-4">
              <article className="surface-content p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">Marcar ausencia o bloqueo</h2>
                <InfoHint text="Marca ausencias para quitar esos huecos." />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <select className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={blockTech} onChange={(e) => setBlockTech(e.target.value)}>
                  {techOptions.length === 0 && <option value="">Sin usuarios</option>}
                  {techOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={blockType} onChange={(e) => setBlockType(e.target.value as "VACATION" | "INTERNAL") }>
                  <option value="VACATION">{timeBlockFormLabel("VACATION")}</option>
                  <option value="INTERNAL">{timeBlockFormLabel("INTERNAL")}</option>
                </select>
                <input type="datetime-local" className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
                <input type="datetime-local" className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
                <input className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold xl:col-span-2" placeholder="Explica brevemente este bloqueo" value={blockNote} onChange={(e) => setBlockNote(e.target.value)} />
                <button onClick={() => void createBlock()} disabled={savingBlock} className="cta-primary px-4 py-4 text-sm disabled:opacity-50 xl:col-span-1">
                  {savingBlock ? "Guardando..." : "Guardar ausencia"}
                </button>
              </div>
              </article>

              <article className="surface-content overflow-hidden p-0">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Bloqueos del mes</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">Vacaciones e internos.</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
                    <div key={day} className="border-r border-slate-200 px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-500 last:border-r-0">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-7">
                  {monthGrid.map((cell) => (
                    <div
                      key={cell.ymd}
                      className={`min-h-[156px] border-b border-r border-slate-200 p-3 ${cell.inMonth ? "bg-white" : "bg-slate-50"} ${cell.isToday ? "ring-2 ring-inset ring-blue-500" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-extrabold ${cell.inMonth ? "text-slate-900" : "text-slate-400"}`}>{cell.day}</p>
                        {cell.blocks.length > 0 ? (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-extrabold text-slate-600">
                            {cell.blocks.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-2">
                        {cell.blocks.length === 0 ? (
                          <p className="text-[11px] font-semibold text-slate-400">{cell.inMonth ? "Sin bloqueos" : " "}</p>
                        ) : (
                          cell.blocks.slice(0, 4).map((block) => (
                            <div key={`${cell.ymd}-${block.id}`} className="rounded-2xl border px-2 py-2" style={getBlockSurfaceStyle(block.type, block.color)}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-[11px] font-extrabold">{block.techName}</p>
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${getBlockTypeBadgeClass(block.type)}`}>
                                  {getBlockTypeLabel(block.type)}
                                </span>
                              </div>
                              <p className="mt-1 text-[10px] font-semibold">{block.timeLabel}</p>
                            </div>
                          ))
                        )}
                        {cell.blocks.length > 4 ? (
                          <p className="text-[11px] font-extrabold text-slate-500">+{cell.blocks.length - 4} más</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {canEdit && pane === "schedule" && (
            <section id="horario-semanal" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <article className="surface-content p-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">Horario por persona</h2>
                  <InfoHint text="El horario es por persona, no por rol." />
                </div>
                <div className="mt-4 space-y-3">
                  <select className="w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={blockTech} onChange={(e) => setBlockTech(e.target.value)}>
                    {techOptions.length === 0 && <option value="">Sin usuarios</option>}
                    {techOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <select className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={ruleDay} onChange={(e) => setRuleDay(Number(e.target.value))}>
                      {dayLabel.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                    </select>
                    <input type="time" className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={ruleStart} onChange={(e) => setRuleStart(e.target.value)} />
                    <input type="time" className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={ruleEnd} onChange={(e) => setRuleEnd(e.target.value)} />
                  </div>
                  <button onClick={() => void createRule()} className="cta-primary w-full p-4 text-sm">Guardar este tramo</button>
                </div>
              </article>

              <article className="surface-content p-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">Aplicar horario rápido L-V</h2>
                  <InfoHint text="Mismo horario para lunes a viernes en un paso." />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input type="time" className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
                  <input type="time" className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} />
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={replaceWeekRules} onChange={(e) => setReplaceWeekRules(e.target.checked)} />
                  Reemplazar tramos actuales de lunes a viernes
                </label>
                <button onClick={() => void applyWeekTemplate()} disabled={savingWeekRules} className="mt-3 cta-primary w-full p-4 text-sm disabled:opacity-50">
                  {savingWeekRules ? "Aplicando..." : "Guardar horario de la semana"}
                </button>

                <div className="mt-4 border-t-2 border-slate-100 pt-4">
                  <h3 className="text-sm font-extrabold text-slate-900">Horario guardado</h3>
                  <div className="mt-3 space-y-2">
                    {rules.length === 0 && <p className="text-sm font-semibold text-slate-500">Todavía no hay horario guardado.</p>}
                    {rules.map((r) => (
                      <div key={r.id} className="rounded-2xl border-2 border-slate-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-extrabold text-slate-900">{dayLabel[r.dayOfWeek]} · {r.startTime} - {r.endTime}</p>
                          {r.weekPattern !== "ALL" ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-extrabold text-slate-700">
                              Semana {r.weekPattern}
                            </span>
                          ) : null}
                        </div>
                        <button onClick={() => void removeRule(r.id)} className="mt-2 rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-800">
                          Eliminar tramo
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </section>
          )}

          {canEdit && pane === "schedule" && (
            <section className="mt-4">
              <article className="surface-content p-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">Horarios alternos (Semana A/B)</h2>
                  <InfoHint text="Crea los turnos en dos semanas y la app alterna automáticamente." />
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  Carga de una vez los horarios que me has pasado (incluye crear a Josete si no existe).
                </p>
                <button
                  onClick={() => void applyMaluRotation()}
                  disabled={applyingRotation}
                  className="mt-3 cta-primary w-full p-4 text-sm disabled:opacity-50"
                >
                  {applyingRotation ? "Aplicando..." : "Cargar horarios alternos ahora"}
                </button>
              </article>
            </section>
          )}

          {error ? <section className="mx-auto mt-4 w-full max-w-6xl rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</section> : null}

          {pane === "summary" && (
            <section className="mt-4">
              {loading ? (
                <article className="surface-history p-4 text-sm font-semibold text-slate-600">Cargando agenda...</article>
              ) : items.length === 0 ? (
                <article className="surface-history p-4 text-sm font-semibold text-slate-600">
                  No hay nada previsto o no hay personas activas.
                </article>
              ) : (
                <div className="space-y-4">
                  <article className="surface-content overflow-visible p-0">
                    {summaryView === "day" ? (
                      <div className="overflow-x-auto">
                        <div className="min-w-[920px]">
                          <div
                            className="grid border-b border-slate-200"
                            style={{ gridTemplateColumns: `88px repeat(${summaryRows.length}, minmax(180px, 1fr))` }}
                          >
                            <div className="border-r border-slate-200 bg-white px-3 py-4">
                              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Hora</p>
                            </div>
                            {summaryRows.map((tech) => (
                              <div key={`${tech.technicianId}-header`} className="border-r border-slate-200 px-4 py-4 last:border-r-0" style={{ backgroundColor: tech.color.soft }}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-extrabold" style={{ color: tech.color.text }}>{tech.name}</p>
                                    <p className="mt-1 text-[11px] font-semibold text-slate-600">{tech.blocks.length} bloque(s)</p>
                                  </div>
                                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tech.color.solid }} />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div
                            className="grid"
                            style={{ gridTemplateColumns: `88px repeat(${summaryRows.length}, minmax(180px, 1fr))` }}
                          >
                            <div className="border-r border-slate-200 bg-slate-50">
                              {dayGrid.map((slot) => (
                                <div
                                  key={`time-${slot.index}`}
                                  className={`px-2 text-[11px] font-bold text-slate-500 ${slot.isHour ? "bg-slate-100 text-slate-700" : ""}`}
                                  style={{ height: `${DAY_ROW_HEIGHT}px`, lineHeight: `${DAY_ROW_HEIGHT}px` }}
                                >
                                  {slot.label}
                                </div>
                              ))}
                            </div>

                            {summaryRows.map((tech) => (
                              <div key={`${tech.technicianId}-column`} className="relative border-r border-slate-200 last:border-r-0" style={{ height: `${DAY_GRID_HEIGHT}px` }}>
                                <div className="absolute inset-0">
                                  {dayGrid.map((slot) => (
                                    <div
                                      key={`${tech.technicianId}-grid-${slot.index}`}
                                      className={`border-b ${slot.isHour ? "border-slate-300" : "border-slate-100"}`}
                                      style={{ height: `${DAY_ROW_HEIGHT}px` }}
                                    />
                                  ))}
                                </div>
                                {tech.blocks.map((block) => {
                                  const showNote = block.height >= 84;
                                  const hoverEvent: UiSummaryEvent = {
                                    ...block,
                                    technicianId: tech.technicianId,
                                    techName: tech.name,
                                    color: tech.color,
                                    dateKey: dateKeyFromIso(block.startAt),
                                    title: getBlockTitle(block),
                                    timeLabel: block.timeLabel,
                                  };

                                  return (
                                    <button
                                      type="button"
                                      key={block.id}
                                      className="group absolute left-2 right-2 overflow-visible rounded-2xl border px-2 py-2 shadow-sm"
                                      style={{
                                        top: `${block.top}px`,
                                        height: `${block.height}px`,
                                        ...getBlockSurfaceStyle(block.type, tech.color),
                                      }}
                                      onClick={() => setActiveEvent(hoverEvent)}
                                    >
                                      <div className="flex h-full flex-col overflow-hidden">
                                        <div className="flex items-start justify-between gap-2">
                                          <p className="text-[10px] font-extrabold uppercase tracking-wide">{getBlockTypeLabel(block.type)}</p>
                                          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase ${getBlockTypeBadgeClass(block.type)}`}>
                                            {tech.name}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-[11px] font-extrabold sm:text-xs">{block.timeLabel}</p>
                                        {showNote ? (
                                          <p className="mt-1 line-clamp-1 text-[10px] font-semibold sm:text-[11px]">{block.note || "Sin detalle añadido"}</p>
                                        ) : null}
                                      </div>
                                      {renderHoverCard(hoverEvent)}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : summaryView === "week" ? (
                      <div className="overflow-x-auto">
                        <div className="min-w-[1020px]">
                          <div
                            className="grid border-b border-slate-200"
                            style={{ gridTemplateColumns: `88px repeat(7, minmax(130px, 1fr))` }}
                          >
                            <div className="border-r border-slate-200 bg-white px-3 py-3">
                              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Hora</p>
                            </div>
                            {weekGrid.map((day) => (
                              <div key={`${day.ymd}-header`} className="border-r border-slate-200 px-3 py-3 last:border-r-0">
                                <p className="text-sm font-black capitalize text-slate-900">{day.label}</p>
                                <p className="mt-0.5 text-[11px] font-bold text-slate-500">{day.events.length} evento(s)</p>
                                {day.isToday ? <span className="mt-1 inline-flex rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-extrabold text-white">Hoy</span> : null}
                              </div>
                            ))}
                          </div>

                          {weekHours.map((hour, index) => (
                            <div
                              key={hour}
                              className="grid border-b border-slate-100"
                              style={{ gridTemplateColumns: `88px repeat(7, minmax(130px, 1fr))` }}
                            >
                              <div className={`border-r border-slate-200 px-2 py-3 text-[11px] font-extrabold ${index % 2 === 0 ? "bg-slate-50 text-slate-700" : "bg-white text-slate-500"}`}>
                                {hour}
                              </div>
                              {weekGrid.map((day) => {
                                const key = `${day.ymd}-${hour}`;
                                const events = weekEventsByHour.get(key) ?? [];
                                return (
                                  <div key={key} className={`border-r border-slate-200 p-2 last:border-r-0 ${day.isToday ? "bg-blue-50/40" : "bg-white"}`}>
                                    <div className="space-y-1.5">
                                      {events.length === 0 ? (
                                        <div className="min-h-[22px]" />
                                      ) : (
                                        events.slice(0, 2).map((event) => renderSummaryChip(event, true))
                                      )}
                                      {events.length > 2 ? (
                                        <p className="text-[10px] font-extrabold text-slate-500">+{events.length - 2} más</p>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
                            <div key={day} className="border-r border-slate-200 px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-slate-500 last:border-r-0">
                              {day}
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-7">
                          {summaryMonthGrid.map((cell) => (
                            <div
                              key={cell.ymd}
                              className={`min-h-[150px] border-b border-r border-slate-200 p-3 ${cell.inMonth ? "bg-white" : "bg-slate-50"} ${cell.isToday ? "ring-2 ring-inset ring-blue-500" : ""}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm font-extrabold ${cell.inMonth ? "text-slate-900" : "text-slate-400"}`}>{cell.day}</p>
                                {cell.events.length > 0 ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-extrabold text-slate-600">{cell.events.length}</span>
                                ) : null}
                              </div>
                              <div className="mt-3 space-y-2">
                                {cell.events.length === 0 ? (
                                  <p className="text-[11px] font-semibold text-slate-400">{cell.inMonth ? "Sin actividad" : " "}</p>
                                ) : (
                                  cell.events.slice(0, 3).map((event) => renderSummaryChip(event, true))
                                )}
                                {cell.events.length > 3 ? (
                                  <p className="text-[11px] font-extrabold text-slate-500">+{cell.events.length - 3} más</p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </article>
                </div>
              )}
            </section>
          )}
          </div>

          {/* ── MODAL EVENTO ── */}
          {activeEvent ? (
            <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/60 p-3 sm:items-center">
              <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                      {getBlockTypeLabel(activeEvent.type)}
                    </p>
                    <p className="mt-1 text-base font-black text-slate-900">{activeEvent.title}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{activeEvent.timeLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveEvent(null)}
                    className="btn-tap rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700"
                  >
                    Cerrar
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeEvent.color.solid }} />
                    {activeEvent.techName}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${getBlockTypeBadgeClass(activeEvent.type)}`}>
                    {getBlockTypeLabel(activeEvent.type)}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm font-semibold text-slate-700">
                  {activeEvent.appointment?.clientName ? <p><span className="font-extrabold text-slate-900">Cliente:</span> {activeEvent.appointment.clientName}</p> : null}
                  {activeEvent.appointment?.clientPhone ? <p><span className="font-extrabold text-slate-900">Teléfono:</span> {activeEvent.appointment.clientPhone}</p> : null}
                  {activeEvent.appointment?.vehiclePlate ? <p><span className="font-extrabold text-slate-900">Matrícula:</span> {activeEvent.appointment.vehiclePlate}</p> : null}
                  {activeEvent.appointment?.workType ? <p><span className="font-extrabold text-slate-900">Trabajo:</span> {activeEvent.appointment.workType}</p> : null}
                  <p><span className="font-extrabold text-slate-900">Detalle:</span> {activeEvent.note || activeEvent.appointment?.notes || "Sin detalle añadido"}</p>
                  {activeEvent.sourceId ? <p><span className="font-extrabold text-slate-900">Referencia:</span> #{activeEvent.sourceId}</p> : null}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {activeEvent.type === "APPOINTMENT" && activeEvent.sourceId ? (
                    <Link href={`/citas/${activeEvent.sourceId}`} className="btn-tap rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-extrabold text-white">
                      Abrir cita
                    </Link>
                  ) : (
                    <div />
                  )}
                  {activeEvent.type === "APPOINTMENT" && activeEvent.sourceId && canCancelAppointments ? (
                    <button
                      type="button"
                      onClick={() => {
                        const id = activeEvent.sourceId!;
                        setActiveEvent(null);
                        void cancelAppt(id);
                      }}
                      className="btn-tap rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-extrabold text-rose-700"
                    >
                      Cancelar cita
                    </button>
                  ) : null}
                  {activeEvent.type !== "APPOINTMENT" && canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        const techId = activeEvent.technicianId;
                        const blockId = activeEvent.id;
                        setActiveEvent(null);
                        void removeBlock(techId, blockId);
                      }}
                      className="btn-tap rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800"
                    >
                      Quitar bloqueo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* ── MODAL: CANCELAR CITA ── */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-base font-extrabold text-slate-900">Cancelar cita</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">Indica el motivo de la cancelación.</p>
            <textarea
              className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-base font-semibold outline-none focus:border-rose-400 focus:bg-white"
              placeholder="Motivo de cancelación…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex gap-3">
              <button
                className="btn-tap flex-1 rounded-2xl border-2 border-slate-200 bg-slate-50 py-3.5 text-sm font-extrabold text-slate-700"
                onClick={() => setCancelModal(null)}
              >
                Volver
              </button>
              <button
                className="btn-tap flex-1 rounded-2xl bg-rose-600 py-3.5 text-sm font-extrabold text-white"
                onClick={confirmCancel}
              >
                Cancelar cita
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-2xl px-5 py-3 shadow-2xl text-sm font-extrabold text-white transition-all ${
          toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"
        }`}>
          {toast.message}
        </div>
      )}

      <MobileNav />
    </main>
  );
}
