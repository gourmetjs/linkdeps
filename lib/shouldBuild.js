"use strict";

var fs = require("fs");

// src: a source path or array of source paths
// des: an output path
module.exports = function shouldBuild(src, des) {
  var dst, idx, len, path, sst;

  try {
    dst = fs.statSync(des);
  } catch (err) {
    if (err && err.code === "ENOENT")
      dst = null;
    else
      throw err;
  }

  if (dst) {
    if (!Array.isArray(src))
      src = [src];
    for (idx = 0, len = src.length; idx < len; idx++) {
      path = src[idx];
      sst = fs.statSync(path);
      if (sst.mtime.getTime() > dst.mtime.getTime())
        break;
    }
    if (idx >= len)
      return false;
  }

  return true;
};
