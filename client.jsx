import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { JackAudioRouter } from './jackAudioRouter.jsx';

// Retrieve the initial data embedded in the HTML by the server
const initialData = window.__INITIAL_DATA__;
console.log('Client-side initialData:', initialData); // Add this line

// The root element where your React app is rendered
const container = document.getElementById('root');

// Use hydrateRoot to attach React to the existing server-rendered HTML
hydrateRoot(container, <JackAudioRouter initialData={initialData} />);
