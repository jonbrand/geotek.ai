export async function sha256(conteudo: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", conteudo);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
