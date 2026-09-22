/** Normaliza texto para búsqueda: minúsculas y sin tildes/diacríticos.
 *  Debe coincidir con la normalización SQL usada en supabase/seed.sql. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
