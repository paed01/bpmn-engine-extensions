'use strict';

module.exports = function ScriptTask(extensions) {
  const {io} = extensions;

  if (io && io.allowReturnInputContext) {
    io.allowReturnInputContext(true);
  }

  return extensions;
};
