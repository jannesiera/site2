const Rss = require('./lib/es6/src/GenRss.bs.js');

const mdx_ = require('@mdx-js/mdx');
const babel = require("@babel/core");
const fs = require('fs');
const path = require('path');
const ReactDOMServer = require('react-dom/server');
const React = require('react');
const mdxReact = require('@mdx-js/react');
const mdxRuntime = require('@mdx-js/runtime');

const HalfImageWrapper = function({children}) { return children; };
const _HalfImageWrapper = HalfImageWrapper;

const MultiCodeBlock = function({children}) { return children; };
const _MultiCodeBlock = MultiCodeBlock;

function requireFromStringSync(src, filename) {
  const Module = module.constructor;
  const m = new Module();
  m._compile(src, filename);
  // ================
  // THE HACKIEST THING THE IN WORLD
  // Concieved at 3am on a Friday
  //
  // There is probably a better way to do this, but I just wanted this to work.
  // ================
  //
  // Set some "globals" that we want to closure into m.exports.default
  const mdx = React.createElement;
  const MDXLayout = function(props) {
    return React.createElement("div", Object.assign({}, props, {
      style : {maxWidth : "38rem", padding : "1.5rem", margin : "auto"}
    }));
  };
  const _extends = Object.assign;
  const layoutProps = {};
  // redefine m.exports.default to close over these functions
  m.exports.default =
      eval("(function() { return " + m.exports.default.toString() + "})()");
  return m.exports;
}

function requireMDXSync(mdxSrc, filename) {
  let ast = null;
  const jsx = mdx_.sync(
      mdxSrc,
      {remarkPlugins : [function(){return function(tree){ast = tree}}]});
  const babelOptions = babel.loadOptions({
    babelrc : false,
    presets : [
      '@babel/preset-react',
    ],
    plugins : [
      "@babel/plugin-transform-modules-commonjs",
      [
        "module-resolver", {
          "alias" : {
            "@reason" : path.join(__dirname, 'lib', 'es6', 'src'),
          },
        }
      ]
    ]
  });
  const transformed = babel.transformSync(jsx, babelOptions);
  return [ requireFromStringSync(transformed.code, filename), ast ];
}

function requireMDXFileSync(path) {
  const mdxSrc = fs.readFileSync(path, {encoding : 'utf-8'});
  return requireMDXSync(mdxSrc, path);
}

function scanDir(dirPath, extension) {
  const mdxFiles = [];
  function scan(dirPath) {
    const filenames = fs.readdirSync(dirPath);
    filenames.sort();
    filenames.map(function(filename) {
      const filePath = path.join(dirPath, filename);
      const st = fs.statSync(filePath);
      if (st.isFile() && filePath.endsWith(extension)) {
        mdxFiles.push(filePath);
      }
      if (st.isDirectory()) {
        scan(filePath);
      }
    });
  };
  scan(dirPath);
  return mdxFiles;
}

function readPostMetadata(postPath) {
  const[mod, ast] = requireMDXFileSync(postPath);
  const content = ReactDOMServer.renderToString(
      React.createElement(mdxReact.MDXProvider, [], mod.default({
        components : {
          "HalfImageWrapper" : HalfImageWrapper,
          "MultiCodeBlock" : MultiCodeBlock
        }
      })));
  const {meta} = mod;
  const title = (meta && meta.title)
                    ? meta.title
                    : (ast.children
                           .filter(function(x){return x.type == 'heading' &&
                                                      x.depth == 1})[0]
                           .children[0]
                           .value);

  // pull description
  const description =
      (meta && meta.description)
          ? meta.description
          : (ast.children.filter(function(x){return x.type == 'paragraph'})[0]
                 .children[0]
                 .value);

  return {
    filePath: postPath,
    urlPath: postPath.replace(/\\/, '/').replace(/^pages/, '').replace(/\.mdx?$/, ''),
    title,
    date: (meta && new Date(meta.date)) || new Date(),
    content,
    description
  };
}

function main() {
  const postPaths = scanDir('pages/posts', '.mdx');
  console.debug({postPaths});
  const now = new Date();
  const posts = postPaths.map(readPostMetadata)
                    .filter(function(post){return post.date <= now});
  posts.sort(function(a, b){return b.date - a.date});
  console.debug({posts});
  const postsJSON = JSON.stringify(posts, null, 2);
  fs.mkdirSync('src/gen', {recursive : true});
  const exportPath = 'src/gen/PostsIndexContent.re';
  // TODO: Re-enable when we support blog index
  fs.writeFileSync(exportPath, '// automatically generated by gen-rss.js\n' +
    `let posts = ` + postsJSON + ';\n');
  const rssPath = 'public/static/blog-rss.xml';
  const rssXML = Rss.draw(posts);
  fs.writeFileSync(rssPath, rssXML);
  console.info(`Saved RSS feed to ` + rssPath);
}

main();
