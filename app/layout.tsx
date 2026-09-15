import type { Metadata, Viewport } from "next";
import { Nunito, Nunito_Sans } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/sidebar";
import { CommandMenu } from "@/components/command-menu";
import { Toaster } from "@/components/ui/sonner";
import { APP_LOCATION, APP_NAME } from "@/lib/constants";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-nunito-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Gaindakot`,
    template: `%s — ${APP_NAME}`,
  },
  description: `Offline billing, khata, inventory and delivery management for ${APP_NAME}, ${APP_LOCATION}.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${nunitoSans.variable}`}>
      <body className="antialiased">
        <div className="min-h-screen md:flex">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        <CommandMenu />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
