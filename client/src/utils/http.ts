export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText} for ${path}`);
  }
  return (await res.json()) as T;
}
