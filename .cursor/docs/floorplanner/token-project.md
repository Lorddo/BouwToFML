> ## Documentation Index
> Fetch the complete documentation index at: https://floorplanner.readme.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Generate project based token

This token can be used to embed the editor and only allow access to this specific project

# OpenAPI definition

```json
{
  "openapi": "3.0.3",
  "info": {
    "description": "This is the API documentation for Floorplanner",
    "version": "2.0",
    "title": "Floorplanner",
    "termsOfService": "https://floorplanner.com/terms",
    "contact": {
      "email": "support@floorplanner.com"
    },
    "license": {
      "name": "Copyright Floorplanner"
    }
  },
  "servers": [
    {
      "url": "https://floorplanner.com/api/v2/",
      "description": "Production"
    },
    {
      "url": "https://floorplanner.dev/api/v2/",
      "description": "Staging / Sandbox"
    }
  ],
  "security": [
    {
      "basicAuth": []
    }
  ],
  "paths": {
    "/projects/{id}/token.json": {
      "get": {
        "tags": [
          "Project"
        ],
        "operationId": "tokenProject",
        "summary": "Generate project based token",
        "description": "This token can be used to embed the editor and only allow access to this specific project",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "description": "ID of the project",
            "required": true,
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "expires_in",
            "in": "query",
            "description": "Number of seconds the token expires in",
            "required": false,
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "editor_url",
            "in": "query",
            "description": "Responds with an editor link to the project",
            "required": false,
            "schema": {
              "type": "boolean"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/project_token"
                }
              }
            }
          },
          "403": {
            "description": "Access denied"
          },
          "404": {
            "description": "Project not found"
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "basicAuth": {
        "type": "http",
        "scheme": "basic"
      }
    },
    "schemas": {
      "project_token": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string"
          },
          "editor_url": {
            "type": "string"
          }
        }
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  },
  "_id": {
    "buffer": {
      "0": 96,
      "1": 212,
      "2": 89,
      "3": 57,
      "4": 36,
      "5": 241,
      "6": 215,
      "7": 3,
      "8": 91,
      "9": 209,
      "10": 88,
      "11": 227
    }
  }
}
```