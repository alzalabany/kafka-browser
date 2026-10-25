import type { Metadata } from 'next';
import './globals.css';
import AuthGate from './auth-gate';
export const metadata: Metadata = { title: 'Kafka Browser', description: 'A Kafka developer workspace' };
export default function RootLayout({children}: {children: React.ReactNode}) { return <html lang="en"><body><AuthGate>{children}</AuthGate></body></html>; }
