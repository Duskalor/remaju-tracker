import type { Metadata } from 'next';
import { Inter, Geist } from 'next/font/google';
import './globals.css';
import { TRPCProvider } from '@/lib/trpc-provider';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'REMAJU Dashboard',
  description: 'Panel de control del sistema de inteligencia de remates judiciales',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)}>
      <body className={inter.className}>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
