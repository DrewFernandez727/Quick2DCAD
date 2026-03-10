let counter = 0;
export function newId(prefix = 'e'): string {
  return `${prefix}_${++counter}_${Date.now().toString(36)}`;
}
