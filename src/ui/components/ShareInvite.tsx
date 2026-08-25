import { useState } from 'react';

export function inviteUrl(code: string): string {
  return `${location.origin}${location.pathname}#/room/${code}`;
}

export function ShareInvite({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const url = inviteUrl(code);
  // Share sheet only exists on mobile; without it "Copy link" is the primary action.
  const canShare = typeof navigator.share === 'function';

  async function share() {
    try {
      await navigator.share({ title: 'Flemish Fury', text: `Join my game! ${url}` });
    } catch {
      // user dismissed the share sheet
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard can be blocked (permissions, insecure context) - show the raw
      // link so it can still be selected and copied by hand
      setShowRaw(true);
    }
  }

  return (
    <>
      {canShare && (
        <button className="btn btn-primary" onClick={share}>Invite friends</button>
      )}
      <button className={canShare ? 'btn' : 'btn btn-primary'} onClick={copy}>
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      {showRaw && (
        <input className="field" readOnly value={url}
          onFocus={e => e.currentTarget.select()} aria-label="Invite link" />
      )}
    </>
  );
}
