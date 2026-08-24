import { useEffect, useState } from 'react';
import { watchConnected } from '../../net/firebase';

export function ConnectionPill() {
  const [ok, setOk] = useState(true);
  useEffect(() => watchConnected(setOk), []);
  return ok ? null : <span className="conn-pill">reconnecting…</span>;
}
