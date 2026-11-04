import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Exceptional Electrical | Exceptional service. Every connection.', description: 'Professional electrical solutions for homes, businesses and projects across Perth.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en-AU"><body>{children}</body></html>; }
