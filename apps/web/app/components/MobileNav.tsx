'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./ui/Icon";
import BrandMark from "./ui/BrandMark";
import { listInventoryProducts, listWorkOrders } from "../core/ordersApi";
import { buildAlerts, getActiveAlertsCount } from "../core/alerts";
import { listOpenHelpRequests } from "../core/helpRequests";
import { useSession } from "./useSession";
import type { Role } from "./useSession";
import { canAccessRoute, type RouteKey } from "../core/routePermissions";

// ─── Types ────────────────────────────────────────────────────────────────────

type MobileSection =
  | "inicio" | "taller" | "avisos" | "perfil"
  | "ordenes" | "citas" | "tecnico" | "inventario";

type DesktopSection =
  | "inicio" | "taller" | "ordenes" | "calendario"
  | "inventario" | "avisos" | "perfil" | "usuarios";

type NavIcon =
  | "home" | "workshop" | "bell" | "profile"
  | "orders" | "new" | "inventory" | "play";

type MobileNavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  section: MobileSection;
};

// ─── Role-adaptive mobile nav ────────────────────────────────────────────────

const ROLE_PRIORITY: Role[] = [
  "Administración", "Jefe de Taller", "Oficina",
  "Inventario", "Contabilidad", "Técnico",
];

function getPrimaryRole(roles: Role[]): Role {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? roles[0] ?? "Técnico";
}

function getMobileItems(role: Role): MobileNavItem[] {
  const inicio:   MobileNavItem = { href: "/inicio",   label: "Inicio",   icon: "home",     section: "inicio"    };
  const perfil:   MobileNavItem = { href: "/perfil",   label: "Perfil",   icon: "profile",  section: "perfil"    };
  const avisos:   MobileNavItem = { href: "/avisos",   label: "Avisos",   icon: "bell",     section: "avisos"    };
  const taller:   MobileNavItem = { href: "/taller",   label: "Taller",   icon: "workshop", section: "taller"    };
  const trabajos: MobileNavItem = { href: "/ordenes",  label: "Trabajos", icon: "orders",   section: "ordenes"   };

  switch (role) {
    case "Técnico":
      return [
        inicio,
        { href: "/tecnico/simple", label: "Mi trabajo", icon: "play",      section: "tecnico"    },
        avisos,
        perfil,
      ];
    case "Oficina":
      return [
        inicio,
        { href: "/citas/nueva",    label: "Nueva cita", icon: "new",       section: "citas"      },
        trabajos,
        perfil,
      ];
    case "Jefe de Taller":
    case "Administración":
      return [inicio, taller, trabajos, perfil];
    case "Inventario":
      return [
        inicio,
        { href: "/inventario", label: "Inventario", icon: "inventory", section: "inventario" },
        avisos,
        perfil,
      ];
    case "Contabilidad":
      return [inicio, trabajos, avisos, perfil];
    default:
      return [inicio, taller, avisos, perfil];
  }
}

// ─── Active section resolution ────────────────────────────────────────────────

function getActiveSection(pathname: string): MobileSection {
  if (pathname === "/avisos") return "avisos";
  if (pathname === "/perfil" || pathname.startsWith("/ajustes")) return "perfil";
  if (pathname.startsWith("/tecnico")) return "tecnico";
  if (pathname.startsWith("/citas")) return "citas";
  if (pathname.startsWith("/inventario")) return "inventario";
  if (pathname.startsWith("/ordenes")) return "ordenes";
  if (pathname.startsWith("/taller") || pathname.startsWith("/calendario")) return "taller";
  return "inicio";
}

function resolveDesktopSection(pathname: string): DesktopSection {
  if (pathname === "/perfil") return "perfil";
  if (pathname.startsWith("/ajustes/usuarios") || pathname === "/usuarios") return "usuarios";
  if (pathname.startsWith("/ajustes")) return "perfil";
  if (pathname === "/avisos") return "avisos";
  if (pathname === "/taller" || pathname.startsWith("/tecnico")) return "taller";
  if (pathname.startsWith("/inventario")) return "inventario";
  if (pathname.startsWith("/calendario")) return "calendario";
  if (pathname.startsWith("/ordenes") || pathname.startsWith("/citas")) return "ordenes";
  return "inicio";
}

// ─── Desktop nav items ────────────────────────────────────────────────────────

const DESKTOP_MAIN_ITEMS: Array<{
  href: string; label: string; key: RouteKey; section: DesktopSection;
}> = [
  { href: "/inicio",           label: "Inicio",     key: "inicio",     section: "inicio"     },
  { href: "/taller",           label: "Taller",     key: "taller",     section: "taller"     },
  { href: "/ordenes",          label: "Trabajos",   key: "ordenes",    section: "ordenes"    },
  { href: "/calendario",       label: "Calendario", key: "calendario", section: "calendario" },
  { href: "/inventario",       label: "Inventario", key: "inventario", section: "inventario" },
  { href: "/ajustes/usuarios", label: "Usuarios",   key: "usuarios",   section: "usuarios"   },
];

const DESKTOP_ICON_ITEMS: Array<{
  href: string; label: string; icon: "bell" | "profile"; key: RouteKey; section: DesktopSection;
}> = [
  { href: "/avisos", label: "Avisos", icon: "bell",    key: "avisos", section: "avisos" },
  { href: "/perfil", label: "Perfil", icon: "profile", key: "perfil", section: "perfil" },
];

// ─── FAB ─────────────────────────────────────────────────────────────────────

type FabConfig = { href: string; label: string } | null;

function getFabConfig(role: Role, pathname: string): FabConfig {
  if (role === "Jefe de Taller" || role === "Administración") {
    const onFabPage = pathname === "/inicio" || pathname === "/taller" || pathname === "/ordenes";
    if (!onFabPage) return null;
    return { href: "/ordenes/nueva", label: "Nueva OT" };
  }
  return null;
}

// ─── Alert sound ─────────────────────────────────────────────────────────────

function playAlertSound() {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // Sin audio disponible.
  }
}

function notifyNewAlerts(prev: number, next: number) {
  if (next <= prev) return;
  if ("vibrate" in navigator) navigator.vibrate([80, 50, 80]);
  playAlertSound();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MobileNav() {
  const pathname = usePathname();
  const activeSection = useMemo(() => getActiveSection(pathname), [pathname]);
  const activeDesktopSection = useMemo(() => resolveDesktopSection(pathname), [pathname]);
  const [alertsCount, setAlertsCount] = useState(0);
  const [, setLastNotifiedCount] = useState<number | null>(null);
  const { activeUser } = useSession();
  const activeRoles = activeUser?.roles ?? [];

  const primaryRole = useMemo(() => getPrimaryRole(activeRoles), [activeRoles]);
  const mobileItems = useMemo(() => getMobileItems(primaryRole), [primaryRole]);
  const fabConfig = useMemo(() => getFabConfig(primaryRole, pathname), [primaryRole, pathname]);

  const desktopMainItems = useMemo(
    () => DESKTOP_MAIN_ITEMS.filter((item) => canAccessRoute(activeRoles, item.key)),
    [activeRoles],
  );
  const desktopIconItems = useMemo(
    () => DESKTOP_ICON_ITEMS.filter((item) => canAccessRoute(activeRoles, item.key)),
    [activeRoles],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAlertsCount() {
      try {
        const [orders, products] = await Promise.all([listWorkOrders(), listInventoryProducts()]);
        if (cancelled) return;
        const help = listOpenHelpRequests();
        const alerts = buildAlerts(orders, products, help);
        const next = getActiveAlertsCount(alerts);
        setAlertsCount(next);
        setLastNotifiedCount((prev) => {
          if (prev === null) return next;
          if (document.visibilityState === "visible") notifyNewAlerts(prev, next);
          return next;
        });
      } catch {
        if (!cancelled) {
          setAlertsCount(0);
          setLastNotifiedCount((prev) => (prev === null ? 0 : prev));
        }
      }
    }

    void loadAlertsCount();
    const onFocus = () => void loadAlertsCount();
    const onVisibility = () => document.visibilityState === "visible" && void loadAlertsCount();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      {/* ── Desktop top nav ── */}
      <nav className="desktop-top-nav hidden lg:block" aria-label="Navegación principal escritorio">
        <div className="desktop-top-nav__inner">
          <div className="desktop-top-nav__left">
            <Link href="/inicio" className="desktop-top-nav__brand" aria-label="Ir a inicio">
              <BrandMark compact />
            </Link>
            {desktopMainItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activeDesktopSection === item.section ? "page" : undefined}
                className={`desktop-top-nav__link ${activeDesktopSection === item.section ? "is-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="desktop-top-nav__right">
            {desktopIconItems.map((item) => {
              const active = activeDesktopSection === item.section;
              const showBadge = item.key === "avisos" && alertsCount > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`desktop-top-nav__icon-link ${active ? "is-active" : ""}`}
                  title={item.label}
                >
                  {showBadge ? (
                    <span className="desktop-top-nav__badge">{alertsCount > 9 ? "9+" : alertsCount}</span>
                  ) : null}
                  <Icon name={item.icon} className="h-5 w-5" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ── FAB (solo móvil) ── */}
      {fabConfig && (
        <Link
          href={fabConfig.href}
          className="sm:hidden fixed bottom-20 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-extrabold text-white shadow-xl"
          aria-label={fabConfig.label}
        >
          <Icon name="new" className="h-4 w-4" />
          {fabConfig.label}
        </Link>
      )}

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-bottom-nav sm:hidden" aria-label="Navegación principal">
        <ul className="mobile-bottom-nav__list">
          {mobileItems.map((item) => {
            const active = activeSection === item.section;
            const showBadge = item.section === "avisos" && alertsCount > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`mobile-bottom-nav__item btn-tap ${active ? "is-active" : ""}`}
                >
                  {showBadge ? (
                    <span className="mobile-bottom-nav__badge">{alertsCount > 9 ? "9+" : alertsCount}</span>
                  ) : null}
                  <span className="mobile-bottom-nav__icon" aria-hidden="true">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <span className="mobile-bottom-nav__label">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
