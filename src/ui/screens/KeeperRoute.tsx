import { MotionShell } from '../components/MotionShell';
import { Keeper } from './Keeper';

/**
 * The scorepad, and the motion shell it needs, behind one dynamic import.
 *
 * Default-exported because `React.lazy` takes a module whose default IS the
 * component, and it exists as a separate file for the same reason: the shell has
 * to be INSIDE the lazy boundary, or importing it would pull framer-motion back
 * into the entry chunk and the split would buy nothing.
 */
export default function KeeperRoute() {
  return <MotionShell><Keeper /></MotionShell>;
}
