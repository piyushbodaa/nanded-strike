import type { Metadata } from "next";
import "./globals.css";
const title = "Counter Strike Nanded";
const description = "Play Counter Strike Nanded with real people across mapped Bhagya Nagar streets. Join a public match, share a private room, or explore Nanded solo. No bots.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cs.nanded.fun"),
  title,
  applicationName: title,
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, siteName: title, url: "/", type: "website" },
  twitter: { card: "summary", title, description },
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
