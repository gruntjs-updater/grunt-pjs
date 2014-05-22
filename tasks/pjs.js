var async = require('async');
var sourceMap = require('source-map');
var chproc = require('child_process');
var chalk = require('chalk');
var pth = require('path');

var SourceMapGenerator = sourceMap.SourceMapGenerator;

function relativePath(from, to) {
  var fromDir = pth.dirname(from);
  var toDir = pth.dirname(to);
  var res = pth.basename(to);
  if (fromDir !== toDir)
    res = pth.relative(fromDir, toDir) + pth.sep + res;
  return res;
};

function arrayToObject(arr) {
  var obj = {};
  for (var i = 0; i < arr.length; i++)
    if (arr[i])
      obj[arr[i]] = true;
  return obj;
}

var kKeywords = arrayToObject('break case catch continue debugger default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with'.split(' '));
var kMappingInfoPattern = /\{P:([^;]+);F:[^;]+;L:(\d+);C:(\d+)[^{}]+\}/g;
var kIndentPattern = /^[^{]*/;
var kSymbolPattern = /^[$_a-z][$\w]*/i;

function extractSourceMap(source, map, destFilePath, mapFilePath) {

  var sourcePathCache = {};
  var lines = [];

  source.split('\n').forEach(function(rawLine) {

    var line = kIndentPattern.exec(rawLine)[0];
    var mappings = [];

    kMappingInfoPattern.lastIndex = line.length;

    for (var match; match = kMappingInfoPattern.exec(rawLine); ) {
      mappings.push({
        startPos: match.index,
        endPos: match.index + match[0].length,
        info: {
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10) - 1
        }
      });
    }

    if (mappings.length == 0) {
      lines.push(rawLine);
      return;
    }

    mappings.push({
      startPos: rawLine.length
    });

    for (var i = 0; i < mappings.length - 1; i++) {

      var token = rawLine.substring(mappings[i].endPos, mappings[i + 1].startPos);
      var mappingInfo = mappings[i].info;

      var symbol = kSymbolPattern.exec(token);
      if (symbol) {
        symbol = symbol[0];
        if (kKeywords[symbol]) {
          symbol = null;
        }
      }

      map.addMapping({
        generated: {
          line: lines.length + 1,
          column: line.length
        },
        source: sourcePath(mappingInfo.file),
        original: mappingInfo,
        name: symbol
      });

      line += token;

    }

    lines.push(line);

  });

  lines.push('//# sourceMappingURL=' + relativePath(destFilePath, mapFilePath));

  return lines.join('\n');

  function sourcePath(to) {
    if (!sourcePathCache[to])
      sourcePathCache[to] = relativePath(mapFilePath, to);
    return sourcePathCache[to];
  }

}

module.exports = function(grunt) {

grunt.registerMultiTask('pjs', 'Compile preprocess js to plain js.', function() {

  var options = this.options({
    cppVersion: 4.8,
    basePath: null,
    includePaths: [],
    includeFiles: [],
    definations: [],
    sourceMap: false,
    sourceRoot: null,
    args: null
  });

  var binName = 'cpp';
  if (options.cppVersion)
    binName += '-' + options.cppVersion;

  var baseArgs = [
    '-P',
    '-C',
    '-w',
    '-undef'
  ];

  if (options.sourceMap)
    baseArgs.push('-fdebug-cpp', '-E');

  options.includePaths.forEach(function(path) {
    baseArgs.push('-I', path);
  });

  options.includeFiles.forEach(function(path) {
    baseArgs.push('-include', path);
  });

  options.definations.forEach(function(def) {
    if (typeof def == 'object') {
      baseArgs.push('-D', def.name + '=' + def.value);
    } else {
      baseArgs.push('-D', def);
    }
  });

  if (options.args)
    baseArgs.push.apply(baseArgs, options.args);

  var done = this.async();

  async.each(this.files, function(file, callback) {

    var srcFiles = file.src;
    var basePath = options.basePath;
    if (basePath)
      srcFiles = srcFiles.map(function(path) {
        return pth.relative(basePath, path);
      });

    var args = baseArgs.concat(srcFiles);
    var proc = chproc.spawn(binName, args, {
      cwd: basePath
    });

    var out = [];
    var err = [];
    proc.stdout.on('data', function(data) {
      out.push(data);
    });
    proc.stderr.on('data', function(data) {
      err.push(data);
    });

    proc.on('close', function(code) {
      err = Buffer.concat(err).toString('utf8');
      if (code)
        return callback(new Error(err));
      if (err)
        grunt.warn(err);

      out = Buffer.concat(out).toString('utf8');

      if (options.sourceMap) {
        var mapFilePath = file.dest + '.map';
        var map = new SourceMapGenerator({
          file: relativePath(mapFilePath, file.dest),
          sourceRoot: options.sourceRoot
        });
        out = extractSourceMap(out, map, file.dest, mapFilePath);
        grunt.file.write(file.dest, out);
        grunt.file.write(mapFilePath, map.toString());
        grunt.log.writeln('File ' + chalk.cyan(mapFilePath) + ' created (source map).');
      } else {
        grunt.file.write(file.dest, out);
      }
      grunt.log.writeln('File ' + chalk.cyan(file.dest) + ' created.');
      callback();
    });

  }, done);

});

};
