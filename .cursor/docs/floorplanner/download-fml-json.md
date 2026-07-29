> ## Documentation Index
> Fetch the complete documentation index at: https://floorplanner.readme.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Download FML JSON

Fetch based project FML in JSON format

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
    "/projects/{id}/fml": {
      "get": {
        "tags": [
          "Project"
        ],
        "operationId": "fmlProject",
        "summary": "Download FML JSON",
        "description": "Fetch based project FML in JSON format",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "description": "ID of the project",
            "required": true,
            "schema": {
              "type": "number"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "xml": {
                "schema": {
                  "$ref": "#/components/schemas/project"
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
      "project": {
        "type": "object",
        "properties": {
          "id": {
            "type": "number"
          },
          "user_id": {
            "type": "number"
          },
          "level_id": {
            "type": "number"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "project_url": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "format": "date-time"
          },
          "enable_autosave": {
            "type": "boolean"
          },
          "external_identifier": {
            "type": "string"
          },
          "exported_at": {
            "type": "string",
            "format": "date-time"
          },
          "public": {
            "type": "boolean"
          },
          "floors": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/floor_with_designs"
            }
          }
        }
      },
      "floor_with_designs": {
        "allOf": [
          {
            "type": "object",
            "properties": {
              "id": {
                "type": "number"
              },
              "project_id": {
                "type": "number"
              },
              "name": {
                "type": "string"
              },
              "level": {
                "type": "number"
              },
              "height": {
                "type": "number"
              },
              "created_at": {
                "type": "string",
                "format": "date-time"
              },
              "updated_at": {
                "type": "string",
                "format": "date-time"
              }
            }
          },
          {
            "type": "object",
            "properties": {
              "designs": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/design"
                }
              }
            }
          }
        ]
      },
      "design": {
        "type": "object",
        "properties": {
          "id": {
            "type": "number"
          },
          "floor_id": {
            "type": "number"
          },
          "name": {
            "type": "string"
          },
          "thumb_2d_generated_at": {
            "type": "string",
            "format": "date-time"
          },
          "thumb_3d_generated_at": {
            "type": "string",
            "format": "date-time"
          },
          "user_id": {
            "type": "number"
          },
          "design_type": {
            "type": "string",
            "enum": [
              "save",
              "save_as",
              "send_a_friend",
              "image_export",
              "save_and_mail",
              "bookmark"
            ]
          },
          "design_hash": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "format": "date-time"
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