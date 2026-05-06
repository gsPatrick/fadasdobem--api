const path = require('path');
const { Sequelize } = require('sequelize');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const logging = process.env.DB_LOGGING === 'true' ? console.log : false;

const poolCommon = {
  dialect: 'postgres',
  logging,
  define: {
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  },
};

/** SSL opcional para DATABASE_URL em nuvem */
const dialectOptionsSsl =
  process.env.DB_SSL === 'true'
    ? {
        require: true,
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      }
    : undefined;

let sequelize;

if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    ...poolCommon,
    dialectOptions: dialectOptionsSsl ? { ssl: dialectOptionsSsl } : {},
  });
} else {
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    ...poolCommon,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
  });
}

module.exports = { sequelize };
