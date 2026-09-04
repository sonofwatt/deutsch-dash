import { lazy, Suspense, useEffect, useState } from 'react';
import { Home } from './ui/screens/Home';
import { RoomScreen } from './ui/screens/RoomScreen';
import { ThemeToggle } from './ui/components/ThemeToggle';
import { CrashGuard } from './ui/components/CrashGuard';
import { configMissing } from './net/firebase';
import { gameStore, useGameStore } from './state/store';
import './theme.css';
import './ui/ui.css';

/**
 * The scorepad, loaded when somebody asks for it.
 *
 * Nothing this file imports reaches framer-motion any more, which is the point:
 * the library is 43 kB gzip of a 199 kB first load, and it now arrives with the
 * board or the scorepad rather than with the app. `MotionConfig` went with it -
 * see `MotionShell`, which each lazy branch renders for itself, because importing
 * the config here would have pulled the library straight back in.
 */
const KeeperRoute = lazy(() => import('./ui/screens/KeeperRoute'));

/** Shown only while a route chunk is in flight, which is once per device. */
const loading = <div className="screen stack"><p className="muted">Loading…</p></div>;

export type Route = { screen: 'home' } | { screen: 'room'; code: string } | { screen: 'keeper' };

export function parseHash(hash: string): Route {
  const m = /^#\/room\/([A-Za-z0-9]{4,10})$/.exec(hash);
  if (m) return { screen: 'room', code: m[1].toUpperCase() };
  return hash === '#/keeper' ? { screen: 'keeper' } : { screen: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  // The board carries the theme toggle in its own head pill, alongside the wood
  // swap and the sit-out button - three controls, one island. Everywhere else it
  // is the only control on screen, so it gets a corner pill of its own. Rendered
  // in one place or the other, never both.
  const joinPhase = useGameStore(s => s.joinPhase);
  const phase = useGameStore(s => s.room?.meta.phase);
  const boardUp = route.screen === 'room' && joinPhase === 'in-room' && phase != null && phase !== 'lobby';
  useEffect(() => {
    const s = gameStore.getState();
    if (route.screen === 'home' && s.joinPhase !== 'idle') s.leave();
    if (route.screen === 'room' && s.code && s.code !== route.code) s.leave();
  }, [route]);
  // Before the config gate on purpose: the scorepad is pure local arithmetic and
  // works in a deployment with no Firebase at all.
  if (route.screen === 'keeper') {
    return (
      <>
        <CrashGuard><Suspense fallback={loading}><KeeperRoute /></Suspense></CrashGuard>
        <span className="corner-btns"><ThemeToggle /></span>
      </>
    );
  }
  if (configMissing) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <h1 className="title">Not configured</h1>
        <p className="muted">
          This deployment has no Firebase config. Paste your project config into
          src/net/firebaseConfig.ts and redeploy.
        </p>
      </div>
    );
  }
  return (
    <>
      <CrashGuard>{route.screen === 'room' ? <RoomScreen code={route.code} /> : <Home />}</CrashGuard>
      {!boardUp && <span className="corner-btns"><ThemeToggle /></span>}
    </>
  );
}
