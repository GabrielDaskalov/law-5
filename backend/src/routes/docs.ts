/**
 * API Documentation Routes - Swagger/OpenAPI documentation
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/auth';
import { generateOpenAPISpec } from '../utils/openapi';

const router = Router();

// GET /api/docs/openapi.json - OpenAPI specification
router.get(
  '/openapi.json',
  asyncHandler(async (req, res) => {
    const spec = generateOpenAPISpec();
    res.json(spec);
  })
);

// GET /api/docs/swagger-ui - Swagger UI HTML
router.get(
  '/swagger-ui',
  asyncHandler(async (req, res) => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pravo Academy API - Swagger UI</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.3/swagger-ui.min.css">
          <style>
            html {
              box-sizing: border-box;
              overflow: -moz-scrollbars-vertical;
              overflow-y: scroll;
            }
            * {
              box-sizing: inherit;
            }
            body {
              margin: 0;
              padding: 0;
            }
          </style>
        </head>
        <body>
          <div id="swagger-ui"></div>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.3/swagger-ui.min.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.3/swagger-ui-bundle.min.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.3/swagger-ui-standalone-preset.min.js"></script>
          <script>
            window.onload = function() {
              SwaggerUIBundle({
                url: "/api/docs/openapi.json",
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                  SwaggerUIBundle.presets.apis,
                  SwaggerUIStandalonePreset
                ],
                plugins: [
                  SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout"
              });
            }
          </script>
        </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  })
);

// GET /api/docs/redoc - ReDoc API documentation
router.get(
  '/redoc',
  asyncHandler(async (req, res) => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pravo Academy API - ReDoc</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
          <style>
            body {
              margin: 0;
              padding: 0;
            }
          </style>
        </head>
        <body>
          <redoc spec-url='/api/docs/openapi.json'></redoc>
          <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
        </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  })
);

// GET /api/docs - Documentation index
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pravo Academy API Documentation</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background: #f5f5f5;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 {
              color: #0F1B2D;
              margin-top: 0;
            }
            .info {
              background: #f9f9f9;
              padding: 20px;
              border-radius: 4px;
              margin: 20px 0;
            }
            .links {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 20px;
              margin-top: 30px;
            }
            .link-card {
              padding: 20px;
              background: #f9f9f9;
              border-radius: 4px;
              text-decoration: none;
              color: #0F1B2D;
              border: 1px solid #e0e0e0;
              transition: all 0.3s ease;
            }
            .link-card:hover {
              background: #e3f2fd;
              border-color: #0F1B2D;
              transform: translateY(-2px);
            }
            .link-card h3 {
              margin: 0 0 10px 0;
            }
            .link-card p {
              margin: 0;
              font-size: 14px;
              color: #666;
            }
            .status {
              background: #4CAF50;
              color: white;
              padding: 10px 15px;
              border-radius: 4px;
              display: inline-block;
              font-size: 14px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🏛️ Pravo Academy API</h1>

            <div class="status">✓ Production Ready</div>

            <div class="info">
              <p><strong>Version:</strong> 1.0.0</p>
              <p><strong>Base URL:</strong> http://localhost:3000/api</p>
              <p><strong>Authentication:</strong> JWT Bearer Token</p>
            </div>

            <h2>📚 Documentation</h2>
            <div class="links">
              <a href="/api/docs/swagger-ui" class="link-card">
                <h3>Swagger UI</h3>
                <p>Interactive API explorer with try-it-out functionality</p>
              </a>

              <a href="/api/docs/redoc" class="link-card">
                <h3>ReDoc</h3>
                <p>Beautiful and responsive API documentation</p>
              </a>

              <a href="/api/docs/openapi.json" class="link-card">
                <h3>OpenAPI JSON</h3>
                <p>Raw OpenAPI 3.0.0 specification in JSON format</p>
              </a>

              <a href="/health" class="link-card">
                <h3>Health Check</h3>
                <p>API health status and environment information</p>
              </a>
            </div>

            <h2>🚀 Getting Started</h2>
            <div class="info">
              <h3>1. Register User</h3>
              <code>POST /auth/register</code>

              <h3>2. Login</h3>
              <code>POST /auth/login</code>

              <h3>3. Use Token</h3>
              <p>Add to Authorization header: <code>Bearer YOUR_JWT_TOKEN</code></p>

              <h3>4. Explore API</h3>
              <p>Use Swagger UI or ReDoc above to explore endpoints</p>
            </div>

            <h2>📖 Resources</h2>
            <div class="info">
              <ul>
                <li><a href="https://github.com/pravo-academy/backend">GitHub Repository</a></li>
                <li><a href="/README.md">Setup Guide</a></li>
                <li><a href="/API_ENDPOINTS.md">Full Endpoint Reference</a></li>
              </ul>
            </div>
          </div>
        </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  })
);

export default router;
