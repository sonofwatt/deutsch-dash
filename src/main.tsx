import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyPlatform } from './ui/platform';

// Once, before the first paint: it is a fact about the device and cannot change
// while the tab is open. The board's edge guards key off what it stamps.
applyPlatform();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
