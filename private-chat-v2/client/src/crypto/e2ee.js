const enc = new TextEncoder(),
  dec = new TextDecoder();
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function keyFrom(secret, saltB64) {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const salt = saltB64
    ? unb64(saltB64)
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { key, salt: b64(salt) };
}
export async function encryptText(text, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, salt } = await keyFrom(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text),
  );
  return { ciphertext: b64(ciphertext), iv: b64(iv), salt };
}
export async function decryptText(ciphertext, iv, salt, secret) {
  const { key } = await keyFrom(secret, salt);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    key,
    unb64(ciphertext),
  );
  return dec.decode(plain);
}
export async function encryptFile(file, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, salt } = await keyFrom(secret);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    await file.arrayBuffer(),
  );
  return {
    blob: new Blob([cipher], { type: "application/octet-stream" }),
    iv: b64(iv),
    salt,
  };
}
export async function decryptFile(buffer, iv, salt, secret, mime) {
  const { key } = await keyFrom(secret, salt);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    key,
    buffer,
  );
  return new Blob([plain], { type: mime || "application/octet-stream" });
}
