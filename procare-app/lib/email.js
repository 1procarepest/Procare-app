// Server only: sends email through Resend (https://resend.com).
// Needs RESEND_API_KEY and EMAIL_FROM in Vercel's environment variables.
// Without them, nothing is sent and the app carries on normally.

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sends one email. `lines` are plain sentences, shown one per line; `link` is
 * { href, label } for a button. Returns true when Resend accepted it.
 */
export async function sendEmail({ to, subject, heading, lines, link }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipients = [...new Set((to || []).filter(Boolean))];
  if (!key || !from || recipients.length === 0) {
    if (!key || !from) console.warn('Email not sent: RESEND_API_KEY or EMAIL_FROM is missing.');
    return false;
  }

  const text = [heading, '', ...lines, '', link ? `${link.label}: ${link.href}` : '']
    .join('\n')
    .trim();

  const html = `<!doctype html><html><body style="margin:0;background:#F4F5F5;font-family:'Hanken Grotesk',Arial,sans-serif;color:#062F35">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px">
    <div style="background:#FFFFFF;border:1px solid #CDD5CF;border-radius:14px;padding:24px">
      <h1 style="font-size:20px;line-height:1.3;margin:0 0 14px">${escapeHtml(heading)}</h1>
      ${lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 8px">${escapeHtml(l)}</p>`).join('')}
      ${link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link.href)}" style="display:inline-block;background:#025F49;color:#FFFFFF;text-decoration:none;font-family:'IBM Plex Mono','Courier New',monospace;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:12px 18px;border-radius:10px">${escapeHtml(link.label)}</a></p>` : ''}
    </div>
    <p style="font-size:12px;color:#4A6366;margin:14px 4px 0">Procare Team app. Automatic email; C-Suite can turn it off under Manage team → Email settings.</p>
  </div>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject, text, html }),
    });
    if (!res.ok) console.error('Resend refused the email:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('Email failed to send:', err);
    return false;
  }
}
