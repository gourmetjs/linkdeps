"use strict";

module.exports = function linkdep(options) {
  return {
    addOwnDeps: _addOwnDeps,
    addPublicLocals: _addPublicLocals,
    addPrivateLocals: _addPrivateLocals,
    errorLocalPrivateDeps: _errorLocalPrivateDeps,
    linkLocals: _linkLocals
  };
};
