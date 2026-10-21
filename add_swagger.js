#!/usr/bin/env node
/**
 * Generates an OpenAPI 3.1 specification for the Stellar Tags API and
 * publishes it to docs/openapi.json.
 *
 * Usage:
 *   node add_swagger.js            # write docs/openapi.json
 *   node add_swagger.js --check    # validate the generated spec, exit non-zero on error
 *
 * The spec is hand-authored below so it stays in sync with the documented
 * endpoints. Swagger UI is served by the backend at /api-docs (see
 * backend/src/app.js) using the same document.
 */

const fs = require('fs');
const path = require('path');

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Stellar Tags API',
    version: '1.0.0',
    description:
      'API for creating, discovering and managing Stellar address tags.',
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development' },
  ],
  tags: [
    { name: 'Tags', description: 'Stellar address tags' },
    { name: 'Search', description: 'Tag discovery and search' },
    { name: 'Stats', description: 'Platform statistics' },
    { name: 'Admin', description: 'Administrative endpoints' },
  ],
  paths: {
    '/api/tags': {
      get: {
        tags: ['Tags'],
        summary: 'List tags',
        operationId: 'listTags',
        parameters: [
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
          {
            name: 'address',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by Stellar address',
          },
        ],
        responses: {
          '200': {
            description: 'A paginated list of tags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Tag' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
      post: {
        tags: ['Tags'],
        summary: 'Create a tag',
        operationId: 'createTag',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TagInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Tag created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Tag' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/tags/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      get: {
        tags: ['Tags'],
        summary: 'Get a tag by id',
        operationId: 'getTag',
        responses: {
          '200': {
            description: 'The tag',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Tag' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Tags'],
        summary: 'Update a tag',
        operationId: 'updateTag',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TagInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated tag',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Tag' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Tags'],
        summary: 'Delete a tag',
        operationId: 'deleteTag',
        responses: {
          '204': { description: 'Tag deleted' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/search': {
      get: {
        tags: ['Search'],
        summary: 'Search tags',
        operationId: 'searchTags',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Search query',
          },
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
        ],
        responses: {
          '200': {
            description: 'Matching tags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Tag' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/stats': {
      get: {
        tags: ['Stats'],
        summary: 'Get platform statistics',
        operationId: 'getStats',
        responses: {
          '200': {
            description: 'Platform statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Stats' },
              },
            },
          },
        },
      },
    },
    '/api/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Get administrative statistics',
        operationId: 'getAdminStats',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Administrative statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Stats' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      Page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
    schemas: {
      Tag: {
        type: 'object',
        required: ['id', 'address', 'name'],
        properties: {
          id: { type: 'string' },
          address: { type: 'string', description: 'Stellar address' },
          name: { type: 'string' },
          description: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      TagInput: {
        type: 'object',
        required: ['address', 'name'],
        properties: {
          address: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      Stats: {
        type: 'object',
        properties: {
          totalTags: { type: 'integer' },
          totalAddresses: { type: 'integer' },
          totalUsers: { type: 'integer' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Invalid request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  },
};

function validate(doc) {
  const errors = [];
  if (doc.openapi !== '3.1.0') errors.push('openapi must be "3.1.0"');
  if (!doc.info || !doc.info.title || !doc.info.version) {
    errors.push('info.title and info.version are required');
  }
  if (!doc.paths || Object.keys(doc.paths).length === 0) {
    errors.push('at least one path is required');
  }
  for (const [p, item] of Object.entries(doc.paths || {})) {
    if (!p.startsWith('/')) errors.push(`path ${p} must start with /`);
    for (const method of Object.keys(item)) {
      if (method === 'parameters') continue;
      const op = item[method];
      if (!op.responses || Object.keys(op.responses).length === 0) {
        errors.push(`${method.toUpperCase()} ${p} must define responses`);
      }
    }
  }
  return errors;
}

function main() {
  const check = process.argv.includes('--check');
  const errors = validate(spec);
  if (errors.length > 0) {
    console.error('Invalid OpenAPI spec:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const outDir = path.join(__dirname, 'docs');
  const outFile = path.join(outDir, 'openapi.json');
  const json = JSON.stringify(spec, null, 2) + '\n';

  if (check) {
    if (!fs.existsSync(outFile)) {
      console.error(`Missing ${outFile}; run node add_swagger.js`);
      process.exit(1);
    }
    const existing = fs.readFileSync(outFile, 'utf8');
    if (existing !== json) {
      console.error('docs/openapi.json is out of date; run node add_swagger.js');
      process.exit(1);
    }
    console.log('OpenAPI spec is valid and up to date.');
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, json);
  console.log(`Wrote ${outFile}`);
}

if (require.main === module) {
  main();
}

module.exports = { spec, validate };
