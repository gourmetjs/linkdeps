"use strict";

var fs = require("fs");
var nutil = require("util");
var npath = require("path");
var mkdirp = require("mkdirp");
var shell = require("pshell").context({
  echoCommand: false
});

module.exports = function createLink(symlink, target) {
  if (!fs.existsSync(symlink)) {
    var dir = npath.dirname(symlink);
    var cmd;

    mkdirp.sync(dir);

    if (process.platform === "win32") {
      // On Windows, creating a symbolic link requires an admnin permission.
      // We have to use a directory junction to avoid runtime error. One
      // caveat is that a directory junction doesn't support a relative path.
      target = npath.resolve(process.cwd(), target);
      cmd = nutil.format("mklink /j %s %s", symlink, target);
    } else {
      target = npath.relative(dir, target);
      cmd = nutil.format("ln -s %s %s", target, symlink);
    }
    return shell(cmd);
  }
};
