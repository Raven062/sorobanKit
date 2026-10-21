const { pool } = require('../db');

const GROUP_BY_FORMATS = {
  day: 'YYYY-MM-DD',
  week: 'IYYY-"W"IW',
  month: 'YYYY-MM',
};

const GROUP_BY_TRUNC = {
  day: 'day',
  week: 'week',
  month: 'month',
};

function buildDateRange(startDate, endDate) {
  const params = [];
  const conditions = [];

  if (startDate) {
    params.push(startDate);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`created_at <= $${params.length}`);
  }

  return { params, conditions };
}

async function getRoutingStats({ startDate, endDate, groupBy = 'day' } = {}) {
  const trunc = GROUP_BY_TRUNC[groupBy] || GROUP_BY_TRUNC.day;
  const format = GROUP_BY_FORMATS[groupBy] || GROUP_BY_FORMATS.day;

  const { params, conditions } = buildDateRange(startDate, endDate);
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      TO_CHAR(DATE_TRUNC('${trunc}', created_at), '${format}') AS bucket,
      COUNT(*)::int AS count
    FROM routing_events
    ${whereClause}
    GROUP BY DATE_TRUNC('${trunc}', created_at)
    ORDER BY DATE_TRUNC('${trunc}', created_at) ASC
  `;

  const { rows } = await pool.query(query, params);
  return rows;
}

module.exports = { getRoutingStats };
