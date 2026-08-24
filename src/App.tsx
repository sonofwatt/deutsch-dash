import { useEffect, useState } from 'react';
import { Home } from './ui/screens/Home';
import { RoomScreen } from './ui/screens/RoomScreen';
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
  return route.screen === 'room' ? <RoomScreen code={route.code} /> : <Home />;
}
