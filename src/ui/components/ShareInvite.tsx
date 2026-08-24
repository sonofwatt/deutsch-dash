import { useState } from 'react';

export function inviteUrl(code: string): string {
  return `${location.origin}${location.pathname}#/room/${code}`;
}

export function ShareInvite({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(code);
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Holland Hustle', text: `Join my game! ${url}` }); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }
  return (
    <button className="btn btn-primary" onClick={share}>
      {copied ? 'Link copied!' : 'Invite friends'}
    </button>
  );
}
