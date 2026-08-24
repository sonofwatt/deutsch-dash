import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Home } from './ui/screens/Home';
import { RoomScreen } from './ui/screens/RoomScreen';
import { configMissing } from './net/firebase';
import './theme.css';
import './ui/ui.css';

export type Route = { screen: 'home' } | { screen: 'room'; code: string };

export function parseHash(hash: string): Route {
  const m = /^#\/room\/([A-Za-z0-9]{4,10})$/.exec(hash);
  return m ? { screen: 'room', code: m[1].toUpperCase() } : { screen: 'home' };
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
