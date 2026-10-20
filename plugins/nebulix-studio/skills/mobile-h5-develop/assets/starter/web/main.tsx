import React from 'react';
import { createRoot } from 'react-dom/client';
import MobileApp from './mobile/MobileApp';
import './base.css';

createRoot(document.getElementById('root')!).render(<MobileApp />);
