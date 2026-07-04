import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EscolaEstoque – Controle de Estoque Escolar",
  description: "Sistema integrado de controle de estoque e financeiro escolar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full bg-slate-50 antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
