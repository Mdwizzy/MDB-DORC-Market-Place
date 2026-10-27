import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./catalog.css";
export const metadata: Metadata = { title: "MDB-DORC Market Place", description: "Shop trusted products from DORC sellers, with convenient pickup and secure payments." };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
