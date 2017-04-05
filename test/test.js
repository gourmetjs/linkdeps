"use strict";

var fs = require("fs");
var npath = require("path");
var nutil = require("util");
var test = require("tape");
var shell = require("pshell");
var LinkDeps = require("../lib/LinkDeps");

test("basic - devel", function(t) {
  var linkdeps = new LinkDeps({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  var res = linkdeps.update("devel");

  t.deepEqual(res, {
    dependencies: {
      "deep-equal": "^1.0.1",
      "mkdirp": "^0.5.1",
      "rimraf": "^2.5.4",
      "through": "^2.3.8"
    }
  });

  t.equal(linkdeps.stringifyDiff(), [
    "<dependencies>",
    "+ deep-equal: ^1.0.1",
    "+ mkdirp: ^0.5.1",
    "+ rimraf: ^2.5.4",
    "+ through: ^2.3.8",
    "- will_be_deleted: *"
  ].join("\n"));

  t.end();
});

test("basic - deploy", function(t) {
  var linkdeps = new LinkDeps({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  var res = linkdeps.update("deploy");

  t.deepEqual(res, {
    dependencies: {
      "local-a": "file:a",
      "local-b": "file:b",
      "local-c": "file:c",
      "mkdirp": "^0.5.1"
    }
  });

  t.end();
});

test("basic - deploy-mix", function(t) {
  var linkdeps = new LinkDeps({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  var res = linkdeps.update("deploy-mix");

  t.deepEqual(res, {
    dependencies: {
      "local-a": "file:a",
      "local-b": "file:b",
      "local-c": "^2.0.0",
      "mkdirp": "^0.5.1"
    }
  });

  t.end();
});

test("basic - publish", function(t) {
  var linkdeps = new LinkDeps({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  try {
    linkdeps.update("publish");
    t.fail("should not get here");
  } catch (err) {
    t.equal(err.message.split("\n")[0], "You cannot use private package: 'local-a'");
  }

  t.end();
});

test("complex - devel", function(t) {
  var linkdeps = new LinkDeps({
    srcPath: npath.join(__dirname, "fixture/complex"),
    refs: true
  });

  var res = linkdeps.update("devel");

  t.deepEqual(res, {
    dependencies: {
      "npm-1": "^0.1.3",
      "npm-2": "0.1.3",
      "npm-b-2": "^1.2.1",
      "npm-c-1": "^3.1.0"
    },
    devDependencies: {
      "npm-a-1": "^2.5.4",
      "npm-a-2": "^1.5.4",
      "npm-b-1": "^1.0.1",
      "npm-c-2": "^3.1.1"
    }
  });

  t.equal(linkdeps.stringifyDiff(), [
    "<dependencies>",
    "  npm-1: ^0.1.3 (~:^0.1.1, local/c:*, local/b:^0.1.3)",
    "+ npm-2: 0.1.3 (~:^0.1.0, local/c:0.1.3)",
    "+ npm-b-2: ^1.2.1 (local/c:^1.2.1, local/b:^1.1.1)",
    "C npm-c-1: ^3.0.0 => ^3.1.0 (local/c:^3.0.1, local/b:^3.1.0)",
    "<devDependencies>",
    "+ npm-a-1: ^2.5.4 (local/a:^2.5.4)",
    "+ npm-a-2: ^1.5.4 (local/a:^1.5.4)",
    "  npm-b-1: ^1.0.1 (local/b:^1.0.1)",
    "  npm-c-2: ^3.1.1 (local/c:^3.1.1)",
    "- npm-d-1: ^4.5.4",
    "- npm-d-2: ^5.5.4"
  ].join("\n"));

  t.end();
});

test("complex - deploy", function(t) {
  var linkdeps = new LinkDeps({
    srcPath: npath.join(__dirname, "fixture/complex"),
    desPath: npath.join(__dirname, "fixture/output"),
  });

  var res = linkdeps.update("deploy");

  t.deepEqual(res, {
    dependencies: {
      "local-c": "file:../complex/local/c",
      "npm-1": "^0.1.1"
    },
    devDependencies: {
      "local-a": "file:../complex/local/a",
      "local-b": "file:../complex/local/b",
      "npm-2": "^0.1.0"
    }
  });

  t.end();
});

test("complex - deploy-mix", function(t) {
  var linkdeps = new LinkDeps({
    srcPath: npath.join(__dirname, "fixture/complex")
  });

  var res = linkdeps.update("deploy-mix");

  t.deepEqual(res, {
    dependencies: {
      "local-c": "^2.0.0",
      "npm-1": "^0.1.1"
    },
    devDependencies: {
      "local-a": "^0.1.1",
      "npm-2": "^0.1.0"
    }
  });

  t.end();
});

test("complex - publish", function(t) {
  var linkdeps = new LinkDeps({
    srcPath: npath.join(__dirname, "fixture/complex")
  });

  var res = linkdeps.update("publish");

  t.deepEqual(res, {
    dependencies: {
      "local-c": "^2.0.0",
      "npm-1": "^0.1.1"
    },
    devDependencies: {
      "local-a": "^0.1.1",
      "npm-2": "^0.1.0"
    }
  });

  t.end();
});

test("link", function(t) {
  var binPath = npath.join(__dirname, "../bin/linkdeps.js");
  var srcPath = npath.join(__dirname, "fixture/link");
  var desPath = npath.join(__dirname, "_build");
  var rm = nutil.format("rimraf %s", desPath);
  var cmd = nutil.format("node %s %s --out=%s", binPath, srcPath, desPath);
  var sh = shell.context({
    echoCommand: false,
    captureOutput: true
  });

  sh(rm).then(function() {
    return sh(cmd);
  }).then(function() {
    var moduleDir = npath.join(desPath, "node_modules");
    t.ok(fs.existsSync(npath.join(moduleDir, "a")));
    t.ok(fs.existsSync(npath.join(moduleDir, "b")));
    t.ok(fs.existsSync(npath.join(moduleDir, ".bin/a")));
    t.ok(fs.existsSync(npath.join(moduleDir, ".bin/b-bin")));
    return sh(rm);
  }).then(function() {
  }).then(t.end, t.end);
});
