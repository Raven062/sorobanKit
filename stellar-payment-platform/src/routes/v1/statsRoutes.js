'use strict';

const express = require('express');
const { prisma } = require('../../../prismaClient');
const { poolGet, etagCache } = require('../../db');
const { logger } = require('../../logger');
const { asyncHandler } = require('../../middleware/asyncHandler');
const { getCachedStats } = require('../../cache/statsCache');
const { fetchAdminStats } = require('../../services/statsService');

module.exports = (redisClient) => {
  const router = express.Router();

  
/**
 * @openapi
 * /stats:
 *   get:
 *     tags:
 *       - v1
 *     description: GET /stats
 *     responses:
 *       200:
 *         description: Success
 */
  router.get('/stats', etagCache, asyncHandler(async (req, res, next) => {
    try {
      const stats = await getCachedStats(redisClient, () => fetchAdminStats(prisma, poolGet));
      return res.status(200).json(stats);
    } catch (error) {
      logger.error(`[Correlation ID: ${req.correlationId}] Stats endpoint error`, error);
      const statsError = new Error('Failed to retrieve platform statistics', { cause: error });
      statsError.statusCode = 500;
      return next(statsError);
    }
  }));

  /**
   * @openapi
   * /admin/stats/routing:
   *   get:
   *     tags:
   *       - admin
   *     description: |
   *       Retrieve routing statistics. When `groupBy=week`, periods are
   *       truncated to week boundaries. By default weeks are ISO (Monday-based);
   *       pass `weekStart=sunday` for Sunday-based weeks.
   *     parameters:
   *       - in: query
   *         name: groupBy
   *         schema:
   *           type: string
   *           enum: [day, week, month]
   *         description: Period granularity for aggregation.
   *       - in: query
   *         name: weekStart
   *         schema:
   *           type: string
   *           enum: [monday, sunday]
   *           default: monday
   *         description: |
   *           Week start convention used when `groupBy=week`.
   *           `monday` (default) uses ISO Monday-based weeks;
   *           `sunday` uses Sunday-based weeks.
   *     responses:
   *       200:
   *         description: Success
   *       400:
   *         description: Invalid query parameter
   */
  router.get('/admin/stats/routing', asyncHandler(async (req, res, next) => {
    try {
      const { groupBy } = req.query;
      const weekStart = req.query.weekStart === undefined ? 'monday' : req.query.weekStart;

      if (weekStart !== 'monday' && weekStart !== 'sunday') {
        const validationError = new Error(
          "Invalid weekStart parameter: must be 'monday' or 'sunday'"
        );
        validationError.statusCode = 400;
        return next(validationError);
      }

      let periodExpression;
      if (groupBy === 'week') {
        periodExpression = weekStart === 'sunday'
          ? "DATE_TRUNC('week', created_at - INTERVAL '1 day') + INTERVAL '1 day'"
          : "DATE_TRUNC('week', created_at)";
      } else if (groupBy === 'month') {
        periodExpression = "DATE_TRUNC('month', created_at)";
      } else {
        periodExpression = "DATE_TRUNC('day', created_at)";
      }

      const rows = await poolGet(
        `SELECT ${periodExpression} AS period, COUNT(*) AS count
         FROM routing_events
         GROUP BY period
         ORDER BY period ASC`
      );

      return res.status(200).json({ groupBy: groupBy || 'day', weekStart, periods: rows });
    } catch (error) {
      logger.error(`[Correlation ID: ${req.correlationId}] Admin stats routing endpoint error`, error);
      const statsError = new Error('Failed to retrieve routing statistics', { cause: error });
      statsError.statusCode = 500;
      return next(statsError);
    }
  }));

  return router;
};