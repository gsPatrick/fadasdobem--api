const { Model, DataTypes } = require('sequelize');

class RefreshToken extends Model {}

/**
 * Sessões de refresh JWT persistidas para rotação e revogação (logout).
 * Não armazenamos o token em claro — apenas o `jti` presente no payload assinado.
 */
module.exports = (sequelize) => {
  RefreshToken.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      jti: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'RefreshToken',
      tableName: 'refresh_tokens',
      paranoid: false,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['expires_at'] },
        { unique: true, fields: ['jti'] },
      ],
    }
  );

  return RefreshToken;
};
