'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MobileNav from "../components/MobileNav";
import { useSession } from "../components/useSession";
import {
  adjustInventoryStock,
  createInventoryProduct,
  findInventoryProductByBarcode,
  listInventoryMoves,
  listInventoryProducts,
  type InventoryMove,
  type InventoryProduct,
  updateInventoryProduct,
} from "../core/ordersApi";
import { Icon } from "../components/ui/Icon";
import InfoHint from "../components/ui/InfoHint";
import { semaphoreBadgeClass, stockSemaphore, semaphorePlainLabel } from "../core/semaphore";

type Unit = "ud" | "l" | "m";
type ScanMode = "edit_or_create" | "lookup";
type InventoryView = "scan" | "new" | "moves" | "low";

type ProductQuickModal = {
  product: InventoryProduct;
  mode: "lookup" | "low" | "recent";
} | null;

type ProductForm = {
  id: string;
  name: string;
  description: string;
  stock: string;
  minStock: string;
  unit: Unit;
  location: string;
  barcode: string;
};

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function onlyDigits(v: string): string {
  return (v || "").replace(/\D+/g, "");
}

function calcEan13CheckDigit(base12: string): string {
  const digits = base12.split("").map((x) => Number(x));
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const mod = sum % 10;
  return String((10 - mod) % 10);
}

function toEan13(code: string): string {
  const d = onlyDigits(code);
  if (d.length >= 13) return d.slice(0, 13);
  const base = d.padStart(12, "0").slice(-12);
  return base + calcEan13CheckDigit(base);
}

function barcodeFromSku(sku: string): string {
  const raw = onlyDigits(sku);
  if (raw.length >= 12) return toEan13(raw);
  const now = String(Date.now()).slice(-8);
  return toEan13(`${raw}${now}`);
}

function eanToBits(ean13: string): string {
  const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
  const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
  const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
  const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

  const ds = ean13.split("").map((x) => Number(x));
  const first = ds[0];
  const parity = PARITY[first];
  let bits = "101";

  for (let i = 1; i <= 6; i += 1) {
    const n = ds[i];
    bits += parity[i - 1] === "L" ? L[n] : G[n];
  }

  bits += "01010";
  for (let i = 7; i <= 12; i += 1) bits += R[ds[i]];
  bits += "101";
  return bits;
}

function BarcodeSvg({ value }: { value: string }) {
  const ean = toEan13(value);
  const bits = eanToBits(ean);
  const width = bits.length * 2 + 16;
  const height = 76;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full rounded-md border border-slate-200 bg-white">
      <rect x="0" y="0" width={width} height={height} fill="white" />
      {bits.split("").map((b, i) =>
        b === "1" ? <rect key={i} x={8 + i * 2} y={6} width={2} height={56} fill="#0f172a" /> : null,
      )}
      <text x={width / 2} y={72} textAnchor="middle" fontSize="10" fill="#0f172a" fontWeight="700">
        {ean}
      </text>
    </svg>
  );
}

function barcodeSvgMarkup(value: string): string {
  const ean = toEan13(value);
  const bits = eanToBits(ean);
  const width = bits.length * 2 + 16;
  const height = 76;
  const bars = bits
    .split("")
    .map((b, i) => (b === "1" ? `<rect x="${8 + i * 2}" y="6" width="2" height="56" fill="#0f172a" />` : ""))
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
    ${bars}
    <text x="${width / 2}" y="72" text-anchor="middle" font-size="10" fill="#0f172a" font-weight="700">${ean}</text>
  </svg>`;
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emptyForm(): ProductForm {
  return {
    id: "",
    name: "",
    description: "",
    stock: "0",
    minStock: "0",
    unit: "ud",
    location: "",
    barcode: "",
  };
}

export default function InventarioPage() {
  const { hasRole } = useSession();
  const searchParams = useSearchParams();
  const canManage = hasRole("Inventario") || hasRole("Administración");

  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [moves, setMoves] = useState<InventoryMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [createForm, setCreateForm] = useState<ProductForm>(emptyForm());
  const [editingId, setEditingId] = useState<string>("");
  const [editForm, setEditForm] = useState<ProductForm>(emptyForm());
  const [adjustDelta, setAdjustDelta] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("edit_or_create");
  const [scanMessage, setScanMessage] = useState("");
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanLocked, setScanLocked] = useState(false);
  const [lookupProduct, setLookupProduct] = useState<InventoryProduct | null>(null);
  const [quickModal, setQuickModal] = useState<ProductQuickModal>(null);
  const [activeView, setActiveView] = useState<InventoryView>("scan");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  async function load() {
    setError("");
    try {
      const [p, m] = await Promise.all([listInventoryProducts(), listInventoryMoves(25)]);
      setProducts(p);
      setMoves(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar inventario");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    const onVisibility = () => document.visibilityState === "visible" && void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopScan();
    };
  }, []);

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "scan" || view === "new" || view === "moves" || view === "low") {
      setActiveView(view);
    }
  }, [searchParams]);

  const lowStock = useMemo(
    () => products.filter((p) => p.stock <= p.minStock).sort((a, b) => a.stock - b.stock),
    [products],
  );

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === editingId) ?? null,
    [products, editingId],
  );

  const totals = useMemo(() => {
    return {
      products: products.length,
      low: lowStock.length,
      moves: moves.length,
    };
  }, [products.length, lowStock.length, moves.length]);

  function setCreateField<K extends keyof ProductForm>(k: K, v: ProductForm[K]) {
    setCreateForm((prev) => ({ ...prev, [k]: v }));
  }

  function setEditField<K extends keyof ProductForm>(k: K, v: ProductForm[K]) {
    setEditForm((prev) => ({ ...prev, [k]: v }));
  }

  function loadEditFormFromProduct(p: InventoryProduct) {
    setActiveView("new");
    setEditingId(p.id);
    setEditForm({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      stock: String(p.stock),
      minStock: String(p.minStock),
      unit: p.unit as Unit,
      location: p.location ?? "",
      barcode: p.barcode ?? "",
    });
    setAdjustDelta("0");
    setAdjustReason("");
  }

  async function handleCreateProduct() {
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    try {
      const sku = createForm.id.trim().toUpperCase();
      const code = createForm.barcode.trim() || barcodeFromSku(sku);
      await createInventoryProduct({
        id: sku,
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        stock: Number(createForm.stock || 0),
        minStock: Number(createForm.minStock || 0),
        unit: createForm.unit,
        location: createForm.location.trim(),
        barcode: code,
      });
      setCreateForm(emptyForm());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el producto");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateProduct() {
    if (!canManage || !selectedProduct || saving) return;
    setSaving(true);
    setError("");
    try {
      await updateInventoryProduct({
        id: selectedProduct.id,
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        minStock: Number(editForm.minStock || 0),
        unit: editForm.unit,
        location: editForm.location.trim(),
        barcode: editForm.barcode.trim(),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el producto");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjustStock() {
    if (!canManage || !selectedProduct || saving) return;
    setSaving(true);
    setError("");
    try {
      await adjustInventoryStock({
        id: selectedProduct.id,
        delta: Number(adjustDelta || 0),
        reason: adjustReason.trim() || undefined,
      });
      setAdjustDelta("0");
      setAdjustReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ajustar stock");
    } finally {
      setSaving(false);
    }
  }

  function applyScannedBarcode(code: string) {
    const clean = onlyDigits(code);
    if (!clean) return;
    setScannedBarcode(clean);
    setScanMessage(`Código detectado: ${clean}`);
    setLookupProduct(null);
    if (scanMode !== "lookup") setCreateField("barcode", clean);

    const byBarcode = products.find((p) => (p.barcode ?? "") === clean);
    if (byBarcode) {
      if (scanMode === "lookup") {
        setLookupProduct(byBarcode);
        setScanMessage(`Encontrado: ${byBarcode.name} (${byBarcode.id})`);
        setQuickModal({ product: byBarcode, mode: "lookup" });
      } else {
        loadEditFormFromProduct(byBarcode);
        setScanMessage(`Producto encontrado: ${byBarcode.name} (${byBarcode.id})`);
      }
      return;
    }

    void findInventoryProductByBarcode(clean)
      .then((remote) => {
        if (scanMode === "lookup") {
          setLookupProduct(remote);
          setScanMessage(`Encontrado: ${remote.name} (${remote.id})`);
          setQuickModal({ product: remote, mode: "lookup" });
        } else {
          loadEditFormFromProduct(remote);
          setScanMessage(`Producto encontrado: ${remote.name} (${remote.id})`);
        }
      })
      .catch(() => {
        if (scanMode === "lookup") {
          setScanError(`No existe producto con código ${clean}`);
        } else {
          setScanMessage(`Código ${clean} listo para nuevo producto.`);
        }
      });
  }

  function stopScan() {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanLocked(false);
  }

  async function startScan(mode: ScanMode) {
    setScanMode(mode);
    setScanError("");
    setScanMessage("");
    setScannedBarcode("");
    setLookupProduct(null);
    setScanOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "No se pudo abrir la cámara");
      return;
    }

    if (!window.BarcodeDetector) {
      setScanError("Tu navegador no soporta escaneo nativo. Usa Chrome en móvil o pega el código manualmente.");
      return;
    }

    const detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"],
    });

    scanTimerRef.current = window.setInterval(async () => {
      if (!videoRef.current || scanLocked) return;
      try {
        const found = await detector.detect(videoRef.current);
        const raw = found.find((x) => x.rawValue)?.rawValue ?? "";
        if (!raw) return;
        setScanLocked(true);
        applyScannedBarcode(raw);
        stopScan();
      } catch {
        // seguimos escaneando
      }
    }, 350);
  }

  function openLabelsPrint(labelsInput: InventoryProduct[]) {
    if (labelsInput.length === 0) return;
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Tu navegador ha bloqueado la ventana de impresion. Permite popups.");
      return;
    }

    const labels = [...labelsInput]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => {
        const code = p.barcode ? toEan13(p.barcode) : barcodeFromSku(p.id);
        return `
          <article class="label">
            <div class="top">
              <div class="sku">${escapeHtml(p.id)}</div>
              <div class="name">${escapeHtml(p.name)}</div>
              <div class="desc">${escapeHtml(p.description || "Sin descripción")}</div>
            </div>
            <div class="barcode">${barcodeSvgMarkup(code)}</div>
            <div class="meta">Ubicación: ${escapeHtml(p.location || "-")}</div>
          </article>
        `;
      })
      .join("");

    popup.document.open();
    popup.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Etiquetas inventario</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
      .wrap { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
      .label { border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px; break-inside: avoid; }
      .sku { font-size: 11px; font-weight: 700; }
      .name { font-size: 12px; font-weight: 800; margin-top: 2px; }
      .desc { font-size: 10px; margin-top: 2px; min-height: 22px; }
      .barcode svg { width: 100%; height: 54px; display: block; }
      .meta { margin-top: 2px; font-size: 9px; color: #475569; }
    </style>
  </head>
  <body>
    <section class="wrap">${labels}</section>
    <script>
      setTimeout(() => { window.print(); }, 250);
    </script>
  </body>
</html>`);
    popup.document.close();
  }

  function printAllBarcodesPdf() {
    openLabelsPrint(products);
  }

  function printOneBarcodePdf(p: InventoryProduct) {
    openLabelsPrint([p]);
  }

  function openQuickProduct(p: InventoryProduct, mode: NonNullable<ProductQuickModal>["mode"]) {
    setQuickModal({ product: p, mode });
  }

  return (
    <main className="min-h-screen app-bg module-inventory mobile-nav-safe">
      {/* ── HERO ── */}
      <div
        className="relative overflow-hidden px-4 pb-6 pt-5 lg:pt-6"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(11,42,74,0.78) 0%, rgba(18,40,64,0.72) 55%, rgba(29,41,59,0.78) 100%), url('/banner-trabajos.webp')",
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
              <p className="text-xs font-extrabold uppercase tracking-widest text-amber-400">Inventario</p>
              <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Almacén</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold text-white/80">
                  Productos: {totals.products}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold text-white/80">
                  Stock bajo: {totals.low}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold text-white/80">
                  Movimientos: {totals.moves}
                </span>
              </div>
              {!canManage ? (
                <p className="mt-3 inline-flex rounded-2xl border border-amber-300/40 bg-amber-500/15 px-3 py-2 text-xs font-extrabold text-amber-100">
                  Solo Inventario o Administración pueden crear o cambiar productos.
                </p>
              ) : null}
            </div>

            <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
              <button
                type="button"
                onClick={() => void startScan("lookup")}
                className="btn-tap inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-slate-900 shadow-lg"
              >
                <Icon name="scan" className="h-4 w-4" />
                Escanear
              </button>

              <div className="flex flex-wrap gap-2">
                {([
                  { key: "scan" as const, label: "Escanear" },
                  { key: "new" as const, label: "Producto" },
                  { key: "moves" as const, label: "Movimientos" },
                  { key: "low" as const, label: "Stock bajo" },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveView(t.key)}
                    className={`btn-tap rounded-full px-4 py-2 text-sm font-extrabold ${
                      activeView === t.key ? "bg-white text-slate-900" : "border border-white/20 bg-white/10 text-white/85"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-5">
        {error && (
          <section className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </section>
        )}
      </div>

      {activeView === "scan" && (
        <section className="mx-auto mt-4 grid w-full max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-[1.3fr_0.7fr]">
          <article className="surface-action p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">Escanear producto</h2>
                <InfoHint text="Escanea para abrir la ficha sin escribir." />
              </div>
              <button
                onClick={() => void startScan("lookup")}
                className="cta-primary px-4 py-3 text-sm"
              >
                <Icon name="scan" className="h-4 w-4" />
                Abrir cámara
              </button>
            </div>

            <div className="mt-4 surface-status p-4">
              <p className="text-sm font-extrabold text-slate-900">Escanea y listo</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                Si existe, verás acciones rápidas. Si no existe, podrás crearlo.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => void startScan("lookup")}
                  className="cta-primary px-4 py-3 text-sm"
                >
                  Buscar por escaneo
                </button>
                <button
                  onClick={() => printAllBarcodesPdf()}
                  className="cta-secondary border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                >
                  Imprimir etiquetas
                </button>
                <button
                  onClick={() => void load()}
                  className="cta-secondary px-4 py-3 text-sm"
                >
                  Recargar
                </button>
              </div>
            </div>

            {lookupProduct ? (
              <button
                type="button"
                onClick={() => openQuickProduct(lookupProduct, "lookup")}
                className="btn-tap mt-4 w-full rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-left"
              >
                <p className="text-base font-extrabold text-emerald-900">{lookupProduct.name}</p>
                <p className="mt-1 text-sm font-semibold text-emerald-800">
                  {lookupProduct.id} · Stock {lookupProduct.stock}{lookupProduct.unit} · Mín {lookupProduct.minStock}{lookupProduct.unit}
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-800">Ubicación: {lookupProduct.location || "-"}</p>
                <p className="mt-2 text-xs font-extrabold text-emerald-800">Toca para ver acciones</p>
              </button>
            ) : null}

            {selectedProduct && (
              <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-extrabold text-slate-900">Última ficha abierta</p>
                <p className="mt-1 text-base font-extrabold text-slate-900">{selectedProduct.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{selectedProduct.id} · Stock {selectedProduct.stock}{selectedProduct.unit}</p>
                <button
                  onClick={() => setActiveView("new")}
                  className="mt-3 rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-800"
                >
                  Ir a ficha completa
                </button>
              </div>
            )}
          </article>

          <article className="surface-status p-4">
            <h2 className="text-base font-extrabold text-slate-900">Qué mirar ahora</h2>
            <div className="mt-3 space-y-2">
              <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700">Stock bajo</p>
                <p className="mt-1 text-2xl font-extrabold text-amber-900">{lowStock.length}</p>
              </div>
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Movimientos cargados</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900">{moves.length}</p>
              </div>
            </div>
          </article>
        </section>
      )}

      {activeView === "new" && (
        <section className="mx-auto mt-4 grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="surface-content p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">{selectedProduct ? "Ficha del producto" : "Nuevo producto"}</h2>
                <InfoHint text="Alta rápida. Si no pones código, se genera automáticamente." />
              </div>
              <button
                onClick={() => void startScan("edit_or_create")}
                className="cta-primary px-4 py-3 text-sm"
              >
                <Icon name="scan" className="h-4 w-4" />
                Escanear
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-extrabold text-slate-700">ID / SKU</label>
                <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={createForm.id} onChange={(e) => setCreateField("id", e.target.value.toUpperCase())} placeholder="TACO-300" disabled={!canManage} />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-700">Nombre</label>
                <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={createForm.name} onChange={(e) => setCreateField("name", e.target.value)} placeholder="Sensor velocidad" disabled={!canManage} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-extrabold text-slate-700">Descripción</label>
                <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={createForm.description} onChange={(e) => setCreateField("description", e.target.value)} placeholder="Descripción corta" disabled={!canManage} />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-700">Stock inicial</label>
                <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={createForm.stock} onChange={(e) => setCreateField("stock", onlyDigits(e.target.value))} disabled={!canManage} />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-700">Stock mínimo</label>
                <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={createForm.minStock} onChange={(e) => setCreateField("minStock", onlyDigits(e.target.value))} disabled={!canManage} />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-700">Unidad</label>
                <select className="mt-1 w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={createForm.unit} onChange={(e) => setCreateField("unit", e.target.value as Unit)} disabled={!canManage}>
                  <option value="ud">ud</option>
                  <option value="l">l</option>
                  <option value="m">m</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-700">Ubicación</label>
                <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={createForm.location} onChange={(e) => setCreateField("location", e.target.value)} placeholder="Estantería A-03" disabled={!canManage} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-extrabold text-slate-700">Código de barras</label>
                <div className="mt-1 flex gap-2">
                  <input className="w-full rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={createForm.barcode} onChange={(e) => setCreateField("barcode", onlyDigits(e.target.value))} placeholder="Se autogenera si lo dejas vacío" disabled={!canManage} />
                  <button type="button" onClick={() => setCreateField("barcode", barcodeFromSku(createForm.id || Date.now().toString()))} className="rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-800" disabled={!canManage}>
                    Generar
                  </button>
                </div>
                {!!createForm.barcode && <div className="mt-2"><BarcodeSvg value={createForm.barcode} /></div>}
              </div>
            </div>

            <button onClick={() => void handleCreateProduct()} disabled={!canManage || saving} className="mt-4 cta-primary w-full p-4 text-sm disabled:opacity-40">
              Guardar producto
            </button>
          </article>

          <article className="surface-status p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">Ficha abierta</h2>
              <InfoHint text="Aquí editas el producto que abras desde escaneo o stock bajo." />
            </div>

            {!selectedProduct ? (
              <div className="mt-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                No hay producto abierto.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="hero-card p-4">
                  <p className="text-base font-extrabold text-slate-900">{selectedProduct.name}</p>
                  <p className="text-sm font-semibold text-slate-600">{selectedProduct.id}</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={editForm.name} onChange={(e) => setEditField("name", e.target.value)} disabled={!canManage} />
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={editForm.location} onChange={(e) => setEditField("location", e.target.value)} disabled={!canManage} />
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={editForm.description} onChange={(e) => setEditField("description", e.target.value)} disabled={!canManage} />
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={editForm.minStock} onChange={(e) => setEditField("minStock", onlyDigits(e.target.value))} disabled={!canManage} />
                  <select className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={editForm.unit} onChange={(e) => setEditField("unit", e.target.value as Unit)} disabled={!canManage}>
                    <option value="ud">ud</option>
                    <option value="l">l</option>
                    <option value="m">m</option>
                  </select>
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-sm font-semibold" value={editForm.barcode} onChange={(e) => setEditField("barcode", onlyDigits(e.target.value))} placeholder="Código de barras" disabled={!canManage} />
                </div>

                {!!editForm.barcode && <BarcodeSvg value={editForm.barcode} />}

                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => void handleUpdateProduct()} disabled={!canManage || saving} className="cta-primary w-full p-4 text-sm disabled:opacity-40">
                    Guardar cambios
                  </button>
                  <button onClick={() => selectedProduct && printOneBarcodePdf(selectedProduct)} className="cta-secondary inline-flex w-full p-4 text-sm">
                    <Icon name="print" className="h-4 w-4" />
                    Imprimir etiqueta
                  </button>
                </div>

                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-extrabold text-slate-700">Cambiar stock</p>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    <input className="rounded-2xl border-2 border-slate-200 bg-white p-4 text-sm font-semibold" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} placeholder="-2 o +8" disabled={!canManage} />
                    <input className="rounded-2xl border-2 border-slate-200 bg-white p-4 text-sm font-semibold" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Explica por qué cambias el stock" disabled={!canManage} />
                    <button onClick={() => void handleAdjustStock()} disabled={!canManage || saving} className="cta-secondary border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 disabled:opacity-40">
                      Guardar cambio de stock
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>
        </section>
      )}

      {activeView === "moves" && (
        <section className="surface-history mx-auto mt-4 w-full max-w-6xl p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900">Últimos movimientos</h2>
            <InfoHint text="Entradas, salidas y ajustes con fecha y motivo." />
          </div>
          <div className="mt-3 space-y-3">
            {moves.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
                Aún no hay movimientos.
              </div>
            ) : (
              moves.map((mv) => (
                <div key={mv.id} className="rounded-2xl border-2 border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold text-slate-900">{mv.productName} ({mv.productId})</p>
                    <span className={`rounded-full px-2 py-1 text-xs font-extrabold ${mv.qty < 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {mv.qty}{mv.productUnit}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{mv.reason}{mv.workOrderId ? ` · Trabajo #${mv.workOrderId}` : ""}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{mv.label || "Sin etiqueta"} · {mv.origin === "web" ? "Web" : mv.origin}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{fmtWhen(mv.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {activeView === "low" && (
        <section className="mx-auto mt-4 grid w-full max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="panel p-4">
            <h2 className="text-base font-extrabold text-slate-900">Stock bajo</h2>
            <ul className="mt-3 space-y-3">
              {lowStock.length === 0 ? (
                <li className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                  Sin alertas de stock.
                </li>
              ) : (
                lowStock.slice(0, 20).map((item) => {
                  const sem = stockSemaphore(item.stock, item.minStock);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`btn-tap w-full rounded-2xl border-2 p-4 text-left ${semaphoreBadgeClass(sem)}`}
                        onClick={() => openQuickProduct(item, "low")}
                      >
                        <p className="text-sm font-extrabold text-slate-900">{item.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">{item.id}</p>
                        <p className="mt-1 text-sm font-semibold">Stock: {item.stock}{item.unit} · Mínimo {item.minStock}{item.unit}</p>
                        <p className="mt-1 text-[11px] font-extrabold">{semaphorePlainLabel(sem)}</p>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </article>

          <article className="panel p-4">
            <h2 className="text-base font-extrabold text-slate-900">Acciones</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Toca un producto para ver acciones rápidas.</p>
          </article>
        </section>
      )}

      {scanOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/85 p-4">
          <div className="mx-auto w-full max-w-md rounded-2xl border-2 border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Escanear código</h3>
              <button
                onClick={() => {
                  stopScan();
                  setScanOpen(false);
                }}
                className="rounded-lg border-2 border-slate-300 px-3 py-1 text-xs font-extrabold text-slate-700"
              >
                Cerrar
              </button>
            </div>

            <video ref={videoRef} className="mt-3 h-56 w-full rounded-xl bg-slate-900 object-cover" playsInline muted />

            {scanError && <p className="mt-2 text-xs font-semibold text-red-700">{scanError}</p>}
            {scanMessage && <p className="mt-2 text-xs font-semibold text-blue-700">{scanMessage}</p>}

            {lookupProduct && (
              <div className="mt-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-extrabold text-emerald-900">{lookupProduct.name}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-800">ID: {lookupProduct.id}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-800">Descripción: {lookupProduct.description || "Sin descripción"}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-800">Stock: {lookupProduct.stock}{lookupProduct.unit} (Min {lookupProduct.minStock}{lookupProduct.unit})</p>
                <p className="mt-1 text-xs font-semibold text-emerald-800">Ubicación: {lookupProduct.location || "-"}</p>
                <button
                  onClick={() => {
                    loadEditFormFromProduct(lookupProduct);
                    setScanOpen(false);
                    stopScan();
                  }}
                  className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white"
                >
                  Abrir ficha del producto
                </button>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-2">
              <input
                className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold"
                placeholder="Escribe o pega el código"
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(onlyDigits(e.target.value))}
              />
              <button
                onClick={() => applyScannedBarcode(scannedBarcode)}
                className="rounded-xl bg-blue-700 p-3 text-sm font-extrabold text-white"
              >
                Buscar código
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PRODUCTO (ACCIONES RAPIDAS) ── */}
      {quickModal ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-3 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Producto</p>
                <p className="mt-1 text-base font-black text-slate-900">{quickModal.product.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">{quickModal.product.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickModal(null)}
                className="btn-tap rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Stock</p>
                <p className="mt-1 text-2xl font-black text-slate-900">
                  {quickModal.product.stock}{quickModal.product.unit}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  Mínimo {quickModal.product.minStock}{quickModal.product.unit}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Ubicación</p>
                <p className="mt-1 text-base font-extrabold text-slate-900">{quickModal.product.location || "-"}</p>
                <p className="mt-1 text-xs font-semibold text-slate-600">{quickModal.product.barcode ? toEan13(quickModal.product.barcode) : "Sin código"}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!canManage) return;
                  setSaving(true);
                  setError("");
                  try {
                    await adjustInventoryStock({ id: quickModal.product.id, delta: 1, reason: "Uso" });
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "No se pudo ajustar stock");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={!canManage || saving}
                className="btn-tap rounded-2xl bg-slate-900 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
              >
                +1
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!canManage) return;
                  setSaving(true);
                  setError("");
                  try {
                    await adjustInventoryStock({ id: quickModal.product.id, delta: -1, reason: "Uso" });
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "No se pudo ajustar stock");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={!canManage || saving}
                className="btn-tap rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-900 disabled:opacity-40"
              >
                -1
              </button>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  const p = quickModal.product;
                  setQuickModal(null);
                  loadEditFormFromProduct(p);
                }}
                className="btn-tap rounded-2xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-slate-900"
              >
                Abrir ficha
              </button>
              <button
                type="button"
                onClick={() => printOneBarcodePdf(quickModal.product)}
                className="btn-tap rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-900"
              >
                Imprimir etiqueta
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MobileNav />
    </main>
  );
}
