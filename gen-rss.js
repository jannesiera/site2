const Rss = require('./lib/es6/src/GenRss.bs.js');

const mdx = require('@mdx-js/mdx');
const babel = require("@babel/core");
const fs = require('fs');
const path = require('path');

function requireFromStringSync(src, filename) {
  const Module = module.constructor;
  const m = new Module();
  m._compile(src, filename);
  return m.exports;
}

function requireMDXSync(mdxSrc, filename) {
  const jsx = mdx.sync(mdxSrc);
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
  return requireFromStringSync(transformed.code, filename);
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
  const mod = requireMDXFileSync(postPath);
  const {meta} = mod;
  return {
    filePath: postPath,
    urlPath: postPath.replace(/\\/, '/').replace(/^pages/, '').replace(/\.mdx?$/, ''),
    title: (meta && meta.title) || path.basename(postPath),
    date: (meta && new Date(meta.date)) || new Date(),
  };
}

function generateRSS(posts) {
  const siteUrl = 'https://nextjs-mdx-blog-example.now.sh';
  const feed = Rss.draw({
    title : posts[0].title,
    date : posts[0].date,
    description : "Woo woo",
    slug : "foo"
  });
  return feed;
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
  const exportPath = 'posts.js';
  fs.writeFileSync(exportPath,
                   '// automatically generated by build_post_index.js\n' +
    `export default ` + postsJSON + ';\n');
  console.info(`Saved ${posts.length} posts in ` + exportPath);
  const rssPath = 'public/static/rss.xml';
  const rssXML = generateRSS(posts);
  fs.writeFileSync(rssPath, rssXML);
  console.info(`Saved RSS feed to ` + rssPath);
}

main();
