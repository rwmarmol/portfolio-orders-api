/** Escapes LIKE/ILIKE wildcards so user input is matched literally (default escape is `\`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
