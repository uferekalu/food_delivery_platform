import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { StoreProvider } from "@/lib/redux/store-provider";
import { ThemeInitializer } from "@/components/theme-initializer";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Food Delivery Platform",
    template: "%s | Food Delivery Platform",
  },
  description:
    "Technology-driven food ordering and delivery platform connecting customers with restaurants and reliable delivery.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-surface text-text">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <StoreProvider>
          <ThemeInitializer />
          <ToastProvider>
            <header className="flex justify-end border-b border-border p-3">
              <ThemeToggle />
            </header>
            {children}
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
