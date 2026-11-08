import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Genuis — Your money, your way",
  description: "A banking workspace that builds the tools you need, powered by Nessie and NVIDIA Nemotron.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
