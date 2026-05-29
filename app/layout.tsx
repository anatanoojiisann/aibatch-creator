import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AI Batch Creator",
  description: "Standalone VideoFactory-backed AI video batch workflow"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
