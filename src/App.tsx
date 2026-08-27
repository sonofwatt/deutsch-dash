import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Home } from './ui/screens/Home';
import { RoomScreen } from './ui/screens/RoomScreen';
import { Keeper } from './ui/screens/Keeper';
import { configMissing } from './net/firebase';
import { gameStore } from './state/store';
import './theme.css';
import './ui/ui.css';

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
  useEffect(() => {
    const s = gameStore.getState();
    if (route.screen === 'home' && s.joinPhase !== 'idle') s.leave();
    if (route.screen === 'room' && s.code && s.code !== route.code) s.leave();
  }, [route]);
  // Before the config gate on purpose: the scorepad is pure local arithmetic and
  // works in a deployment with no Firebase at all.
  if (route.screen === 'keeper') {
    return <MotionConfig reducedMotion="user"><Keeper /></MotionConfig>;
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
    <MotionConfig reducedMotion="user">
      {route.screen === 'room' ? <RoomScreen code={route.code} /> : <Home />}
    </MotionConfig>
  );
}
