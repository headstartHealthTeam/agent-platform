/** One exact public-host expression for both source requests and retained-evidence validation. */
export function exactPublicHostFilter(hostname: string): {
  dimension: 'page';
  operator: 'includingRegex';
  expression: string;
} {
  const escaped = hostname.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return {
    dimension: 'page',
    operator: 'includingRegex',
    expression: `^https://${escaped}/`,
  };
}
