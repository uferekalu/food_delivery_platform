require('dotenv/config');

/** @type {import('migrate-mongo').config.Config} */
module.exports = {
  mongodb: {
    url: process.env.MONGODB_URI,
    options: {},
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
