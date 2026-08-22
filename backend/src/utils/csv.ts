/** Serialize rows to CSV. columns: [{ key, label }]. RFC-4180-ish quoting. */
export function toCsv(rows: any[], columns: { key: string; label: string }[]): string {
  const esc = (v: any): string => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (v instanceof Date) s = v.toISOString();
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\r\n');
  return header + '\r\n' + body + '\r\n';
}
