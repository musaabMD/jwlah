import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Analytics} from '@vercel/analytics/react';
import App from './App.tsx';
import './index.css';

const APP_DOC_TITLE = 'جولة التفتيش — الطب الوقائي | تجمع المدينة المنورة الصحي';
document.title = APP_DOC_TITLE;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
