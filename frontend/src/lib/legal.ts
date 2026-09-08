/* ---------------------------------------------------------------------------
   Legal constants.

   Everything the footer, the sign-in screen and the two policy pages say about
   who runs this deployment lives here, so a change lands everywhere at once
   and the documents can't contradict the footer.

   Sentinel is self-hosted: whoever runs the containers is the party the policy
   pages refer to, and is the data controller for whatever the instance stores.

   >>> EDIT THIS BEFORE PUTTING THE INSTANCE IN FRONT OF REAL USERS. <<<
   The contact address is a placeholder on the demo domain and is not monitored.
--------------------------------------------------------------------------- */

export const OPERATOR = {
  /** The name the documents and the copyright line refer to. */
  name: 'Sentinel',
  /** Where privacy and terms enquiries go. Placeholder — change it. */
  contact: 'privacy@sentinel.io',
  /** Source of the software these documents describe. */
  repository: 'https://github.com/UjjwalSingh01/Sentinel',
} as const;

/** Both documents carry the same revision stamp so they can't drift apart. */
export const LEGAL_UPDATED = '8 September 2026';
export const LEGAL_VERSION = '1.0';

export const LEGAL_LINKS = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
] as const;

/** Computed at render — a hard-coded year is the cheapest way to look stale. */
export function copyright(): string {
  return `© ${new Date().getFullYear()} ${OPERATOR.name}. All rights reserved.`;
}
