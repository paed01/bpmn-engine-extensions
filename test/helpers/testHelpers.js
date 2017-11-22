'use strict';

const {Engine} = require('bpmn-engine');

module.exports = {
  getDefinition,
  onceEvent
};

function getDefinition(source, extensions) {
  const engine = Engine({
    source,
    extensions
  });

  return new Promise((resolve, reject) => {
    engine.getDefinition((err, def) => {
      if (err) return reject(err);
      resolve(def);
    });
  });
}

function onceEvent(emitter, eventName) {
  return new Promise((resolve) => {
    emitter.once(eventName, (...args) => {
      resolve(...args);
    });
  });
}
