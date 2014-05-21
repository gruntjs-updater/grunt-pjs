var async = require('async');
var sourceMap = require('source-map');
var chproc = require('child_process');
var chalk = require('chalk');
var pth = require('path');

var SourceMapGenerator = sourceMap.SourceMapGenerator;

var kEmptyLinePattern = /^\s*$/;
var kLineMarkerPattern = /^# (\d+) "(.+)"([\d\s]*)$/;
var kLexPattern = /(['"])|\/([\/*])|(\*\/)|([$a-z_][$\w]*)|(\.?\d[x\da-f\+\-]*)|\{/ig;
var kInvalidQuotePattern = /^[^\/]?\/$/;

var kKeywords = arrayToObject('break case catch continue debugger default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with'.split(' '));

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

function extractSourceMap(source, map, destFilePath, mapFilePath) {

  var lines = [];
  var sourceStack = [];
  var currentSource = null;
  var inComment = false;
  var inQuote = false;

  source.split(/\n/).forEach(function(line) {

    var match = kLineMarkerPattern.exec(line);
    if (match) {
      var linenum = parseInt(match[1], 10);
      var filename = match[2];
      var flags = arrayToObject(match[3].split(/\s+/));
      if (flags[1]) {
        sourceStack.push(currentSource = {
          filename: filename
        });
      } else if (flags[2]) {
        sourceStack.pop();
        currentSource = sourceStack[sourceStack.length - 1];
      }
      if (currentSource) {
        // console.assert(currentSource.filename == filename);
        // console.assert(currentSource.linenum == linenum, lines.length, currentSource, linenum);
        currentSource.linenum = linenum;
      }
      return;
    }

    if (!kEmptyLinePattern.test(line)) {

      lines.push(line);

      // Sadly learned that even the generated line is identical to the source,
      // source map requires a mapping before each symbol, so this is a simple
      // parser to find out all necessary tokens.
      // Note: Expect errors! This parser is not fully context aware. Eg.
      //   keyword as object key will not be outputted, etc.
      for (kLexPattern.lastIndex = 0; match = kLexPattern.exec(line); ) {
        if (inComment) {
          if (match[3])
            inComment = false;
          continue;
        }
        if (inQuote) {
          if (match[1] == inQuote &&
              !kInvalidQuotePattern.test(line.substring(match.index - 2, match.index)))
            inQuote = false;
          continue;
        }
        // Not in a string nor a comment
        // Check if starts a string
        if (match[1]) {
          if (!kInvalidQuotePattern.test(line.substring(match.index - 2, match.index)))
            inQuote = match[1];
        // Check if starts a comment
        } else if (match[2]) {
          if (match[2] == '\/')
            break;
          inComment = true;
          continue;
        }
        var name = null;
        if (match[4]) {
          name = match[4];
          if (kKeywords[name])
            name = null;
        }
        if (name !== false) {
          map.addMapping({
            generated: {
              line: lines.length,
              column: match.index
            },
            source: relativePath(mapFilePath, currentSource.filename),
            original: {
              line: currentSource.linenum,
              column: match.index
            },
            name: name
          });
        }
      }

    }

    if (currentSource)
      currentSource.linenum++;

  });

  lines.push('//# sourceMappingURL=' + relativePath(destFilePath, mapFilePath));

  return lines.join('\n');
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
    '-C',
    '-w',
    '-undef'
  ];

  if (!options.sourceMap)
    baseArgs.push('-P');

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
