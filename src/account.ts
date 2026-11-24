// Bound once per document so an outstanding save cannot cross accounts.
export let accountId = "";
export function bindAccount(id: string) {
  if (accountId && accountId !== id) throw Error("Reload to switch accounts.");
  accountId = id;
}
export const accountKey = (key: string) =>
  accountId ? accountId + ":" + key : key;
