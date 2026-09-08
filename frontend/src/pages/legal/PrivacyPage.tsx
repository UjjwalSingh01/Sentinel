import {
  Bullets,
  C,
  Callout,
  DataTable,
  LegalLayout,
  Mail,
  P,
  type LegalSection,
} from './LegalLayout';
import { LEGAL_UPDATED, LEGAL_VERSION, OPERATOR } from '@/lib/legal';

/* ---------------------------------------------------------------------------
   Privacy Policy.

   Written against what the code actually does, not against a template. Every
   claim below is checkable in the repository:

     - users table               services/processor/src/storage.py
     - notification_log table    services/processor/src/storage.py
     - token storage + lifetimes frontend/src/lib/auth.ts, services/api/src/config.py
     - Gemini payload            services/api/src/services/ai_service.py
     - email drivers             services/notification/src/config.py
     - Google Fonts              frontend/index.html

   If you change any of those, change the matching clause here.
--------------------------------------------------------------------------- */

const SECTIONS: LegalSection[] = [
  {
    id: 'who',
    title: 'Who this policy is from',
    body: (
      <>
        <P>
          Sentinel is a self-hosted observability and incident-response platform. It is not a
          hosted service run by a central company: the software is deployed by whoever runs the
          containers, and that operator controls the database, the logs and every piece of
          personal data the instance holds.
        </P>
        <P>
          This policy describes what the software collects and where it sends things, so that an
          operator can be honest with their users and a user can see what the system knows about
          them. For this deployment, the operator can be reached at{' '}
          <Mail />. The source code is public at{' '}
          <a
            href={OPERATOR.repository}
            target="_blank"
            rel="noreferrer noopener"
            className="text-series-text underline underline-offset-2 hover:text-ink"
          >
            {OPERATOR.repository.replace('https://', '')}
          </a>
          , so every statement here can be checked against the code that makes it true.
        </P>
      </>
    ),
  },
  {
    id: 'collected',
    title: 'What Sentinel stores about you',
    body: (
      <>
        <P>
          Sentinel holds only what it needs to sign you in, show you the right things, and page
          the right person when infrastructure breaks. There is no profile building, no
          behavioural tracking and no data collection that exists for anyone&rsquo;s benefit but
          yours.
        </P>
        <DataTable
          head={['Data', 'Where it lives', 'Why it exists']}
          rows={[
            [
              'Name, email address, role',
              <>
                <C>users</C> table
              </>,
              'Identifies you in the console, decides what you are allowed to see, and addresses the emails you are sent.',
            ],
            [
              'Password',
              <>
                <C>users.hashed_password</C>
              </>,
              'Stored only as a bcrypt hash. The original password is never written to disk and cannot be recovered from what is stored.',
            ],
            [
              'On-call rotation',
              <>
                <C>on_call_schedule</C>
              </>,
              'Records which engineer is responsible during which window, so an incident reaches a person rather than an inbox nobody reads.',
            ],
            [
              'Notification history',
              <>
                <C>notification_log</C>
              </>,
              'Records that an alert was sent, to which address, for which incident, and when — the audit trail for "nobody told me".',
            ],
            [
              'Session tokens',
              'Your browser',
              'Keeps you signed in between page loads. Described in full in the next section.',
            ],
          ]}
        />
        <P>
          Everything else Sentinel stores — metrics, logs, traces, incidents, alert rules,
          dashboards — describes <em>machines</em>, not people. It becomes personal data only if
          your own applications write personal data into the log lines they emit, which is a
          decision made by the operator&rsquo;s services, not by Sentinel.
        </P>
      </>
    ),
  },
  {
    id: 'browser',
    title: 'What is stored in your browser',
    body: (
      <>
        <P>
          Sentinel sets no cookies. Sign-in state is kept in your browser&rsquo;s local storage
          under three keys, and nothing else is written there:
        </P>
        <Bullets
          items={[
            <>
              <C>sentinel_access_token</C> — a signed token proving who you are. Valid for 60
              minutes by default.
            </>,
            <>
              <C>sentinel_refresh_token</C> — used to obtain a new access token without making you
              type your password again. Valid for 7 days by default.
            </>,
            <>
              <C>sentinel_user</C> — your id, name, email and role, so the interface can render
              your account without a round trip.
            </>,
          ]}
        />
        <P>
          Signing out deletes all three immediately. Clearing site data in your browser has the
          same effect. Both token lifetimes are configurable by the operator through{' '}
          <C>JWT_ACCESS_EXPIRY_MINUTES</C> and <C>JWT_REFRESH_EXPIRY_MINUTES</C>.
        </P>
        <Callout title="Worth knowing">
          Local storage is readable by any JavaScript running on the same origin. It is a
          deliberate trade-off for a self-hosted tool, and it means an operator should treat
          script injection on this origin as a session-compromise risk rather than a cosmetic bug.
        </Callout>
      </>
    ),
  },
  {
    id: 'third-parties',
    title: 'Who else sees anything',
    body: (
      <>
        <P>
          Sentinel has no analytics, no advertising, no error-reporting service and no third-party
          tracking scripts of any kind. Three external parties can nevertheless receive data,
          depending on how the instance is configured:
        </P>
        <Bullets
          items={[
            <>
              <strong className="font-medium text-ink">Google Gemini</strong> — only when the
              operator sets <C>GEMINI_API_KEY</C>. When an incident is analysed, Sentinel sends
              Google the host identifier, the metric and its value, the threshold that was
              breached, the incident message, a window of recent metrics and an excerpt of the
              matching log lines. It does not send your name, your email or your account. The
              generated summary is cached in Redis so the same incident is not analysed twice.
              Leaving the key unset disables the feature entirely and nothing is ever sent.
            </>,
            <>
              <strong className="font-medium text-ink">An email provider</strong> — only when the
              operator sets <C>EMAIL_DRIVER=smtp</C>. The recipient address and the incident
              details pass through whichever SMTP server is configured. The default driver is{' '}
              <C>stub</C>, which writes the message to the service log and sends nothing off the
              machine.
            </>,
            <>
              <strong className="font-medium text-ink">Google Fonts</strong> — the interface loads
              the Inter and JetBrains Mono typefaces from Google&rsquo;s font CDN, so your browser
              makes a request to <C>fonts.googleapis.com</C> and <C>fonts.gstatic.com</C> that
              discloses your IP address and user agent to Google. An operator who does not want
              this can self-host the two font files and remove the tags from{' '}
              <C>index.html</C>.
            </>,
          ]}
        />
        <P>
          Sentinel never sells data, never shares it for advertising, and has no mechanism to
          transfer it anywhere other than the three destinations above.
        </P>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long anything is kept',
    body: (
      <>
        <P>
          Sentinel ships with no automatic expiry. Account records, incidents, notification
          history and the full metric, log and trace history remain in the operator&rsquo;s
          database until the operator deletes them or destroys the volume. That is a deliberate
          default for an incident-response tool — evidence that disappears on a schedule is
          evidence you do not have during a post-mortem — but it does mean retention is a choice
          the operator has to make rather than one the software makes for them.
        </P>
        <P>
          Operators who want a bounded window can add a TimescaleDB retention policy to the{' '}
          <C>metrics</C>, <C>logs</C> and <C>spans</C> hypertables. Deleting a user account
          removes that person&rsquo;s row from <C>users</C>; entries already written to{' '}
          <C>notification_log</C> keep the address the alert was sent to, because an audit trail
          that can be rewritten is not an audit trail.
        </P>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How it is protected',
    body: (
      <>
        <Bullets
          items={[
            'Passwords are hashed with bcrypt and are never stored, logged or transmitted in their original form.',
            'API access requires a signed JWT; requests without a valid, unexpired token are rejected.',
            'Roles limit what an account can reach — administrative screens such as the on-call schedule are not available to ordinary accounts.',
            'Services talk to each other on a private container network; only the reverse proxy is published.',
          ]}
        />
        <Callout title="The operator's half">
          Transport security is not something the software can guarantee on its own. An instance
          exposed over plain HTTP, or left running with the seeded demo passwords, is insecure no
          matter what the application does. Terminating TLS at the proxy, changing{' '}
          <C>JWT_SECRET</C> from its default, and replacing the demo accounts are all the
          operator&rsquo;s responsibility.
        </Callout>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights over your data',
    body: (
      <>
        <P>
          Depending on where you live, you may have the right to obtain a copy of the personal
          data held about you, to have it corrected, to have it deleted, and to object to how it
          is used. Because the data lives in the operator&rsquo;s own database, those requests go
          to the operator rather than to any central service.
        </P>
        <P>
          Write to <Mail /> and the operator should respond within a month. Every
          category of personal data Sentinel holds is listed in section two, which makes such a
          request straightforward to answer completely: there are no hidden stores, no shadow
          profiles and no data warehouse behind the console.
        </P>
      </>
    ),
  },
  {
    id: 'demo',
    title: 'If this is the public demo',
    body: (
      <>
        <P>
          The demonstration instance is seeded with shared accounts whose credentials are printed
          on the sign-in screen, and the fleet it monitors is simulated rather than real. Anyone
          who signs in with a shared account can see everything any other visitor did while using
          it, and the database may be reset without notice.
        </P>
        <P>
          Treat it as a public sandbox: do not enter real credentials, real customer data, or
          anything you would not be comfortable seeing on a screen at a conference.
        </P>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <>
        <P>
          When the software changes what it collects or where it sends it, this page changes with
          it, and the revision date at the top moves. Past versions are visible in the
          repository&rsquo;s history, so any change to what was promised is a matter of public
          record rather than something you have to take on trust.
        </P>
        <P>
          Questions about anything here can go to <Mail />.
        </P>
      </>
    ),
  },
];

export function PrivacyPage() {
  return (
    <LegalLayout
      kicker="Legal · Privacy"
      title="Privacy Policy"
      updated={LEGAL_UPDATED}
      version={LEGAL_VERSION}
      summary={
        <>
          The short version: Sentinel stores your name, email, role and a hash of your password so
          it can sign you in and page you; everything else it holds describes machines. It sets no
          cookies, runs no analytics and sells nothing. Incident text reaches Google only if the
          operator has enabled AI analysis, and email leaves the machine only if they have
          configured a mail server. The long version follows, and every clause in it can be
          checked against the source.
        </>
      }
      sections={SECTIONS}
    />
  );
}
