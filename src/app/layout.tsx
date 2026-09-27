import type { Metadata, Viewport } from "next";
import { Lora, Cinzel } from 'next/font/google';
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from "@/context/app-providers";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import "./globals.css";
import { DynamicTheme } from "@/components/layout/dynamic-theme";
import { ChatbotWidget } from "@/components/layout/chatbot-widget";

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
  title: "Inkfinity",
  description: "A platform for tattoo artists and enthusiasts.",
  openGraph: {
    type: "website",
    siteName: "Inkfinity",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://inkfinity-ten.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Inkfinity",
  },
  icons: {
    icon: '/favicon.ico',
  }
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
