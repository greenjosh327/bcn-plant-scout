export const contactEmails = {
  general: "info@basecampnorthpa.com",
  sales: "sales@basecampnorthpa.com",
  support: "support@basecampnorthpa.com",
  orders: "orders@basecampnorthpa.com",
  owner: "josh@basecampnorthpa.com"
} as const;

export type ContactEmailPurpose = keyof typeof contactEmails;

export function mailto(email: string, subject?: string) {
  return subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
}
