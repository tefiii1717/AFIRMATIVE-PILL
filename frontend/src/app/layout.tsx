import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Afirmative Pill',
  description: 'E-commerce farmacéutico con GraphQL (Apollo) y CQRS',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <Header />
          <main className="container">{children}</main>
          <footer className="footer container">
            Afirmative Pill · Todas las llamadas de red van a <code>/graphql</code> (Zero-REST)
          </footer>
        </Providers>
      </body>
    </html>
  );
}
