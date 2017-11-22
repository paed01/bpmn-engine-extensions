'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  resource
};

function resource(file) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', file));
}
