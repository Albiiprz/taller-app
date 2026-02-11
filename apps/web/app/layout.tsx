import "./globals.css";
import MobileNav from "./components/MobileNav";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50">
        {/* Contenido principal */}
        <div className="pb-24">
          {children}
        </div>

        {/* Navegación inferior fija */}
        <MobileNav />
      </body>
    </html>
  );
}
