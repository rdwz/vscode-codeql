import * as path from 'path';
import * as webpack from 'webpack';

//eslint-ignore-next-line
import MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

const APP_DIR = path.resolve(__dirname, '../src');
const MONACO_DIR = path.resolve(__dirname, '../node_modules/monaco-editor');

export const config: webpack.Configuration = {
  mode: 'development',
  entry: {
    resultsView: './src/view/results.tsx',
    compareView: './src/compare/view/Compare.tsx',
    remoteQueriesView: './src/remote-queries/view/RemoteQueries.tsx',
  },
  output: {
    path: path.resolve(__dirname, '..', 'out'),
    filename: '[name].js'
  },
  devtool: 'inline-source-map',
  resolve: {
    extensions: ['.js', '.ts', '.tsx', '.json', '.ttf'],
    fallback: {
      path: require.resolve('path-browserify')
    }
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        loader: 'ts-loader',
        options: {
          configFile: 'src/view/tsconfig.json',
        }
      },
      {
        test: /\.less$/,
        use: [
          {
            loader: 'style-loader'
          },
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              sourceMap: true
            }
          },
          {
            loader: 'less-loader',
            options: {
              javascriptEnabled: true,
              sourceMap: true
            }
          }
        ]
      },
      {
        test: /\.css$/,
        include: APP_DIR,
        use: [
          {
            loader: 'style-loader',
          },
          {
            loader: 'css-loader',
            options: {
              modules: true,
              namedExport: true,
            },
          }
        ],
      },
      {
        test: /\.css$/,
        include: MONACO_DIR,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.ttf$/,
        use: ['file-loader'],
      }
    ]
  },
  plugins: [
    new MonacoWebpackPlugin({
      languages: ['javascript']
    })
  ],
  performance: {
    hints: false
  }
};
