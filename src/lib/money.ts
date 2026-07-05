/**
 * Colombian peso formatting for derived income values. Falls back to a
 * manual thousands separator when Intl data is unavailable.
 */
export function formatCOP(value: number): string {
  const rounded = Math.round(value);
  try {
    return rounded.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    });
  } catch {
    const digits = Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${rounded < 0 ? '-' : ''}$ ${digits}`;
  }
}
