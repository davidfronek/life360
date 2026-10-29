import { EventEmitter } from 'node:events';

// Jednoduchý hub, přes který worker oznamuje nové polohy SSE klientům
export const hub = new EventEmitter();
hub.setMaxListeners(100);
