import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nanded Strike · Multiplayer prototype",
  description: "Play with real people across mapped Nanded streets. Join the public arena, share a private room, or explore the map solo. No bots.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
