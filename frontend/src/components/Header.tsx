'use client';

import { useQuery } from '@apollo/client/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CART_QUERY } from '@/graphql/operations';
import { useCart } from '@/lib/cart-context';

const LINKS = [
  { href: '/', label: 'Catálogo' },
  { href: '/orders', label: 'Mis pedidos' },
  { href: '/admin', label: 'Farmacia' },
];

export function Header() {
  const pathname = usePathname();
  const { cartId } = useCart();
  // Lee de la caché normalizada: se actualiza solo cuando una mutation devuelve el Cart.
  const { data } = useQuery(CART_QUERY, { variables: { id: cartId ?? '' }, skip: !cartId });
  const count = data?.cart?.status === 'OPEN' ? data.cart.itemCount : 0;

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          <span className="brand-pill" aria-hidden>
            ✚
          </span>
          Afirmative Pill
        </Link>
        <nav className="nav">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? 'nav-link active' : 'nav-link'}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/cart" className={pathname === '/cart' ? 'nav-link cart active' : 'nav-link cart'}>
            Carrito {count > 0 && <span className="badge-count">{count}</span>}
          </Link>
        </nav>
      </div>
    </header>
  );
}
