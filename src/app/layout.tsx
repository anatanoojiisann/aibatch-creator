import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Video Batch Workflow",
  description: "VideoFactory-backed batch workflow manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
