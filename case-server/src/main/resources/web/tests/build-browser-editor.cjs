const path = require('path');
const root = path.resolve(__dirname, '../../../../../..');
const deps = path.join(root, '项目依赖/YunTu-Web/node_modules');
const webpack = require(path.join(deps, 'webpack'));
const resolve = name => require.resolve(name, { paths: [deps] });
webpack({
  mode: 'production',
  entry: path.join(__dirname, 'browser-editor-entry.js'),
  output: { path: path.join(root, '运行日志/脑图性能/editor-build'), filename: 'editor.js' },
  resolve: { modules: [deps, 'node_modules'] },
  resolveLoader: { modules: [deps] },
  optimization: { minimize: false },
  module: { rules: [
    { test: /\.jsx?$/, exclude: /node_modules/, use: { loader: 'babel-loader', options: {
      babelrc: false,
      presets: [resolve('@babel/preset-env'), resolve('@babel/preset-react')],
      plugins: [resolve('@babel/plugin-proposal-class-properties'), resolve('@babel/plugin-proposal-optional-chaining')],
    } } },
    { test: /\.s?css$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
    { test: /\.(png|svg|woff2?|ttf|eot|jpg|gif)$/, use: 'url-loader' },
  ] },
  plugins: [new webpack.NormalModuleReplacementPlugin(/assets[\\/]socketio[\\/]socket\.io\.js$/, path.join(__dirname, 'browser-socket-fixture.js'))],
}, (error, stats) => {
  if (error) { console.error(error.message); process.exitCode = 1; return; }
  console.log(stats.toString({ all: false, errors: true, warnings: true, timings: true }));
  if (stats.hasErrors()) process.exitCode = 1;
});
