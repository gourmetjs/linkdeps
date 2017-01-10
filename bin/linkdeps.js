#!/usr/bin/env node

"use strict";

var parseArgs = require("minimist");
var createLinkDepsContext = require("../lib");

var PARSE_OPTS = {
  boolean: true,
  alias: {
    "h": "help"
  }
};

(function main(argv) {
  if (argv.version) {
    console.log(require("../package.json").version);
    return;
  }

  var srcPath = argv._[0];
  var desPath = argv._[1];

  if (!srcPath || argv.help) {
    console.log([
      "Usage: linkdeps <package.json> [<output_package.json>] [options]",
      "",
      "Options:",
      "  --version   print the version number",
      "  -h, --help  print this help message",
      "  --devel     devel mode update (default)",
      "               1) Adds packages in 'linkdeps.own'",
      "               2) Adds dependencies of packages in 'linkdeps.local' recursively",
      "               3) Creates symlinks in 'node_modules' to packages in 'linkdeps.local'",
      "  --publish   publish mode update",
      "               1) Adds packages in 'linkdeps.own'",
      "               2) Adds public packages in 'linkdeps.local' with name and '^version' ",
      "                  from their package.json",
      "                  * a private package causes an error",
      "  --deploy    deploy mode update",
      "               1) Adds packages in 'linkdeps.own'",
      "               2) Adds public packages in 'linkdeps.local' with name and '^version' ",
      "                  from their package.json",
      "               3) Adds private packages in 'linkdeps.local' with 'file:' prefix",
      "  --check     check only, no output writing"
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

  var linkctx = createLinkDepsContext({
    srcPath: srcPath,
    desPath: desPath,
    mode: mode,
    check: argv.check
  });

  linkctx.update().catch(function(err) {
    setImmediate(function() {
      throw err;
    });
  });
})(parseArgs(process.argv.slice(2), PARSE_OPTS));
