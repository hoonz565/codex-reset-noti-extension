export interface GeneratedToken {
  rawBase64Url: string;
  hashHex: string;
}

export class TokenService {
  /**
   * Generates 32 random bytes (256-bit entropy).
   * Returns the URL-safe base64 encoded raw token and its SHA-256 hash.
   */
  static async generate(): Promise<GeneratedToken> {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);

    // Convert to base64url
    // btoa is available in Cloudflare Workers and browser environments
    const base64 = btoa(String.fromCharCode(...randomBytes));
    const rawBase64Url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Hash the token using Web Crypto
    const hashBuffer = await crypto.subtle.digest('SHA-256', randomBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return {
      rawBase64Url,
      hashHex,
    };
  }

  /**
   * Hash an incoming token for lookup
   */
  static async hashToken(rawBase64Url: string): Promise<string> {
    if (rawBase64Url.length < 43) {
      throw new Error('Invalid token format');
    }
    // Reconstruct bytes from base64url
    let base64 = rawBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch {
      throw new Error('Invalid token format');
    }
  }
}
