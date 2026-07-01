/** Join a base URL and a relative path without duplicating/losing slashes. */
export function joinPath(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
