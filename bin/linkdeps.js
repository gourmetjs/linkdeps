#!/usr/bin/env node

"use strict";

var parseArgs = require("minimist");
var createLinkDepsContext = require("..");

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
  var desPath = argv.out;

  if (argv.help) {
    console.log([
      "Usage: linkdeps [<input_dir>] [options]",
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
      "  --deploy-mix  deploy mode update with public & private mixed",
      "               1) Adds own regular dependencies",
      "               2) Adds public local packages with name and '^version' ",
      "                  from their package.json",
      "               3) Recursively adds private local packages with 'file:' prefix",
      "  --publish   publish mode update",
      "               1) Adds own regular dependencies",
      "               2) Adds public local packages with name and '^version' ",
      "                  from their package.json",
      "                  * a private local package causes an error",
      "  --link      do #3 of devel mode only",
      "  --check     check only, no output writing",
      "  --out=dir   set output dir"
    ].join("\n"));
    return;
  }
  var mode;

  if (argv.deploy)
    mode = "deploy";
  else if (argv["deploy-mix"])
    mode = "deploy-mix";
  else if (argv.publish)
    mode = "publish";
  else if (argv.link)
    mode = "link";
  else
    mode = "devel";

  var linkctx = createLinkDepsContext({
    srcPath: srcPath,
    desPath: desPath
  });

  if (mode !== "link") {
    linkctx.update(mode);

    if (!argv.check)
      linkctx.saveResult();
  }

  if (mode === "devel") {
    console.log(linkctx.stringifyDiff());
    console.log(linkctx.stringifyLocals());
  }

  if ((mode === "devel" || mode === "link") && !argv.check) {
    linkctx.linkLocals().catch(function(err) {
      setImmediate(function() {
        throw err;
      });
    });
  }
})(parseArgs(process.argv.slice(2), PARSE_OPTS));
