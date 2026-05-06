const { Op, Sequelize } = require('sequelize');
const { Specialist, Oracle, SpecialistModality } = require('../../models');

const SORT_KEYS = ['ranking', 'status', 'name'];
const MODALITIES = SpecialistModality.MODALITIES;

function parsePagination(query) {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return { limit, offset };
}

function resolveSort(query) {
  const raw = `${query.sort || 'ranking'}`.trim().toLowerCase();
  const sort = SORT_KEYS.includes(raw) ? raw : 'ranking';
  const orderDir = `${query.order || 'desc'}`.trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { sort, orderDir };
}

function isUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    `${str || ''}`.trim()
  );
}

/**
 * Vitrine: filtros só aplicados quando o parâmetro existe.
 * Include `modalidades` e `oraculos_catalogo` (+ pivot) sempre para o front.
 */
async function listForVitrine(query = {}) {
  const trimmedName = query.name != null ? `${query.name}`.trim() : '';
  const trimmedOracle = query.oracle != null ? `${query.oracle}`.trim() : '';
  const rawModality = query.modality != null ? `${query.modality}`.trim().toUpperCase() : '';
  const modalityFilter = MODALITIES.includes(rawModality) ? rawModality : null;

  const { limit, offset } = parsePagination(query);
  const { sort, orderDir } = resolveSort(query);

  const where = { is_blocked: false };

  if (trimmedName) {
    const term = `%${trimmedName.toLowerCase()}%`;
    where[Op.and] = [
      ...(where[Op.and] || []),
      Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('Specialist.display_name')), {
        [Op.iLike]: term,
      }),
    ];
  }

  const oracleWhereClause =
    trimmedOracle != null &&
    trimmedOracle !== '' &&
    (() => {
      const lo = `${trimmedOracle}`.trim().toLowerCase();
      const parts = [
        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('oraculos_catalogo.slug')), {
          [Op.eq]: lo,
        }),
      ];
      if (isUuid(`${trimmedOracle}`.trim())) {
        parts.push({ id: `${trimmedOracle}`.trim() });
      }
      return { [Op.or]: parts };
    })();

  const includes = [
    {
      model: SpecialistModality,
      as: 'modalidades',
      required: Boolean(modalityFilter),
      ...(modalityFilter ? { where: { modality: modalityFilter } } : {}),
    },
    {
      model: Oracle,
      as: 'oraculos_catalogo',
      through: { attributes: ['years_using'] },
      required: Boolean(trimmedOracle),
      ...(oracleWhereClause ? { where: oracleWhereClause } : {}),
    },
  ];

  let orderClause;
  if (sort === 'name') {
    orderClause = [[Sequelize.fn('LOWER', Sequelize.col('Specialist.display_name')), orderDir]];
  } else if (sort === 'status') {
    orderClause = [
      [
        Sequelize.literal(`
          CASE "Specialist".status
            WHEN 'ONLINE' THEN 0
            WHEN 'EM_ATENDIMENTO' THEN 1
            WHEN 'AUSENTE' THEN 2
            ELSE 3 END
        `),
        orderDir,
      ],
      ['display_name', 'ASC'],
    ];
  } else {
    orderClause = [
      ['rating_average_cached', orderDir],
      ['reviews_count_cached', orderDir === 'DESC' ? 'DESC' : 'ASC'],
      ['sessions_completed_cached', orderDir === 'DESC' ? 'DESC' : 'ASC'],
    ];
  }

  const { count, rows } = await Specialist.findAndCountAll({
    where,
    include: includes,
    distinct: true,
    col: 'Specialist.id',
    limit,
    offset,
    order: orderClause,
    subQuery: false,
  });

  return {
    total: count,
    limit,
    offset,
    especialistas: rows.map((r) => r.get({ plain: true })),
  };
}

module.exports = {
  listForVitrine,
};
