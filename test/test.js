"use strict";

var npath = require("path");
var test = require("tape");
var createLinkDepsContext = require("..");

test("basic - devel", function(t) {
  var linkctx = createLinkDepsContext({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  var res = linkctx.update("devel", true);

  t.deepEqual(res, {
    dependencies: {
      "deep-equal": "^1.0.1",
      "mkdirp": "^0.5.1",
      "rimraf": "^2.5.4",
      "through": "^2.3.8"
    }
  });

  t.equal(linkctx.stringifyDiff(), [
    "<dependencies>",
    "+ deep-equal: ^1.0.1 (local-b@b:^1.0.1)",
    "+ mkdirp: ^0.5.1 (~:^0.5.1)",
    "+ rimraf: ^2.5.4 (local-a@a:^2.5.4)",
    "+ through: ^2.3.8 (local-c@c:^2.3.8)",
    "- will_be_deleted: * "
  ].join("\n"));

  t.end();
});

test("basic - deploy", function(t) {
  var linkctx = createLinkDepsContext({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  var res = linkctx.update("deploy", true);

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
  var linkctx = createLinkDepsContext({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  var res = linkctx.update("deploy-mix", true);

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
  var linkctx = createLinkDepsContext({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  try {
    linkctx.update("publish", true);
    t.fail("should not get here");
  } catch (err) {
    t.pass("exception thrown");
  }

  t.end();
});
