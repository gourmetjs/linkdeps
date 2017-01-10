"use strict";

var npath = require("path");
var test = require("tape");
var createLinkDepsContext = require("../lib");

test("basic", function(t) {
  var linkctx = createLinkDepsContext({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  t.equal(1, 1);
  t.end();
});
