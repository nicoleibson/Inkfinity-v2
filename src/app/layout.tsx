import type { Metadata, Viewport } from "next";
import { Lora, Cinzel } from 'next/font/google';
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from "@/context/app-providers";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import "./globals.css";
import { DynamicTheme } from "@/components/layout/dynamic-theme";
import { ChatbotWidget } from "@/components/layout/chatbot-widget";
import { JsonLd } from "@/components/seo/json-ld";

const lora = Lora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

const cinzel = Cinzel({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-headline',
});

export const viewport: Viewport = {
  themeColor: '#9333ea',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://inkfinity-ten.vercel.app"),
  title: {
    default: "Inkfinity - Marketplace y Comunidad para Artistas del Tatuaje",
    template: "%s | Inkfinity",
  },
  description: "Inkfinity es la plataforma líder para conectar tatuadores, estudios y entusiastas del tatuaje. Explora portafolios, reserva citas, compra arte y forma parte de la comunidad.",
  keywords: ["tatuaje", "tatuadores", "estudios de tatuaje", "marketplace tatuaje", "reservar tatuaje", "artistas tatuaje", "tatuajes", "Inkfinity"],
  authors: [{ name: "Inkfinity" }],
  creator: "Inkfinity",
  publisher: "Inkfinity",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "Inkfinity",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://inkfinity-ten.vercel.app",
    title: "Inkfinity - Marketplace y Comunidad para Artistas del Tatuaje",
    description: "Conecta con tatuadores, reserva citas, descubre portafolios y compra arte en la plataforma líder del tatuaje.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Inkfinity - Plataforma para tatuadores y entusiastas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inkfinity - Marketplace para Tatuadores",
    description: "La plataforma para conectar artistas del tatuaje con clientes. Reserva, explora y descubre.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Inkfinity",
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192x192.png',
  },
  alternates: {
    canonical: process.env.NEXT_PUBLIC_SITE_URL || "https://inkfinity-ten.vercel.app",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${lora.variable} ${cinzel.variable} font-body antialiased min-h-screen flex flex-col bg-background text-foreground`}>
        <AppProviders>
          <DynamicTheme />
          <JsonLd />
          <div className="min-h-screen flex flex-col w-full">
            <Header />
            <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">
              {children}
            </main>
            <Footer />
          </div>
          <ChatbotWidget />
          <Toaster />
        </AppProviders>
      </body>
    </html>
  );
}
