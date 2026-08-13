import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete account",
  robots: { index: false, follow: false },
};

export default function DeleteAccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
