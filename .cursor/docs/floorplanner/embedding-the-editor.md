> ## Documentation Index
> 
> Fetch the complete documentation index at: https://floorplanner.readme.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Embedding the editor

## Introduction

The editor app is the app where people can create their floor plans and interior designs. The scope of the editor is limited to one floor plan project. Think of a project as a house for a family with the possibility of multiple floor levels, bigger than a room and smaller than an apartment building. You can see a demo of the editor on the Floorplanner website.

This page explains how you can embed the editor app into your own HTML page.

## Floorplanner Enterprise subscription

Before you start, make sure you have a Floorplanner Enterprise subscription and an API key. You need an API key to be able to log in as a certain user so you can load and save their floor plan projects. Have a look at the Floorplanner pricing page for more info about the Enterprise subscription.

## HTML embed example

Let’s start with a minimal HTML page to embed the editor app. There are some placeholders present within square brackets, e.g. `[AUTH_TOKEN]`, these must be replaced with actual values. You can scroll down to find more info about what to replace these placeholders with. The `embed.js` script will take care of loading the latest version of the editor and its stylesheets.

> 📘 Local development
> 
> The editor embed will not work over the `file:///` protocol, make sure to use a webserver such as serve when developing locally.

The editor will render itself within the specified `mountSelector` (any selector you can pass to `document.querySelector` works here too) element. This element must have a minimum `width` of `1000px` and a minimum `height` of `800px`. The `width` and `height` must be set explicitly, `min-height` will not be sufficient as the editor itself relies on elements with a percentage width.

```html
<!DOCTYPE html>
    <html>
        <head>
          <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
          <meta content="initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport" />
        </head>
        <body>
            <div id="fp-editor-container" style="width: 1000px; height: 800px;"></div>
            <script data-floorplanner-editor src="https://fp-editor-cdn.floorplanner.com/embed.js" crossorigin="anonymous"></script>
            <script type="text/javascript">
               initFPEditor({
                  projectId: [PROJECT_ID],
                  mountSelector: '#fp-editor-container',
                  user: {
                      id: [USER_ID],
                      auth_token: "[AUTH_TOKEN]",
                      permissions: ['save'],
                  },
                  language: 'en-US',
              }).then(api => (window.api = api));
            </script>
        </body>
    </html>

```

## Tokens

There are two ways to authenticate with the editor. You can use 'User' based authentication, by providing the user ID and Auth token in the user object or used 'Project' based authentication by providing a 'projectAccessToken'.

An important note, please always request a new token each time you load the editor as the tokens expire.

### User based authentication

User based authentication can be used when you want to integrate the editor into a internal system and the editor is tied to a single user. When using this form of authentication you will have access to the export callback functionality and access to user and role based settings.

```javascript
initFPEditor({
  projectId: [PROJECT_ID],
  mountSelector: '#fp-editor-container',
  user: {
    id: [USER_ID],
    auth_token: "[AUTH_TOKEN]",
    permissions: ['save'],
  },
  language: 'en-US',
}).then(api => (window.api = api));

```

### Project based authentication

Project based authentication is useful when you only want to give access to one specific project. This is useful when a project can be used by multiple actors and it should not be tied to specific user related preferences or settings.

```javascript
initFPEditor({
  projectId: [PROJECT_ID],
  mountSelector: '#fp-editor-container',
  user: {
    permissions: ['save'],
  },
  projectAccessToken: "[PROJECT_TOKEN]",
  language: 'en-US',
}).then(api => (window.api = api));

```

## Placeholders

Within the HTML, the placeholders `[USER_ID]`, `[AUTH_TOKEN]` and `[PROJECT_ID]` must be replaced with real values. Below this section, you can find out how to retrieve each individual component.

### Replacing `[AUTH_TOKEN]` and `[USER_ID]`

User ID and authentication tokens can be retrieved through our API. This requires making requests using your credentials which can be found in the Getting started "sandbox vs production" guide. The following is an example cURL request. Do not forget to replace `[YOUR_API_KEY]` with your actual API key:

```curl
curl --user [YOUR_API_KEY]:x https://floorplanner.com/api/v2/users/token.json

```

```json
{
   "token" : "eyJ0eXAiOiJKV1QiLQL1bGciOiJIUzI1NiJ9.eyJhY3Rpb24abaJsb2dpbiIsIm1vZGVsIjoiVXNlciIsImlkIjoxMDMsImlhdCI6MTUyMTczMTIwMH0.juutj2LGAVDUAV103Cz_viPvIfcPcs6weIPl3eFtsdM",
   "user_id" : 1337
}

```

Within the HTML template, replace `[AUTH_TOKEN]` with the value of the `token` and replace `[USER_ID]` with the value of `user_id` inside the result JSON.

### Replacing `[PROJECT_ID]`

See the following API call to fetch all the projects you can access, their ID will be part of the JSON output: Projects#index. Replace the `[PROJECT_ID]` in the HTML template with any of these ID’s.

IMPORTANT: `[PROJECT_ID]` must be of type number, thus 123 and not "123".

## Editor settings

The settings object can be used to customize certain parts of the editor, see the sample below:

```javascript
initFPEditor({
    // Set to 'true' to auto-load configuration as applied in Floorplanner's own
    // implementation. Additional settings can be passed to overwrite settings
    // provided via autoSetup. Use 'kind' to specify the type of editor (documented below).
    // Based on 'kind' the following will happen:
    //
    // editor:
    //   - Requires 'user' authentication (documented below)
    //   - Loads editor configuration based on 'projectId' (documented below)
    //   - Falls back to loading public branding settings based on 'brandingId' (documented below)
    //
    // roomplanner:
    //   - No authentication required
    //   - Loads roomplanner configuration based on 'roomplannerSubdomain' (documented below)
    //   - Falls back to loading public branding settings based on 'brandingId' (documented below)
    //
    // other kinds:
    //   - No authentication required
    //   - Loads branding settings based on 'brandingId' (documented below)
    // 
    // If something looks off messages about failed requests to fetch settings should
    // be present in the browser's developer tools console.
    autoSetup: false,
  
    // Corresponds to the value of [subdomain].roomplanner.com or [subdomain].floorplanner.com.
    // Used by 'autoSetup' to load correct roomplanner specific configuration
    roomplannerSubdomain: 'subdomain',
  
    // Setting 'apiDomain' to 'sandbox.floorplanner.com' makes the editor
    // use our sandbox back-end instead of production. The default value
    // is 'floorplanner.com'.
    apiDomain: 'sandbox.floorplanner.com',

    // When developing an embedded Floorplanner Editor locally, you will want
    // to set 'embedPrefix' so that editor files are not served through localhost.
    // This is only needed if you develop using localhost:3000.
    embedPrefix: 'https://fp-editor-cdn.floorplanner.com',

    // A valid 'document.querySelector' value. The selector specified here
    // must exist on the page before 'initFPEditor' is called. 
    mountSelector: '#fp-editor-container',
  
    // 'useMetric' is a boolean setting which toggles between metric and
    // imperial measurement systems. This setting overwrites the user's
    // measurements setting. If a template is set, the measurements setting
    // from the template will be applied instead.
    useMetric: true,

    // the ID or URL of the FML of the project to open. For kind: 'roomplanner' the string 'roomplanner'
    // can be supplied to start roomplanner without an existing project.
    projectId: 1,

    // A template offers a way to add consistent branding to floorplan
    // exports/renders It is a collection of style and export settings
    // which can be managed via the Floorplanner Dashboard.
    templateId: 1,

    // To use the branding styles and settings you will need to the set the
    // 'brandingId' property. This can be a numeric ID or the subdomain name of
    // the branding. If it is a subdomain, be sure to quote the value.
    brandingId: 1,

    // Customize the link location of the help center link shown at the bottom of the 'help' sidebar.
    // By default, it navigates to https://help.floorplanner.com/en/
    helpCenterLinkUrl: 'https://help.floorplanner.com/en/',
  
    // Visually hide specific editor components, currently supports
    // the following components:
    //    'clear-design-button' hides the clear design button.
    //    'save-button' hides the save button even if 'save' permission is passed.
    //    'duplicate-design-button' hides the duplicate button in the project sidebar.
    //    'delete-design-button' hides the delete button in the project sidebar.
    //    'duplicate-floor-button' hides the duplicate button in the floor sidebar.
    //    'restore-floor-button' hides the restore button in the floor sidebar.
    //    'delete-floor-button' hides the delete button in the floor sidebar.
    //    'add-floor-button' hides add floor button in floor dropdown and sidebar.
    //    'help-sidebar' hides the help sidebar icon and disables the "?" hotkey.
    //    'project-sidebar' hides the project sidebar icon.
    //    'styleboards-sidebar' hides the styleboards sidebar icon.
    //    'exports-sidebar' hides the exports sidebar icon and the "See your exports"
    //                      button shown in the editor when an export has finished.
    //    'objects-sidebar' hides the objects sidebar icon.
    //    'designs-sidebar' hides the designs button in the project sidebar.
    //    'help-center-link' hides the help center text shown at the bottom of the 'help' sidebar.
    //    'thumb-view-toggle' hides the 2D/3D toggle shown in various sidebars to toggle between 2D and 3D thumbnails of products.
    hiddenComponents: ['save-button'],
  
    // Type of editor with the kind property. These are the optional values:
    // 'spaceplanner', 'editor', 'viewer' and 'roomplanner'
    kind: 'editor',

    // 'newRoomplan' is only used when the 'kind' property is set to 'roomplanner'.
    // By default it is set  to boolean true. This allows embedders to implement the
    // following use-cases:
    //
    // 1. creating a new project whenever a roomplan is saved:
    //    - kind: 'roomplanner'
    //    - newRoomplan: true
    //    - projectId: 'roomplanner'
    // 2. creating a new project based off a template project whenever a roomplan is saved:
    //    - kind: 'roomplanner'
    //    - newRoomplan: true
    //    - projectId: <numeric project ID>
    // 3. updating an existing project whenever it is saved:
    //    - kind: 'roomplanner'
    //    - newRoomplan: false
    //    - projectId: <numeric project ID>
    newRoomplan: kind === 'roomplanner',

    // 'wizardRoomtypeId` is only used when the 'kind' property is set to 'roomplanner'.
    // When set, the value must be a roomtype "role" number from one of the roomtypes
    // returned by: https://floorplanner.com/api/v2/room_type_sets/defaults.json
    wizardRoomtypeId: null,
  
    // 'wizardRoomstyleId' is used together with 'wizardRoomtypeId' and also only used
    // when the 'kind' property is set to 'roomplanner'. When 'wizardRoomtypeId' is not
    // set this parameter is ignored. Any roomstyle ID that you own can be passed here.
    // The roomstyle must have its 'roleId' set to the same value as 'wizardRoomtypeId'
    // for the Magic Layout feature to work correctly.
    wizardRoomstyleId: null,

    // The language in which the editor will be translated. Supported values:
    // zh-Hans-CN, da-DK, nl-NL, en-US, fr-FR, de-DE, it-IT, ja-JP, ko-KR, fa-IR, pl-PL, pt-BR, es-ES
    language: "en-US",

    // User info, optional for public projects with kind: 'viewer' or 'roomplanner'
    user: {
        // Floorplanner user id
        id: 1337,

        // Optional, this will set the default email address for the 2D & 3D exports
        email: 'support@floorplanner.com',

        // An array of permissions:
        //    'save' enables save functionality and shows the save button in the top bar
        //    'no-export' hides the 2D & 3D export buttons in the top bar
        //    'hide-email' hides the email field at the bottom of the export popup
        //    'no-back-to-dashboard' hides the Back to dashboard button in the sidebar
        //    'ntl' turns off the cooldown period for renders
        //    'disable_3d' hides the 3D button
        //    'disable_upload' hides the background image upload button
        permissions: ['save', 'no-export'],

        // Authentication token to log in as a certain user
        auth_token: 'eyJ0eXAiOiJKV1QiLQL1bGciOiJIUzI1NiJ9.eyJhY3Rpb24abaJsb2dpbiIsIm1vZGVsIjoiVXNlciIsImlkIjoxMDMsImlhdCI6MTUyMTczMTIwMH0.juutj2LGAVDUAV103Cz_viPvIfcPcs6weIPl3eFtsdM'
    }
}).then(api => { /* additional setup using editor API object */ });

```

## API object

It possible to trigger certain actions inside the editor by calling methods on the editor API object. For example, to flush pending autosaves, call `api.flush();`

Methods and properties available on the editor API object are:

[block:parameters]
{
"data": {
"h-0": "Method/Property",
"h-1": "Description",
"0-0": "`api.flush()`",
"0-1": "Flushes pending autosaves. Returns a Promise, resolved on successful flushing.",
"1-0": "`api.save()`",
"1-1": "Deprecated. Flushes pending autosaves, if any. Then triggers the onSaved handler, if assigned.",
"2-0": "`api.state`",
"2-1": "Returns the state of the Floorplan object (walls, items, areas..) displayed in the editor.",
"3-0": "`api.meta`",
"3-1": "Returns metadata about areas and outer walls of the Floorplan object.",
"4-0": "`api.zoomIn()`",
"4-1": "Zooms in.",
"5-0": "`api.zoomOut()`",
"5-1": "Zooms out.",
"6-0": "`api.zoomAll()`",
"6-1": "Zooms to fit the view.",
"7-0": "`api.dropItem(id, pos)`",
"7-1": "Drops an item onto the plan. `id` is 40-character item id, `pos` is `{x, y}` where `x` and `y` are viewport coordinates. You can use `MouseEvent.clientX` and `MouseEvent.clientY` there.",
"8-0": "`api.view`",
"8-1": "Write-only. Should be either `‘2D’` or `‘3D’`. Switches to the corresponding view.",
"9-0": "`api.designId`",
"9-1": "Write-only. Given an `id` of the design of current project, loads that design into the view.",
"10-0": "`api.createDesign(floorplan)`",
"10-1": "Create a new design on the current floor using `floorplan` data and switches to it immediately. See FML v3.0 Floorplan for the specification.",
"11-0": "`api.project`",
"11-1": "Read-only. Data about project, including floors and designs. Meant to be used to list project’s floors and designs and to switch betwen them (setting the `api.designId` property).",
"12-0": "`api.unmount()`",
"12-1": "Unmounts the editor from the DOM. Does not remove event listeners or clean up global 3D engine state. SPAs which load multiple instances of the editor without reloading are likely to run into issues with multiple editor instances using the same instance of the 3D engine!",
"13-0": "`api.reload()`",
"13-1": "Reload the editor, this is equivalent to calling `api.unmount()` followed by `initFPEditor({ /* init settings */ })`.",
"14-0": "`api.switchToCamera(index)`",
"14-1": "Switch to camera based on the camera index",
"15-0": "`api.centerPoint`",
"15-1": "Position of 0,0 point (fat plus) relative to top-left position of the editor canvas",
"16-0": "`api.onAutoSave(handler)`",
"16-1": "Listen for auto save state changes. The `handler` argument must be a function. It will receive an object with a `status` property when the auto save state changes. This `status` property will be one of `'start'`, `'success'` or `'error'`. When calling `api.onAutoSave` multiple times, handlers attached in previous calls will be detached. Only the `handler` from the last call is attached.",
"17-0": "`api.onSelect(handler)`",
"17-1": "Execute `handler` when any object is selected in the editor. The `handler` argument must be a function. It will receive a `null` value when deselecting. When selecting it will receive an object with `kind` and `obj` properties. The `kind` property indicates the type of object which was selected (i.e. `wall`, `item`, `surface`, `material` etc). The `obj` property will include runtime data about the selected object. \n \nChanges to an already selected object may trigger this handler again with an updated `obj` property. This means that this handler can be called many times e.g. when changing item dimensions each individual change will trigger this handler."
},
"cols": 2,
"rows": 18,
"align": [
"left",
"left"
]
}
[/block]

You can also subscribe to following events:

| Property | Description |
| --- | --- |
| `api.onSave` | Deprecated. Will only be called when the deprecated 'save' method is called. |
| `api.onUpdated` | Will be called whenever internal state of the floorplan is updated. NB! The first update happens when the design is loaded. |
| `api.onQuit` | Will be called whenever the editor is going to quit. NB! This handler replaces the default one, which sets window.location to ‘/dashboard’. So if your goal is to navigate the user to some other page, you have to do it in the body of the handler. |
| `api.onExport` | Will be called whenever an export was requested. The assigned function will get a single input parameter, either “interior” or “floorplan”, indicating the type of the export. |
| `api.onSaveRoomplanner` | Accepts a callback which is called after a Roomplanner project has been saved successfully. Receives an object containing `{id: number, name: string}`. |

## Callback examples

The examples below show how some of these events can be used.

### `onUpdate` - Log data

```javascript
api.onUpdated = (data) => console.log('floorplan updated', data);

```

### `onUpdate` - Log unique products with count

```javascript
api.onUpdated = (data) => {
    // Get all products from state and map the asset data
    var allProducts = data.state.items.map((item) => item.asset);

    // Get unique products with counts
    var uniqueProducts = [];
    for (i = 0; i < allProducts.length; i++) {
        var index = uniqueProducts.findIndex(
            (product) => product.id === allProducts[i].id
        );
        if (index >= 0) {
            uniqueProducts[index].count++;
        } else {
            uniqueProducts.push({...allProducts[i], count: 1});
        }
    }

    console.log('unique products', uniqueProducts);
};

```

### `onUpdate` - Log products added and removed

```javascript
var products = api.state.items;

api.onUpdated = (data) => {
    // Get changed item
    if (products.length < data.state.items.length) {
        console.log('product added', data.state.items[data.state.items.length - 1]);
    } else if (products.length > data.state.items.length) {
        var allProducts = products.map((product) => product.asset.id);
        var currentProducts = data.state.items.map((product) => product.asset.id);
        var removedProductIds = allProducts.filter((d) => !currentProducts.includes(d));
        var removedProducts = products.filter(
            (product) => removedProductIds.includes(product.asset.id)
        );

        console.log('product(s) removed', removedProducts);
    }

    // Update products array
    products = data.state.items;
};

```

## Single Page Applications (SPA) and embedding

Single Page Applications have the ability to dynamically update pages with Javascript. The Floorplanner editor doesn't support this kind of interactivity at this point. We recommend using a regular anchor link when visiting a page with the embedded editor.

## Customizing the embed

Embedded editor instances are just as customisable as any other editor instance. For customisation to work however, some extra properties will need to be passed to the editor when calling `initFPEditor`. The most important properties that add customisability are `templateId` and `brandingId`.

### Applying a template

Setting `templateId` will cause the editor to apply settings found in the General and Editor tabs of the template. Templates are commonly used to create a streamlined workflow for users working on your projects by providing a way to set preferred default settings so your users don't have to. Templates can also help to ensure consistent results for exports.

To set a `templateId`, visit the dashboard templates page first by navigating to https://floorplanner.com/home/templates. Double click the template you wish to use. The URL should look something like https://floorplanner.com/home/templates/1234/edit. The number `1234` is the `templateId` you will need to set during editor initialisation.

### Applying branding

Setting the `brandingId` will cause the editor to apply settings found in the Editor and Roomplanner (if present) tabs. Non-embedded editors use branding by default, we leave the choice to you for the embedded use case.

Branding controls the general look and feel of the editor, dashboard, and 3D tours while providing additional customisation options such as the ability to filter paint and wallpaper suppliers and much more!

To set a `brandingId`, visit the dashboard profile page https://floorplanner.com/home/profile. You should see a toggle with Personal, Company, and API options. Clicking on API will show important details such as your own user ID, API keys, and the branding ID value you need to set `brandingId`.