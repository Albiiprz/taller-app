'use client';

import MobileNav from "../components/MobileNav";

export default function AvisosPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <h1 className="text-2xl font-semibold text-gray-900">Avisos</h1>
      <p className="mt-2 text-sm text-gray-600">Aquí irán alertas: stock bajo, citas mañana, OTs retrasadas, etc.</p>
      <MobileNav />
    </main>
  );
}
