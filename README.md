# grunt-pjs

Preprocess JS build task for Grunt

## Getting Started

```shell
npm install grunt-pjs --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-pjs');
```

## The "pjs" task

### Overview
In your project's Gruntfile, add a section named `pjs` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  pjs: {
    // All defaults are shown below
    options: {
      // cpp version
      cppVersion: 4.8,
      // cpp cwd
      basePath: null,
      // include search paths
      includePaths: [],
      // include files
      includeFiles: [],
      // macro definations, string or { name, value }
      definations: [],
      // true to enable source map, will be named as file.dest + '.map'
      sourceMap: false,
      // source map's source root
      sourceRoot: null,
      // other args (in array) for cpp
      args: null
    },
    your_target: {
      // Target-specific file lists and/or options go here.
    }
  }
});
```

