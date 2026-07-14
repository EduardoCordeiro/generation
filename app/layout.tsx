import type { Metadata } from "next";
import "./styles.css";
import "./controls.css";
import "./theme-dark.css";

export const metadata: Metadata = {
  title: "Mood Mix",
  description: "Discovery playlists, made from your taste."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
