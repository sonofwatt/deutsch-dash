import { Component, type ReactNode } from 'react';
import { gameStore } from '../../state/store';

interface State { failed: boolean }

/**
 * The last line of defence against a render that throws.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which on this app meant a blank page with no way back but editing the URL.
 * Everything drawn here is read off a room that other clients wrote, so a value
 * one of them got wrong (see badgeFor, isCard, the counts in normalizeRoom) is a
 * fault every client in the room shares. Those reads are now defensive; this is
 * for the one nobody thought of. It leaves the room, because a room is where the
 * bad value lives, and goes home.
 */
export class CrashGuard extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  leave = () => {
    gameStore.getState().leave();
    location.hash = '#/';
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <h1 className="title">Something broke</h1>
        <p className="muted">
          The screen hit an error it could not draw past. Leaving the room clears
          it; if it comes straight back on rejoining, the room holds something this
          build cannot read, and a new room is the way on.
        </p>
        <button className="btn btn-primary" onClick={this.leave}>Leave and go home</button>
      </div>
    );
  }
}
