"use strict";

var fs = require("fs");
var npath = require("path");
var nutil = require("util");
var semver = require("semver");
var clone = require("lodash.clone");
var mkdirp = require("mkdirp");
var forEach = require("promise-box/lib/forEach");
var wrap = require("promise-box/lib/wrap");
var runAsMain = require("promise-box/lib/runAsMain");
var createLink = require("./createLink");
var renderTemplate = require("./renderTemplate");

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

function _readPackage(path, refPath) {
  try {
    return require(npath.join(path, "package.json"));
  } catch (err) {
    if (refPath) {
      var newErr = new Error("Error in processing " + npath.join(refPath, "package.json") + "\n" + err.message);
      newErr.orgError = err;
      throw newErr;
    } else {
      throw err;
    }
  }
}

function _slashPath(path) {
  return path.replace(/\\/g, "/");
}

function LinkDeps(options) {
  this.options = options;

  this.srcPath = npath.resolve(process.cwd(), options.srcPath || ".");
  this.desPath = options.desPath ? npath.resolve(process.cwd(), options.desPath) : this.srcPath;
  this.pkg = options.pkg || _readPackage(this.srcPath);

  this._outDeps = {};
}

var proto = LinkDeps.prototype;

proto.run = function() {
  var self = this;
  var options = this.options;
  return wrap(function() {
    if (options.mode !== "link") {
      self.update(options.mode);

      if (!options.check)
        self.saveResult();
    }

    if (options.mode === "devel") {
      console.log(self.stringifyDiff());
      console.log(self.stringifyLocals());
    }

    if ((options.mode === "devel" || options.mode === "link") && !options.check)
      return self.linkLocals();
  });
};

proto.update = function(mode) {
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
    case "link":
      break;
    default:
      throw Error("Unknown mode: " + mode);
  }

  return this.getResult();
};

// Adds own regular dependencies from `linkdeps.own`.
// Note that `[dev]dependencies` of root package is auto-generated and overwritten.
// You should use `linkdeps.own` to specify own dependencies instead.
proto.addOwnRegularDeps = function() {
  var tree = this._buildTree();
  this._addRegularDeps(tree);
};

// Recursively adds regular dependencies of all local packages.
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
    var path = this.getLocalFolderPath(local);
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
    var semver = self.getLocalSemVer(local);
    self._addDep(local.name, semver, local.type, tree);
  });
};

proto.linkLocals = function() {
  function _link(local) {
    function _parseBin() {
      var pkg = local.pkg;
      if (typeof pkg.bin === "string") {
        return [{
          name: local.name,
          bin: pkg.bin
        }];
      } else if (typeof pkg.bin === "object") {
        var bins = [];
        for (var binName in pkg.bin) {
          bins.push({
            name: binName,
            bin: pkg.bin[binName]
          });
        }
        return bins;
      }
    }

    function _createLink() {
      var symlink = npath.resolve(moduleDir, local.name);
      return createLink(symlink, local.path);
    }

    function _createBins() {
      if (bins) {
        var binDir = npath.join(moduleDir, ".bin");

        return Promise.all(bins.map(function(item) {
          var symlink = npath.join(binDir, item.name);
          var target = npath.join(local.path, item.bin);

          if (process.platform === "win32") {
            var srcBase = npath.join(__dirname, "../template/bin_exec");
            var rel = npath.relative(binDir, target);
            renderTemplate(
              srcBase + ".sh",
              symlink,
              {bin: rel.replace(/\\/g, "/")}
            );
            renderTemplate(
              srcBase + ".cmd",
              symlink + ".cmd",
              {bin: rel}
            );
          } else {
            return createLink(symlink, target).then(function(created) {
              if (created)
                fs.chmodSync(target, "755");
            });
          }
        }));
      }
    }

    var moduleDir = npath.resolve(self.desPath, "node_modules");
    var bins = _parseBin();

    return Promise.all([
      _createLink(),
      _createBins()
    ]);
  }

  var self = this;
  var locals = this.getLocals();
  return forEach(locals, _link);
};

proto.getLocals = function() {
  var names = {};
  var locals = [];
  this.forEachLocal(function(local) {
    if (local.name && local.pkg.version && !names[local.name]) {
      names[local.name] = true;
      locals.push(local);
    }
  });
  return locals;
};

proto.stringifyLocals = function() {
  var self = this;
  var locals = this.getLocals();
  var output = ["<locals>"];
  locals.forEach(function(local) {
    output.push(nutil.format("  %s: %s", local.name, self.getSrcRelPath(local.path)));
  });
  return output.join("\n");
};

proto.getOutDeps = function() {
  return this._outDeps;
};

proto.getResult = function() {
  if (!this._result) {
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

    this._result = res;
  }
  return this._result;
};

proto.getDiff = function() {
  var oldPkg = this.pkg;
  var newPkg = this.getResult();
  var diff = {};
  var items;

  items = this._getDiff(oldPkg.dependencies, newPkg.dependencies);
  if (items)
    diff.dependencies = items;

  items = this._getDiff(oldPkg.devDependencies, newPkg.devDependencies);
  if (items)
    diff.devDependencies = items;

  return diff;
};

proto.mergeResult = function(basePkg) {
  var res = this.getResult();
  var pkg = clone(basePkg || this.pkg);

  pkg.dependencies = res.dependencies;
  pkg.devDependencies = res.devDependencies;

  return pkg;
};

proto.writePkg = function(pkg, space) {
  var content = JSON.stringify(pkg, null, space === undefined ? 2 : space);
  mkdirp.sync(this.desPath);
  fs.writeFileSync(npath.join(this.desPath, "package.json"), content, "utf8");
};

proto.saveResult = function(basePkg, space) {
  var pkg = this.mergeResult(basePkg);
  this.writePkg(pkg, space);
};

proto.getSrcRelPath = function(path) {
  path = npath.relative(this.srcPath, path);
  return _slashPath(path);
};

proto.getDesRelPath = function(path) {
  path = npath.relative(this.desPath, path);
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
    var items = diff[section];
    if (items && items.length) {
      output.push(nutil.format("<%s>", section));
      items.forEach(function(item) {
        var refs = "";
        if (self.options.refs) {
          refs = self.stringifyRef(item.name, item.refs);
          if (refs)
            refs = " (" + refs + ")";
        }
        var ver = item.oldVer ? nutil.format("%s => %s", item.oldVer, item.semver) : item.semver;
        output.push(nutil.format("%s %s: %s%s", item.action, item.name, ver, refs));
      });
    }
  }

  var self = this;
  var diff = this.getDiff();
  var output = [];

  _diff("dependencies");
  _diff("devDependencies");

  return output.join("\n");
};

proto.mergeSemVer = function(v1, v2) {
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

proto.resolveLocalPath = function(basePath, path) {
  return npath.resolve(basePath, path);
};

proto.getLocalSemVer = function(local) {
  return "^" + local.pkg.version;
};

proto.getLocalFolderPath = function(local) {
  return "file:" + this.getDesRelPath(local.path);
};

proto._addDep = function(name, semver, type, ref) {
  if (this._outDeps[name]) {
    var item = this._outDeps[name];
    var mergedVer = this.mergeSemVer(item.semver, semver);

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
    this._tree = this._buildNode(this.pkg, this.srcPath, null);
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
          throw self.getFieldError(nutil.format(
            "You cannot specify a version other than \"*\" in local dependencies:\n" +
            "  \"%s\": \"%s\"", name, semver
          ), path);
        }

        var subpath = self.resolveLocalPath(path, name);
        var pkg = _readPackage(subpath, path);

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

proto._traverseTree = function(callback, ref, privateOnly) {
  var self = this;
  ref.locals.forEach(function(local) {
    if (privateOnly && !local.pkg.private)
      return;
    self._traverseTree(callback, local, false);
    callback.call(self, local, ref);
  });
};

proto._getDiff = function(oldDeps, newDeps) {
  var diff = [];
  var name, info, semver, action;

  oldDeps = oldDeps || {};
  newDeps = newDeps || {};

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

LinkDeps.run = function(options) {
  return new LinkDeps(options).run();
};

LinkDeps.runAsMain = function(options) {
  return runAsMain(LinkDeps.run(options));
};

module.exports = LinkDeps;
