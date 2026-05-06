const { Model, DataTypes } = require('sequelize');

const SESSION_STATUSES = [
  'SCHEDULED',
  'WAITING_PAYMENT',
  'READY',
  'ACTIVE',
  'ENDED',
  'CANCELLED',
  'NO_SHOW_CLIENT',
  'NO_SHOW_SPECIALIST',
];

const SESSION_MODALITIES = ['TEXTO', 'VOZ', 'VIDEO'];

const SESSION_END_REASONS = [
  'UNKNOWN',
  'NORMAL_COMPLETION',
  'CLIENT_DISCONNECT',
  'SPECIALIST_DISCONNECT',
  'TIMEOUT',
  'BALANCE_ZERO',
  'HARD_CUT_BALANCE_ZERO',
  'PAYMENT_OR_RESERVATION_EXPIRED',
  'CANCELLED_BY_CLIENT',
  'CANCELLED_BY_SPECIALIST',
  'CANCELLED_BY_ADMIN',
  'PLATFORM_ERROR',
  'THIRD_PARTY_SDK_ERROR',
];

class Session extends Model {}

module.exports = (sequelize) => {
  Session.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      queue_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      client_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      specialist_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      modality: {
        type: DataTypes.ENUM(...SESSION_MODALITIES),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(...SESSION_STATUSES),
        allowNull: false,
        defaultValue: 'SCHEDULED',
      },
      started_at: { type: DataTypes.DATE, allowNull: true },
      ended_at: { type: DataTypes.DATE, allowNull: true },
      cron_config_free_intro_minutes: {
        type: DataTypes.DECIMAL(6, 4),
        allowNull: true,
        defaultValue: 2,
        comment: 'Janelas free “2+X+2”: minutos gratuitos antes (configurável)',
      },
      cron_config_free_wrap_minutes: {
        type: DataTypes.DECIMAL(6, 4),
        allowNull: true,
        defaultValue: 2,
        comment: 'Minutos gratuitos após cortesia final',
      },
      free_minutes_used: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0,
      },
      paid_minutes_used: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0,
      },
      minute_price_applied_snapshot: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        comment: 'Valor/min aplicado quando a sessão foi tarifada — blindado contra migrações futuras',
      },
      specialist_commission_pct_snapshot: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        comment:
          'Percentual líquido acordado com a especialista no instante da tarifação (% representado decimalmente, ex 25.2500)',
      },
      pricing_level_id_snapshot: { type: DataTypes.UUID, allowNull: true },
      manual_price_override_snapshot: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      total_cost: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0,
      },
      platform_fee_amount_snapshot: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
      },
      specialist_commission_amount_snapshot: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
      },
      magic_link_token: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      magic_link_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      post_session_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      chatwoot_conversation_id: { type: DataTypes.STRING(64), allowNull: true },
      intelbras_call_id: { type: DataTypes.STRING(128), allowNull: true },
      agora_channel_id: { type: DataTypes.STRING(128), allowNull: true },
      agora_rtc_token_cipher: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Preferir TTL curto ou gerar JIT — armazenar só se estritamente necessário',
      },
      client_entered_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IPv4/IPv6 no momento do join',
      },
      specialist_entered_ip: { type: DataTypes.STRING(45), allowNull: true },
      recording_consent_flag: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      ended_reason_code: {
        type: DataTypes.ENUM(...SESSION_END_REASONS),
        allowNull: true,
        comment:
          'Determina causa exata para auditoria (“hard cut por saldo” vs cliente saindo, etc.).',
      },
      billing_closed_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Session',
      tableName: 'sessions',
      paranoid: true,
      indexes: [
        {
          unique: true,
          name: 'sessions_magic_token_deleted_null_uidx',
          fields: ['magic_link_token'],
          where: sequelize.literal('"deleted_at" IS NULL AND "magic_link_token" IS NOT NULL'),
        },
        { fields: ['client_id'] },
        { fields: ['specialist_id'] },
        { fields: ['status'] },
        { fields: ['queue_id'] },
        { fields: ['started_at'] },
      ],
    }
  );

  Session.SESSION_STATUSES = SESSION_STATUSES;
  Session.SESSION_MODALITIES = SESSION_MODALITIES;
  Session.SESSION_END_REASONS = SESSION_END_REASONS;
  return Session;
};
