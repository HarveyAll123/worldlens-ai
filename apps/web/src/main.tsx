import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
// Italics for the names of seas, lakes and rivers on the globe (a slanted upright looks rough).
import '@fontsource-variable/inter/wght-italic.css';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
