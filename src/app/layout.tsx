import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpaceBackdrop } from "@/components/site/SpaceBackdrop";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Neural Physics Lab",
  description:
    "Does AI predict motion better when it learns the laws of physics, not only data? A double pendulum experiment that runs in your browser.",
};

export const viewport: Viewport = {
  themeColor: "#04050d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SpaceBackdrop />
        {children}
      </body>
    </html>
  );
}
