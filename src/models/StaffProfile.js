const { Model, DataTypes } = require('sequelize');

class StaffProfile extends Model {}

module.exports = (sequelize) => {
  StaffProfile.init(
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
      department: { type: DataTypes.STRING(120), allowNull: true },
      internal_notes: { type: DataTypes.TEXT, allowNull: true },
      employee_code: { type: DataTypes.STRING(64), allowNull: true },
    },
    {
      sequelize,
      modelName: 'StaffProfile',
      tableName: 'staff_profiles',
      paranoid: true,
      indexes: [
        {
          unique: true,
          name: 'staff_profiles_user_deleted_at_null_uidx',
          fields: ['user_id'],
          where: { deleted_at: null },
        },
      ],
    }
  );

  return StaffProfile;
};
