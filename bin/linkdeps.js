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
      "               1) Adds own regular dependencies (from 'linkdeps.own')",
      "               2) Recursively adds regular dependencies of local packages",
      "               3) Recursively creates symlink in 'node_modules' to local packages",
      "  --deploy    deploy mode update",
      "               1) Adds own regular dependencies",
      "               2) Recursively adds local packages with 'file:' prefix",
      "  --deploy-mix  deploy mode update mixed with public & private",
      "               1) Adds own regular dependencies",
      "               2) Adds public local packages with name and '^version' ",
      "                  from their package.json",
      "               3) Recursively adds private local packages with 'file:' prefix",
      "  --publish   publish mode update",
      "               1) Adds own regular dependencies",
      "               2) Adds public local packages with name and '^version' ",
      "                  from their package.json",
      "                  * a private local package causes an error",
      "  --check     check only, no output writing"
    ].join("\n"));
    return;
  }

  if (!desPath)
    desPath = srcPath;

  var mode;

  if (argv.deploy)
    mode = "deploy";
  else if (argv["deploy-mix"])
    mode = "deploy-mix";
  else if (argv.publish)
    mode = "publish";
  else
    mode = "devel";

  var linkctx = createLinkDepsContext({
    srcPath: srcPath,
    desPath: desPath
  });

  linkctx.update(mode, argv.check);

  if (mode === "devel") {
    console.log(linkctx.stringifyDiff());
    if (!argv.check) {
      linkctx.linkLocals().catch(function(err) {
        setImmediate(function() {
          throw err;
        });
      });
    }
  }
})(parseArgs(process.argv.slice(2), PARSE_OPTS));
