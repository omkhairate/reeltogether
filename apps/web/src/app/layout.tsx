import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const repository = process.env.GITHUB_REPOSITORY?.split("/");
const siteURL = repository?.length === 2
  ? new URL(`https://${repository[0]}.github.io/${repository[1]}/`)
  : new URL("http://localhost:3000");
const socialImageURL = new URL("og.png", siteURL).toString();

export const metadata: Metadata = {
  title: "ReelTogether — pick what’s next",
  description: "Swipe films, shows, and bucket-list ideas with friends. Match when the group agrees.",
  applicationName: "ReelTogether",
  metadataBase: siteURL,
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/icons/icon-192.png`,
    apple: `${basePath}/icons/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ReelTogether",
  },
  openGraph: {
    title: "ReelTogether — pick what’s next",
    description: "Swipe films, shows, and bucket-list ideas with friends. Match when the group agrees.",
    type: "website",
    url: "./",
    images: [{ url: socialImageURL, width: 1200, height: 630, alt: "ReelTogether — Pick what’s next. Together." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ReelTogether — pick what’s next",
    description: "Swipe films, shows, and bucket-list ideas with friends.",
    images: [socialImageURL],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf8f4",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
