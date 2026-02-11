import Link from "next/link";

export default function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t p-2 flex justify-around text-sm">
      <Link className="px-3 py-2 rounded-lg hover:bg-gray-100" href="/">Inicio</Link>
      <Link className="px-3 py-2 rounded-lg hover:bg-gray-100" href="/ordenes">Órdenes</Link>
      <Link className="px-3 py-2 rounded-lg hover:bg-gray-100" href="/taller">Taller</Link>
      <Link className="px-3 py-2 rounded-lg bg-blue-600 text-white" href="/ordenes/nueva">+ Nueva</Link>
      <button className="px-3 py-2 rounded-lg hover:bg-gray-100">Avisos</button>
      <button className="px-3 py-2 rounded-lg hover:bg-gray-100">Perfil</button>
    </nav>
  );
}
