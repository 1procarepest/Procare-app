export const metadata = { title: 'Procare Team · Privacy policy' };

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy policy</h1>
      <p className="note">Procare Team app · Last updated November 19, 2026</p>
      <p>
        The Procare Team app is an internal tool used only by Procare Pest (“Procare”) employees. This policy explains what
        information it uses and how that information is protected.
      </p>
      <h2>What information the app uses</h2>
      <ul>
        <li><b>Employee information:</b> name, work email, role, office, schedules, time off and pay details, for running Procare.</li>
        <li><b>Service information from FieldRoutes:</b> appointments, services sold and completed, and customer names, for schedules and performance.</li>
        <li><b>Financial reports from QuickBooks Online:</b> Procare’s own profit and loss by class (office), read only, for company finance reports.</li>
      </ul>
      <h2>Who can see it</h2>
      <p>
        Only Procare employees signed in to the app, and each sees only what their role needs. Company financial reports
        are limited to Procare’s owner and executives.
      </p>
      <h2>How it’s stored and protected</h2>
      <p>
        Information is stored with Procare’s database provider (Supabase) and served by its hosting provider (Vercel), in
        the United States, over encrypted connections. QuickBooks sign-in tokens are kept only on the server and are never
        shown to anyone in the app. Procare does not sell information or share it with advertisers.
      </p>
      <h2>Removing a connection or information</h2>
      <p>
        QuickBooks can be disconnected at any time in the app (Finance → Settings) or in QuickBooks. Employees can ask the
        Procare office to correct or remove their information, subject to records Procare must keep.
      </p>
      <h2>Questions</h2>
      <p>Contact the Procare office.</p>
    </article>
  );
}
