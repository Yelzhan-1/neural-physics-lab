import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../../design/team-kit/fonts/Inter-400-normal.ttf", weight: "400" },
    { path: "../../design/team-kit/fonts/Inter-500-normal.ttf", weight: "500" },
    { path: "../../design/team-kit/fonts/Inter-600-normal.ttf", weight: "600" },
    { path: "../../design/team-kit/fonts/Inter-700-normal.ttf", weight: "700" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const plex = localFont({
  src: [
    { path: "../../design/team-kit/fonts/IBM-Plex-Mono-400-normal.ttf", weight: "400" },
    { path: "../../design/team-kit/fonts/IBM-Plex-Mono-500-normal.ttf", weight: "500" },
  ],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Neural Physics Lab",
  description:
    "Does AI predict motion better when it learns the laws of physics, not only data? A double pendulum experiment that runs in your browser.",
};

export const viewport: Viewport = {
  themeColor: "#0c0d0f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plex.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
