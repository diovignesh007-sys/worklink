const TIPS = [
  { icon: '🏛️', title: 'Meet in public first', body: 'For first meetings, choose a public place — a café, the site gate, a busy market. Avoid going to isolated locations alone.' },
  { icon: '🪪', title: 'Verify identity', body: 'Check the employer’s profile rating and reviews. Confirm the job site address before you travel. A video call is a quick way to confirm who you are dealing with.' },
  { icon: '🚫', title: 'Never pay to get a job', body: 'Real employers do not ask workers for registration fees, deposits, “training kits” or tokens. Anyone asking for money to give you work is scamming you — report them.' },
  { icon: '🧾', title: 'Agree terms before starting', body: 'Confirm the pay, pay type, hours and reporting time in chat so there is a written record. Use the in-app day log so your hours are tracked.' },
  { icon: '📵', title: 'Keep it on WorkLink', body: 'Keep conversations in the app where our safety team can help. Be careful with links sent in chat — check them before opening.' },
  { icon: '📱', title: 'Share your plans', body: 'Tell a family member where you are working and when you expect to finish. Keep your phone charged.' },
];

export default function SafetyPage() {
  return (
    <div className="p-4 pb-24 max-w-xl mx-auto">
      <h1 className="font-black text-xl mb-1">Safety guide</h1>
      <p className="text-sm text-subtle mb-5">WorkLink is built to keep both sides safe. Read this before your first job.</p>
      <ul className="space-y-3">
        {TIPS.map((tip) => (
          <li key={tip.title} className="bg-card border border-line rounded-2xl p-4">
            <p className="font-bold text-[15px]"><span aria-hidden className="mr-2">{tip.icon}</span>{tip.title}</p>
            <p className="text-sm text-text/85 mt-1">{tip.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 bg-danger/10 border border-danger/30 rounded-2xl p-4">
        <p className="font-bold text-danger text-sm">Scammed or feel unsafe?</p>
        <p className="text-sm mt-1">Report the user, job or chat directly from their profile or the chat header. Reports reach our moderation queue immediately.</p>
      </div>
    </div>
  );
}
