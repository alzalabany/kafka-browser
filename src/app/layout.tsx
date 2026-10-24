import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Kafka Browser', description: 'A local Kafka developer workspace' };
export default function RootLayout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
