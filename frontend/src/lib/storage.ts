/** Acceso defensivo a localStorage/sessionStorage (modo privado, SSR). */
export function readStorage(key: string, session = false): string | null {
  try {
    return (session ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null, session = false): void {
  try {
    const storage = session ? window.sessionStorage : window.localStorage;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}
