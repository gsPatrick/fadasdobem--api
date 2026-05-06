const { Model, DataTypes } = require('sequelize');

const STATUSES = ['ONLINE', 'EM_ATENDIMENTO', 'AUSENTE', 'OFFLINE'];
const PIX_TYPES = ['EMAIL', 'CPF', 'CNPJ', 'TELEFONE', 'EVP'];

class Specialist extends Model {}

module.exports = (sequelize) => {
  Specialist.init(
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
      display_name: { type: DataTypes.STRING(160), allowNull: true },
      bio: { type: DataTypes.TEXT, allowNull: true },
      avatar_url: { type: DataTypes.STRING(512), allowNull: true },
      cover_image_url: { type: DataTypes.STRING(512), allowNull: true },
      chave_pix: { type: DataTypes.STRING(256), allowNull: true },
      chave_pix_type: { type: DataTypes.ENUM(...PIX_TYPES), allowNull: true },
      titular_pix_nome: { type: DataTypes.STRING(160), allowNull: true },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'OFFLINE',
      },
      reserved_by_client_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Trava anti-corrida: cliente que reservou a especialista no checkout',
      },
      reserved_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Janela curta (~8min) para concluir pagamento/atribuição',
      },
      years_experience: { type: DataTypes.SMALLINT, allowNull: true },
      rating_average_cached: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: true,
        comment: 'Média 1-5 recalculada por job',
      },
      reviews_count_cached: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      sessions_completed_cached: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      vitrine_ordem: { type: DataTypes.INTEGER, allowNull: true },
      accepts_queue_any: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Aceita fila sem especialista pré-selecionada',
      },
      commission_percent_default: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Percentual padrão de comissão (sobrescrito por contrato/Nível gestor)',
      },
      agora_uid: { type: DataTypes.STRING(128), allowNull: true },
      intelbras_ramal: { type: DataTypes.STRING(32), allowNull: true },
      chatwoot_inbox_id: { type: DataTypes.STRING(64), allowNull: true },
      is_blocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      blocked_reason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Specialist',
      tableName: 'specialists',
      paranoid: true,
      indexes: [
        {
          unique: true,
          name: 'specialists_user_deleted_at_null_uidx',
          fields: ['user_id'],
          where: { deleted_at: null },
        },
        { fields: ['status'] },
        { fields: ['reserved_by_client_id'] },
      ],
    }
  );

  Specialist.STATUSES = STATUSES;
  Specialist.PIX_TYPES = PIX_TYPES;
  return Specialist;
};
