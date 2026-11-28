import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const target = document.getElementById('root');
if (!target) throw new Error('Control Center root is missing.');
createRoot(target).render(<React.StrictMode><App /></React.StrictMode>);
