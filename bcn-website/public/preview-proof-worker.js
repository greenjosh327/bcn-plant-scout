// Web Crypto proof-of-work. No credentials, form data or trackers enter this worker.
self.onmessage = async ({ data }) => {
  try {
    if (typeof data.challenge !== "string" || data.difficulty !== 16) throw new Error();
    const encoder = new TextEncoder();
    for (let counter = 0; counter <= 2000000; counter++) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${data.challenge}:${counter}`)));
      if (digest[0] === 0 && digest[1] === 0) { self.postMessage({ counter }); return; }
    }
    self.postMessage({ error: true });
  } catch { self.postMessage({ error: true }); }
};
