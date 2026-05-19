import "./globals.css";
import type { Metadata, Viewport } from "next";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";
import { PwaSwRegister } from "./components/PwaSwRegister";

export const metadata: Metadata = {
  title: "Talleres MALU",
  description: "Gestión interna: citas, trabajos, inventario y avisos.",
  applicationName: "Talleres MALU",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/icon-192.png"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Taller",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c2540",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" translate="no" suppressHydrationWarning>
      <body className="bg-gray-50" suppressHydrationWarning>
        {children}
        <PwaSwRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
