import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nanded Strike · The city is your arena",
  description: "Squad up in a Nanded-inspired riverside bazaar. An original multiplayer browser shooter with instant solo practice.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
