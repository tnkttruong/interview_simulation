import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Interview Simulation — Open source practice",
  description: "Self-hosted AI interview simulator foundation (offline demo mode)",
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
