> ## Documentation Index
> Fetch the complete documentation index at: https://floorplanner.readme.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Getting started

## Introduction

Most companies that want to integrate Floorplanner into their website or mobile app, want to embed the editor and be able to export 2D & 3D floorplan images. This page walks you through the steps necessary to make that happen. Please note that this guide is limited to the new [HTML5 editor](https://floorplanner.readme.io/reference/embedding-the-editor-v2) and the new [API v2](https://floorplanner.readme.io/reference/project).

## Sandbox vs production

We have a testing environment called ‘sandbox’ and a production environment. For both environments you need to have a different API key. You can view your API details by visiting the [api page (production)](https://floorplanner.com/home/profile) / [api page (sandbox)](https://floorplanner.dev/home/profile) on your enterprise or partner admin account. This page allows you to manage your API keys in addition to providing information such as your user and branding IDs which may be required at a later point.

Alternatively, you can request your details by sending an email to [Floorplanner Support](https://floorplanner.com/contact). Make sure you also request your user and branding IDs as you will likely need them at a later stage. The Floorplanner API uses HTTP Basic Authentication and this section explains how you should use your API key in this authentication scheme.

The sandbox API and the production API run on different domains, make sure you use the right one:

|                    |                                    |
| :----------------- | :--------------------------------- |
| **Sandbox URL**    | <https://floorplanner.dev/api/v2/> |
| **Production URL** | <https://floorplanner.com/api/v2/> |

## Create new project

Before you can embed the editor you first have to create a new project. A project represents a household; a free standing house with multiple levels or a single level apartment. [This section](https://floorplanner.readme.io/reference/createproject) explains how to create a new project using the API. Please remember the project ID that is returned in the result, because you need it later when embedding the editor.

## Request token

Projects are private by default, meaning that you can’t access them unless you are logged in and are the owner. Since our API is stateless we use tokens to give the editor a way to authentication its requests. [This section](https://floorplanner.readme.io/reference/tokenuser) describes how you can request a token. Please remember the token ID that is returned in the result, because you need it later when embedding the editor.

## Embed the editor

Once you have a project ID and a token you can embed the editor. [This page](https://floorplanner.readme.io/reference/embedding-the-editor-v2) describes in detail how to do that.

If you want to customize the editor to your needs, have a look at the Settings section. It’s possible for example to set the wall top colors in 2D & 3D, which furniture items (collections) to load or which room type sets to use.

## Export 2D & 3D floorplan images

You can export all the floorplans of a project as 2D or 3D images via [this API method](https://floorplanner.readme.io/reference/exportproject). Please note that when you export a project, only the first design (variant) of the floor levels are exported. It’s also possible to export a single floorplan (design / variant) as a 2D or 3D image via this API method.

## Export FML

Most companies won’t need this, but some want to be able to export their projects as FML data. This can be done simply adding .fml to the URL, for example:

|         |                            |
| :------ | :------------------------- |
| **URL** | /projects/:project\_id.fml |