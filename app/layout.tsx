import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nanded Strike · Single-player prototype",
  description: "Explore Bhagya Nagar and six nearby Nanded neighbourhoods in a browser FPS prototype. Practice against bots on phone or laptop; multiplayer is the next milestone.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
