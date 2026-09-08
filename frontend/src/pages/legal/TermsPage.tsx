import { Link } from 'react-router-dom';
import { Bullets, Callout, LegalLayout, Mail, P, type LegalSection } from './LegalLayout';
import { LEGAL_UPDATED, LEGAL_VERSION, OPERATOR } from '@/lib/legal';

/* ---------------------------------------------------------------------------
   Terms of Service.

   Kept in the same register as the privacy policy: plain sentences, no
   defined-term thicket, and no promises the software cannot keep. Sentinel is
   self-hosted, so these terms are between the person running the instance and
   the people they let use it.
--------------------------------------------------------------------------- */

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'What you are agreeing to',
    body: (
      <>
        <P>
          These terms cover your use of this Sentinel deployment — the console, its API and the
          alerts it sends. By signing in you accept them. If you do not, do not sign in; there is
          nothing else the instance asks of you.
        </P>
        <P>
          Sentinel is self-hosted software rather than a hosted product, so the agreement is
          between you and whoever operates this particular instance. They decide who gets an
          account, what infrastructure is monitored, and how long anything is kept. How your
          personal data is handled is set out in the{' '}
          <Link
            to="/privacy"
            className="text-series-text underline underline-offset-2 hover:text-ink"
          >
            Privacy Policy
          </Link>
          , which forms part of these terms.
        </P>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts and access',
    body: (
      <>
        <Bullets
          items={[
            'Accounts are issued by the operator. There is no public sign-up, and you may not create accounts for other people or share yours with them.',
            'You are responsible for what happens under your account. Choose a password you do not use elsewhere, and tell the operator promptly if you think it has been exposed.',
            'Access is scoped by role. Viewer, engineer and administrator see progressively more, and attempting to reach a screen or API your role does not cover is a breach of these terms even when a bug makes it technically possible.',
            'The operator may suspend or remove an account at any time — most often because someone has left the team, occasionally because of something in the section below.',
          ]}
        />
        <Callout title="Demo accounts">
          The credentials printed on the sign-in screen of a demonstration instance are public and
          shared. They are there to let you look around. They are not yours, they carry no
          expectation of privacy, and anything you do with them is visible to every other visitor.
        </Callout>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <P>Do not use this instance to:</P>
        <Bullets
          items={[
            'break into it, or into anything it can reach — probing for vulnerabilities, escalating your own privileges, or interfering with other accounts;',
            'overwhelm it, whether by hammering the API, flooding the ingestion endpoints, or pointing an automated tool at it that the operator has not agreed to;',
            'send alerts to people who have not agreed to receive them, or use the notification pipeline to deliver anything other than genuine operational alerts;',
            'store material that is unlawful, or that you have no right to put into someone else’s database;',
            'redistribute data you can see here to anyone who is not entitled to it — an incident feed is, by its nature, a description of somebody’s weak points.',
          ]}
        />
        <P>
          Security research on an instance you do not operate needs the operator&rsquo;s written
          permission first. Researchers who find something in the software itself are welcome to
          report it through the repository.
        </P>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability, and the absence of a promise about it',
    body: (
      <>
        <P>
          There is no uptime commitment, no support commitment and no service level agreement of
          any kind. The instance may be restarted, upgraded, reconfigured, reset or taken down
          permanently, with or without notice. A monitoring tool being unavailable does not mean
          the systems it watches are healthy — it means nobody is watching.
        </P>
        <P>
          On a demonstration instance in particular, the database may be wiped at any point and
          the fleet is simulated. Nothing you create there is durable.
        </P>
      </>
    ),
  },
  {
    id: 'your-data',
    title: 'The data you put in',
    body: (
      <>
        <P>
          What you send to Sentinel — metrics, logs, traces, rules, dashboards, incident notes —
          stays yours. Operating the instance requires storing, indexing and displaying it, and
          the operator does exactly that and nothing more. Where AI analysis is enabled, incident
          context is sent to Google Gemini as described in the Privacy Policy.
        </P>
        <P>
          You are responsible for what you send. Logs and traces have a habit of carrying
          credentials, tokens and customer records that nobody meant to emit, and Sentinel indexes
          whatever arrives. Redact at the source: once a secret reaches a full-text index, it is
          in the backups too.
        </P>
      </>
    ),
  },
  {
    id: 'ip',
    title: 'The software itself',
    body: (
      <>
        <P>
          Sentinel&rsquo;s source code, design and documentation belong to their author. The code
          is published at{' '}
          <a
            href={OPERATOR.repository}
            target="_blank"
            rel="noreferrer noopener"
            className="text-series-text underline underline-offset-2 hover:text-ink"
          >
            {OPERATOR.repository.replace('https://', '')}
          </a>{' '}
          and, unless a licence file in that repository says otherwise, all rights are reserved:
          you may read it, but copying, redistribution or commercial use needs permission.
        </P>
        <P>
          These terms give you permission to use this instance. They do not transfer any rights in
          the software, the name or the design. Third-party components — FastAPI, TimescaleDB,
          Redpanda, React and the rest — remain under their own licences.
        </P>
      </>
    ),
  },
  {
    id: 'third-party',
    title: 'Third-party services',
    body: (
      <P>
        Where the operator has enabled them, this instance depends on Google&rsquo;s Gemini API for
        incident analysis and on an SMTP provider for alert delivery. Those services are governed
        by their own terms, they can fail or change independently, and neither the operator nor
        the author of Sentinel is responsible for what they do. If AI analysis is unavailable, the
        incident is still recorded with its metrics, logs and traces intact — the summary is an
        addition, never the record itself.
      </P>
    ),
  },
  {
    id: 'warranty',
    title: 'No warranty',
    body: (
      <>
        <P>
          Sentinel is provided <strong className="font-medium text-ink">&ldquo;as is&rdquo;</strong>
          , without warranty of any kind, express or implied, including any implied warranty of
          merchantability, fitness for a particular purpose or non-infringement. Nobody warrants
          that it will be uninterrupted, that it will be free of defects, or that it will detect
          any particular problem.
        </P>
        <Callout title="Please read this one">
          This is monitoring software. It can miss an outage, fire an alert late, misjudge a
          threshold, or fail silently at exactly the wrong moment. Do not make it the only thing
          standing between you and a system whose failure would cause real harm — to health,
          safety, or anything else you cannot afford to lose.
        </Callout>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <P>
        To the fullest extent the law allows, neither the operator of this instance nor the author
        of the software is liable for any indirect, incidental, special or consequential damages,
        nor for lost profits, lost data or business interruption, arising from your use of
        Sentinel or from any failure of it — including an alert that never arrived. Nothing here
        limits liability for death or personal injury caused by negligence, for fraud, or for
        anything else that cannot lawfully be excluded.
      </P>
    ),
  },
  {
    id: 'changes',
    title: 'Changes, ending, and applicable law',
    body: (
      <>
        <P>
          These terms may change as the software does; the revision date at the top of the page
          moves when they do, and continuing to use the instance means accepting the current
          version. You can stop at any time by no longer signing in and asking the operator to
          remove your account. The operator may end your access at any time, and the sections on
          warranties, liability and intellectual property survive that ending.
        </P>
        <P>
          Because Sentinel is self-hosted, these terms are governed by the law of the place where
          the operator is established, and disputes belong to that jurisdiction&rsquo;s courts. If
          any clause turns out to be unenforceable, the rest continues to apply.
        </P>
        <P>
          Questions about these terms can go to <Mail />.
        </P>
      </>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalLayout
      kicker="Legal · Terms"
      title="Terms of Service"
      updated={LEGAL_UPDATED}
      version={LEGAL_VERSION}
      summary={
        <>
          The short version: use the account you were given, do not attack the instance or the
          systems it watches, and understand that a monitoring tool offered with no warranty can
          miss things. Nothing you send stops being yours, the software stays its author&rsquo;s,
          and neither the operator nor the author is liable for what an alert that never arrived
          cost you.
        </>
      }
      sections={SECTIONS}
    />
  );
}
