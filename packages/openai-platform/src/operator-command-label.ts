const genericLabel = 'Workspace command';
const labels = new Map([
  ['python', 'Run a Python workspace script'],
  ['python3', 'Run a Python workspace script'],
  ['node', 'Run a JavaScript workspace script'],
  ['rg', 'Search workspace files'],
  ['grep', 'Search workspace files'],
  ['ls', 'List workspace files'],
  ['find', 'Find workspace files'],
  ['sha256sum', 'Verify file hashes'],
  ['shasum', 'Verify file hashes'],
  ['unzip', 'Inspect or extract an archive'],
  ['zip', 'Build an archive'],
  ['headstart-document', 'Read a document in the workspace'],
  ['headstart-mcp-document', 'Retrieve an authorized source document'],
  ['headstart-drive-read', 'Read authorized Drive evidence'],
]);

/** Display classification only, never a shell parser, command validator or execution policy. */
export function operatorCommandLabel(value: string | undefined): string {
  if (!value || value.length > 100_000) return genericLabel;
  // Recognize one complete literal shell wrapper. Never evaluate substitutions or echo arguments.
  const wrapped = /^(?:\/bin\/|\/usr\/bin\/)?(?:bash|sh|zsh) -(?:lc|cl|c) (['"])([\s\S]*)\1$/u.exec(
    value.trim()
  );
  const source = wrapped ? wrapped[2] : value.trim();
  // Mixed quoting, substitutions, compound commands and redirections are deliberately generic.
  if (!source || /[;&|<>`$\n\r]/u.test(source) || (wrapped && source.includes(wrapped[1] ?? '')))
    return genericLabel;
  const executable = /^(?:\/usr\/bin\/|\/bin\/)?([A-Za-z0-9_-]+)(?:\s|$)/u.exec(source)?.[1];
  return labels.get(executable ?? '') ?? genericLabel;
}
