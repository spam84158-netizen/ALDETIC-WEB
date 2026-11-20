// Sous Deno (CI GitHub) : vérifie que la bibliothèque BLAKE3 donne le vecteur officiel de la chaîne vide.
import { blake3 } from "npm:@noble/hashes@1/blake3";
import { bytesToHex } from "npm:@noble/hashes@1/utils";
Deno.test("blake3 : vecteur de la chaîne vide", () => {
  const h = bytesToHex(blake3(new Uint8Array()));
  if (h !== "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262") throw new Error("hash inattendu : " + h);
});
