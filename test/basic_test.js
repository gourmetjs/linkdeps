"use strict";

var npath = require("path");
var test = require("tape");
var createLinkDepsContext = require("..");

test("basic", function(t) {
  var linkctx = createLinkDepsContext({
    srcPath: npath.join(__dirname, "fixture/basic")
  });

  linkctx.update("devel", true).then(function() {
    console.log(JSON.stringify(linkctx._desList, null, 2));
  }).then(t.end, t.end);
});
