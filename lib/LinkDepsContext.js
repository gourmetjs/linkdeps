"use strict";

var fs = require("fs");
var npath = require("path");
var nutil = require("util");
var semver = require("semver");

var TYPE_TO_SECTION = {
  dep: "dependencies",
  dev: "devDependencies"
};

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

function _slashPath(path) {
  return path.replace(/\\/g, "/");
}

function LinkDepsContext(options) {
  this._options = options;
  this._srcPath = npath.resolve(process.cwd(), options.srcPath);
  this._outDeps = {};

  if (options.srcPackgage)
    this._srcPackage = options.srcPackage;
  else
    this._srcPackage = _readPackage(this._srcPath);
}

var proto = LinkDepsContext.prototype;

proto.update = function(mode, check) {
  this.addOwnRegularDeps();

  switch (mode) {
    case "devel":
      this.addRegularDepsOfAllLocals();
      break;
    case "deploy": 
      this.addAllLocalsAsFolderPath();
      break;
    case "deploy-mix": 
      this.addPublicLocals();
      this.addAllLocalsAsFolderPath(true);
      break;
    case "publish":
      this.addPublicLocals(true);
      break;
    default:
      throw Error("Unknown mode: " + mode);
  }

  if (!check)
    this.saveResult();

  return this.getResult();
};

// Adds own regular dependencies from `linkdeps.own`.
// Note that `[dev]dependencies` of root package is auto-generated and overwritten.
// You should use `linkdeps.own` to specify own dependencies instead.
proto.addOwnRegularDeps = function() {
  var tree = this._buildTree();
  this._addRegularDeps(tree);
};

// Recursively adds regular dependencies of local packages
proto.addRegularDepsOfAllLocals = function() {
  this.forEachLocal(function(local) {
    this._addRegularDeps(local);
  });
};

// Recursively adds all local packages from `linkdeps.local` with `file:`
// prefix so they can be copied from local folders when installed.
// Note that regular dependencies of locals are handled by NPM automatically.
proto.addAllLocalsAsFolderPath = function(privateOnly) {
  this.forEachLocal(function(local, ref) {
    var path = this._getLocalFolderPath(local);
    this._addDep(local.name, path, local.type, ref);
  }, privateOnly);
};


// Adds public local packages (local packages without "private" set to true)
// from root package's `linkdeps.local` so they can be pulled from public
// NPM registry. The semver is set to "^version".
// Note that regular dependencies of locals are handled by NPM automatically.
proto.addPublicLocals = function(rejectPrivate) {
  var self = this;
  var tree = this._buildTree();
  tree.locals.forEach(function(local) {
    if (local.pkg.private) {
      if (rejectPrivate)
        throw self.getFieldError(nutil.format("You cannot use private package: '%s'", local.name), tree.path);
      return;
    }
    var semver = self._getLocalSemVer(local);
    self._addDep(local.name, semver, local.type, tree);
  });
};

proto.linkLocals = function() {
  return Promise.resolve();
};

proto.getOutDeps = function() {
  return this._outDeps;
};

proto.getResult = function() {
  var self = this;
  var names = Object.keys(this._outDeps).sort();
  var res = {};

  names.forEach(function(name) {
    var info = self._outDeps[name];
    var section = TYPE_TO_SECTION[info.type];
    if (!res[section])
      res[section] = {};
    res[section][name] = info.semver;
  });

  return res;
};

proto.getDiff = function(oldDeps, newDeps) {
  var diff = [];
  var name, info, semver, action;

  for (name in newDeps) {
    info = this._outDeps[name];
    semver = newDeps[name];

    if (!oldDeps[name])
      action = "+";
    else if (oldDeps[name] === semver)
      action = " ";
    else
      action = "C";

    diff.push({
      name: name,
      semver: semver,
      oldVer: action === "C" ? oldDeps[name] : null,
      action: action,
      refs: info.refs
    });
  }

  for (name in oldDeps) {
    if (!newDeps[name]) {
      semver = oldDeps[name];
      diff.push({
        name: name,
        semver: semver,
        action: "-",
        refs: []
      });
    }
  }

  return diff;
};

proto.saveResult = function(/*path*/) {

};

proto.getSrcRelPath = function(path) {
  path = npath.relative(this._srcPath, path);
  return _slashPath(path);
};

proto.getDesRelPath = function(path) {
  path = npath.relative(this._options.desPath || this._srcPath, path);
  return _slashPath(path);
};

proto.getRefPath = function(path) {
  path = this.getSrcRelPath(path);
  if (!path)
    path = "~";
  return path;
};

proto.getFieldError = function(mesg, path) {
  mesg = mesg + "\n  at " + npath.join(path, "package.json");
  return new Error(mesg);
};

proto.forEachLocal = function(callback, privateOnly) {
  this._buildTree();
  this._traverseTree(callback, this._tree, privateOnly);
};

proto._traverseTree = function(callback, ref, privateOnly) {
  var self = this;
  ref.locals.forEach(function(local) {
    if (privateOnly && !local.pkg.private)
      return;
    self._traverseTree(callback, local, false);
    callback.call(self, local, ref);
  });
};

proto.stringifyRef = function(name, ref, itemizer, delim) {
  if (!itemizer) {
    itemizer = function(r) {
      function _semver() {
        var deps = r.deps;
        for (var idx = 0, len = deps.length; idx < len; idx++) {
          var dep = deps[idx];
          if (dep.name === name)
            return dep.semver;
        }
      }

      var output = [];

      if (r.name)
        output.push(r.name + "@");

      output.push(this.getRefPath(r.path));

      var semver = _semver();
      if (semver)
        output.push(":" + semver);

      return output.join("");
    };
  }

  if (nutil.isArray(ref)) {
    return ref.map(itemizer.bind(this)).join(delim || ", ");
  } else {
    return itemizer.call(this, ref);
  }
};

proto.stringifyDiff = function() {
  function _diff(section) {
    var diff = self.getDiff(self._srcPackage[section] || {}, res[section] || {});

    if (diff && diff.length) {
      output.push(nutil.format("<%s>", section));
      diff.forEach(function(item) {
        var refs = self.stringifyRef(item.name, item.refs);
        if (refs)
          refs = "(" + refs + ")";
        var ver = item.oldVer ? nutil.format("%s => %s", item.oldVer, item.semver) : item.semver;
        output.push(nutil.format("%s %s: %s %s", item.action, item.name, ver, refs));
      });
    }
  }

  var self = this;
  var res = this.getResult();
  var output = [];

  _diff("dependencies");
  _diff("devDependencies");

  return output.join("\n");
};

proto._addDep = function(name, semver, type, ref) {
  if (this._outDeps[name]) {
    var item = this._outDeps[name];
    var mergedVer = this._mergeSemVer(item.semver, semver);

    if (!mergedVer) {
      throw Error(nutil.format(
        "Dependency '%s' version conflict:\n" +
        "  1: \"%s\": (%s)\n" +
        "  2: \"%s\": (%s)",
        name, item.semver, this.stringifyRef(name, item.refs), semver, this.stringifyRef(name, ref)
      ));
    }

    var mergedType = item.type;
    if (type === "dep" && item.type !== "dep")
      mergedType = type;

    item.semver = mergedVer;
    item.type = mergedType;
    item.refs.push(ref);
  } else {
    this._outDeps[name] = {
      name: name,
      semver: semver,
      type: type,
      refs: [ref]
    };
  }
};

proto._addRegularDeps = function(ref) {
  var self = this;
  ref.deps.forEach(function(dep) {
    self._addDep(dep.name, dep.semver, dep.type, ref);
  });
};

proto._buildTree = function() {
  if (!this._tree) {
    this._tree = this._buildNode(this._srcPackage, this._srcPath, null);
    this._tree.isRoot = true;
  }
  return this._tree;
};

proto._buildNode = function(pkg, path, type) {
  function _addLocal(list, type) {
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

        locals.push(self._buildNode(pkg, subpath, type));
      }
    }
  }

  function _addRegular(list, type) {
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

  var self = this;
  var deps = [];
  var locals = [];
  var typeOverride = type === "dev" ? "dev" : "dep";

  var obj = pkg.linkdeps && pkg.linkdeps.local;
  if (obj) {
    _addLocal(obj.dependencies, typeOverride);
    _addLocal(obj.devDependencies, "dev");
  }

  obj = (pkg.linkdeps && pkg.linkdeps.own);
  if (!obj && type)  // Root packages' [dev]dependencies should be ignored
    obj = pkg;
  if (obj) {
    _addRegular(obj.dependencies, typeOverride);
    _addRegular(obj.devDependencies, "dev");
  }

  return {
    name: pkg.name,
    path: path,
    type: type,
    pkg: pkg,
    deps: deps,
    locals: locals
  };
};

proto._mergeSemVer = function(v1, v2) {
  if (this._options.mergeSemVer)
    return this._options.mergeSemVer.call(this, v1, v2);

  if (v1 === v2)
    return v1;

  if (v1 === "*") {
    return v2;
  } else if (v2 === "*") {
    return v1;
  } else if (v1[0] === "^" && v2[0] === "^") {
    if (_satisfies(v1.substr(1), v2))
      return v1;
    else if (_satisfies(v2.substr(1), v1))
      return v2;
  } else if (v1[0] === "^") {
    if (_satisfies(v2, v1))
      return v2;
  } else if (v2[0] === "^") {
    if (_satisfies(v1, v2))
      return v1;
  }
};

proto._resolveLocalPath = function(basePath, path) {
  if (this._options.resolveLocalPath)
    return this._options.resolveLocalPath.call(this, basePath, path);
  return npath.resolve(basePath, path);
};

proto._getLocalSemVer = function(local) {
  if (this._options.getLocalSemVer)
    return this._options.getLocalSemVer.call(this, local);
  return "^" + local.pkg.version;
};

proto._getLocalFolderPath = function(local) {
  if (this._options.getLocalFolderPath)
    return this._options.getLocalFolderPath.call(this, local);
  return "file:" + this.getDesRelPath(local.path);
};

module.exports = LinkDepsContext;
