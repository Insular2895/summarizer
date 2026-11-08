import { EventEmitter } from "node:events";

export const localEvents = new EventEmitter();
localEvents.setMaxListeners(20);
