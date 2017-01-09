#!/usr/bin/env node

"use strict";

var npath = require("path");
var parseArgs = require("minimist");
var linkdep = require("../lib");

var PARSE_OPTS = {
  boolean: true,
  alias: {
    "h": "help"
  }
};

function _update(context, mode) {
  switch (mode) {
    case "deploy": 
      return context.addOwnDeps().then(function() {
        return context.addPublicLocals();
      }).then(function() {
        return context.addPrivateLocals();
      });
    case "publish":
      return context.addOwnDeps().then(function() {
        return context.addPublicLocals();
      }).then(function() {
        return context.errorLocalPrivateDeps();
      });
    default:  // "devel"
      return context.addOwnDeps().then(function() {
        return context.addPublicLocalDeps();
      }).then(function() {
        return context.linkLocals();
      });
  }
}

(function main(argv) {
  if (argv.version) {
    console.log(require("../package.json").version);
    return;
  }

  var srcPath = argv._[0];
  var desPath = argv._[1];

  if (!srcPath || argv.help) {
    console.log([
      "Usage: linkdep <package.json> [<output_package.json>] [options]",
      "",
      "Options:",
      "  --version   print the version number",
      "  -h, --help  print this help message",
      "  --devel     devel mode update (default)",
      "               1) 'dependencies' initialized with 'linkdep.own'",
      "               2) public deps of packages from 'linkdep.local' added to",
      "                  'dependencies' recursively",
      "               3) packages from 'linkdep.local' symlink'ed",
      "  --publish   publish mode update",
      "               1) 'dependencies' initialized with 'linkdep.own'",
      "               2) public packages from 'linkdep.local' added to 'dependencies'",
      "                  with name and '^version' from their package.json",
      "                  * a private package causes an error",
      "  --deploy    deploy mode update",
      "               1) 'dependencies' initialized with 'linkdep.own'",
      "               2) public packages from 'linkdep.local' added to 'dependencies'",
      "                  with name and '^version' from their package.json",
      "               2) private packages from 'linkdep.local' added to 'dependencies'",
      "                  with 'file:' prefix"
    ].join("\n"));
    return;
  }

  if (!desPath)
    desPath = srcPath;

  var mode;

  if (argv.deploy)
    mode = "deploy";
  else if (argv.publish)
    mode = "publish";
  else
    mode = "devel";

  var context = linkdep({
    srcPath: srcPath,
    desPath: desPath
  });

  _update(context, mode).then(function() {
    context.showResult();
  }).catch(function(err) {
    setImmediate(function() {
      throw err;
    });
  });
})(parseArgs(process.argv.slice(2), PARSE_OPTS));
