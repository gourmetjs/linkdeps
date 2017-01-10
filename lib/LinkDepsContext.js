"use strict";

var fs = require("fs");
var npath = require("path");
var nutil = require("util");
var semver = require("semver");
var wrap = require("promise-box/lib/wrap");

function _satisfies(ver, range) {
  try {
    return semver.satisfies(ver, range);
  } catch (err) {
    if (!(err instanceof TypeError))
      throw err;
  }
}

function _readPackage(path) {
  var content = fs.readFileSync(npath.join(path, "package.json"), "utf8");
  return JSON.parse(content);
}

function _parseDeps(obj) {
  function _parse(list, type) {
    if (list) {
      for (var name in list) {
        var semver = list[name];
        deps.push({
          name: name,
          semver: semver,
          type: type
        });
      }
    }
  }
  var deps = [];
  _parse(obj.dependencies, "dep");
  _parse(obj.devDependencies, "dev");
  return deps;
}

function _slashPath(path) {
  return path.replace(/\\/g, "/");
}

function LinkDepsContext(options) {
  this._options = options;
  this._srcPath = npath.resolve(process.cwd(), options.srcPath);
  this._desList = {};

  if (options.srcPackgage)
    this._srcPackage = options.srcPackage;
  else
    this._srcPackage = _readPackage(this._srcPath);
}

var proto = LinkDepsContext.prototype;

proto.update = function(mode, check) {
  var self = this;
  return this.addOwnDeps().then(function() {
    switch (mode) {
      case "deploy": 
        return self.addPublicLocals().then(function() {
          return self.addPrivateLocals();
        });
      case "publish":
        return self.addPublicLocals().then(function() {
          return self.errorPrivateLocals();
        });
      default:  // "devel"
        return self.addDepsOfLocals().then(function() {
          if (!check)
            return self.linkLocals();
        });
    }
  }).then(function() {
    self.showResult();
    if (!check)
      self.saveResult();
  });
};

// Adds dependencies in `linkdeps.own` to the destination list.
// Root packages' `[dev]dependencies` is auto-generated and this field should
// be used for the own dependencies instead.
proto.addOwnDeps = function() {
  var self = this;
  return wrap(function() {
    var obj = self._srcPackage.linkdeps && self._srcPackage.linkdeps.own;
    if (obj)
      self._addDeps(_parseDeps(obj), self._srcPath);
  });
};

// Adds public packages (packages without "private" set to true) in
// `linkdeps.local` to the destination list so they can be pulled from public
// NPM registry. Name and version are read from their package.json and
// semver is set to "^version".
proto.addPublicLocals = function() {
  return this._forEachLocal(function(info) {
    if (!info.package.private) {
      var dep = this._getPublicLocal(info);
      this._addDep(dep.name, dep.semver, dep.type, this._srcPath);
    }
  });
};

// Adds private packages (packages with "private" set to true) in `linkdeps.local`
// to the destination list with "file:" prefix so they can be copied from local
// folders.
proto.addPrivateLocals = function() {
  return this._forEachLocal(function(info) {
    if (info.package.private) {
      var dep = this._getPrivateLocal(info);
      this._addDep(dep.name, dep.semver, dep.type, this._srcPath);
    }
  });
};

proto.errorPrivateLocals = function() {
  return this._forEachLocal(function(info) {
    if (info.package.private)
      throw this.getFieldError("You cannot use a private package in this mode" , info.path);
  });
};

proto.addDepsOfLocals = function() {
  var self = this;
  return wrap(function() {
    self._addDepsOfLocals(self._srcPackage, self._srcPath, true);
  });
};

proto.linkLocals = function() {

};

proto.saveResult = function(/*path*/) {

};

proto.showResult = function(/*path*/) {

};

proto.getSrcRelPath = function(path) {
  path = npath.relative(this._srcPath, path);
  return _slashPath(path);
};

proto.getDesRelPath = function(path) {
  path = npath.relative(this._options.desPath || this._srcPath, path);
  return _slashPath(path);
};

proto.getFieldError = function(mesg, path) {
  mesg = mesg + "\n  at " + npath.join(path, "package.json");
  return new Error(mesg);
};

proto._addDep = function(name, semver, type, path) {
  var refPath = this._refPath(path);

  if (this._desList[name]) {
    var item = this._desList[name];
    var mergedVer = this._mergeSemVer(item.semver, semver);

    if (!mergedVer) {
      throw Error(nutil.format(
        "Dependency '%s' version conflict:\n" +
        "  1: \"%s\": (%s)\n" +
        "  2: \"%s\": (%s)",
        name, item.semver, item.refs.join(", "), semver, refPath
      ));
    }

    var mergedType = item.type;
    if (type === "dep" && item.type !== "dep")
      mergedType = type;

    item.semver = mergedVer;
    item.type = mergedType;
    item.refs.push(refPath);
  } else {
    this._desList[name] = {
      name: name,
      semver: semver,
      type: type,
      refs: [refPath]
    };
  }
};

proto._addDeps = function(deps, path, overrideType) {
  var self = this;
  deps.forEach(function(dep) {
    self._addDep(dep.name, dep.semver, overrideType || dep.type, path);
  });
};

proto._parseLocals = function(obj, path) {
  function _parse(list, type) {
    if (list) {
      for (var name in list) {
        var semver = list[name];

        if (semver !== "*") {
          throw this.getFieldError(nutil.format(
            "You cannot specify a version other than \"*\" in local dependencies:\n" +
            "  \"%s\": \"%s\"", name, semver
          ), path);
        }

        var subpath = self._resolveLocalPath(path, name);
        var pkg = _readPackage(subpath);

        locals.push({
          path: subpath,
          package: pkg,
          type: type
        });
      }
    }
  }

  var self = this;
  var locals = [];

  _parse(obj.dependencies, "dep");
  _parse(obj.devDependencies, "dev");

  return locals;
};

proto._addDepsOfLocals = function(pkg, path, isRoot, type) {
  var self = this;
  var obj;

  if (!isRoot) {
    obj = (pkg.linkdeps && pkg.linkdeps.own) || pkg;
    this._addDeps(_parseDeps(obj), path, type);
  }

  obj = (pkg.linkdeps && pkg.linkdeps.local);
  if (obj) {
    var locals = this._parseLocals(obj, path);
    locals.forEach(function(info) {
      var overrideType;
      if (isRoot && info.type !== "dep")
        overrideType = info.type;
      self._addDepsOfLocals(info.package, info.path, false, overrideType);
    });
  }
};

proto._mergeSemVer = function(v1, v2) {
  if (this._options.mergeSemVer)
    return this._options.mergeSemVer.call(this, v1, v2);

  if (v1 === v2)
    return v1;

  if (v1[0] === "^" && v2[0] === "^") {
    if (_satisfies(v1.substr(1), v2))
      return v1;
    else if (_satisfies(v2.substr(0), v1))
      return v2;
  } else if (v1[0] === "^") {
    if (_satisfies(v2, v1))
      return v2;
  } else if (v2[0] === "^") {
    if (_satisfies(v1, v2))
      return v1;
  } else if (v1 === "*") {
    return v2;
  } else if (v2 === "*") {
    return v1;
  }
};

proto._refPath = function(path) {
  path = this.getSrcRelPath(path);
  if (!path)
    path = "~";
  return path;
};

proto._forEachLocal = function(callback) {
  var self = this;
  return wrap(function() {
    var obj = self._srcPackage.linkdeps && self._srcPackage.linkdeps.local;
    if (obj) {
      var locals = self._parseLocals(obj, self._srcPath);
      locals.forEach(callback.bind(self));
    }
  });
};

proto._getPublicLocal = function(info) {
  if (this._options.getPublicLocal)
    return this._options.getPublicLocal.call(this, info);

  var pkg = info.package;

  if (!pkg.name || !pkg.version)
    throw this.getFieldError("Both \"name\" and \"version\" are required", this._srcPath);

  return {
    name: pkg.name,
    semver: "^" + pkg.version,
    type: info.type
  };
};

proto._getPrivateLocal = function(info) {
  if (this._options.getPrivateLocal)
    return this._options.getPrivateLocal.call(this, info);

  var pkg = info.package;

  if (!pkg.name)
    throw this.getFieldError("\"name\" is required", this._srcPath);

  return {
    name: pkg.name,
    semver: "file:" + this.getDesRelPath(info.path),
    type: info.type
  };
};

proto._resolveLocalPath = function(basePath, path) {
  if (this._options.resolveLocalPath)
    return this._options.resolveLocalPath.call(this, basePath, path);
  return npath.resolve(basePath, path);
};

module.exports = LinkDepsContext;
