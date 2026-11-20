export const metadata = { title: 'Procare Team · Terms of use' };

export default function TermsPage() {
  return (
    <article>
      <h1>Terms of use</h1>
      <p className="note">Procare Team app · Last updated November 19, 2026</p>
      <p>
        The Procare Team app is an internal tool built by and for Procare Pest (“Procare”, “we”). It is not offered to the
        public. These terms apply to everyone who signs in to it.
      </p>
      <h2>Who may use it</h2>
      <p>Only current Procare employees and contractors that Procare has given an account. Access ends when that relationship ends.</p>
      <h2>How it may be used</h2>
      <ul>
        <li>Only for Procare business: schedules, performance, pay, operations and company finances.</li>
        <li>Keep your sign-in to yourself. Don’t share it or let someone else use your account.</li>
        <li>Information in the app (customer, employee and financial information) is confidential. Don’t copy or share it outside Procare.</li>
      </ul>
      <h2>Connected services</h2>
      <p>
        The app reads information from services Procare uses, such as FieldRoutes and QuickBooks Online. Connecting
        QuickBooks is done by a Procare owner or executive and only lets the app read Procare’s own reports. The app does
        not change anything in QuickBooks. A connection can be removed at any time from the app or from QuickBooks.
      </p>
      <h2>No warranty</h2>
      <p>
        The app is provided as is. Numbers in it are copies of the source systems and may lag behind them; the source
        systems are the record. Procare may change or stop the app at any time.
      </p>
      <h2>Questions</h2>
      <p>Ask your Procare manager or the Procare office.</p>
    </article>
  );
}
