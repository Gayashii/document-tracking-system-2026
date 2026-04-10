'use strict';

const { EventEmitter } = require('events');

/**
 * Singleton event bus for document lifecycle events.
 *
 * Consumers:
 *   documentEvents.on('document.status_changed', (payload) => { ... })
 *
 * Payload shape for 'document.status_changed':
 *   { documentId, fromStatus, toStatus, actorId, note }
 */
const documentEvents = new EventEmitter();

module.exports = documentEvents;
