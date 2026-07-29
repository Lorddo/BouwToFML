> ## Documentation Index
> Fetch the complete documentation index at: https://floorplanner.readme.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Authentication

## Authentication

This page describes our REST authentication and our options for user authentication. We support Single-Sign-On and OAuth.

### REST Authentication

Many Floorplanner API methods require authentication. All responses are relative to the context of the authenticating user. For example, an attempt to retrieve project information of a private project will fail. HTTP Basic Authentication is the supported authentication scheme. When authenticating via Basic Authentication, use your API key as username and x as password.

[block:parameters]
{
  "data": {
    "h-0": "Parameter",
    "h-1": "Required",
    "h-2": "Value",
    "0-0": "username",
    "0-1": "yes",
    "0-2": "**[Your API key]** ",
    "1-0": "password",
    "1-1": "yes",
    "1-2": "x"
  },
  "cols": 3,
  "rows": 2
}
[/block]

### User Authentication

We supports multiple user based authentication options, which can be used in different scenario's. Do you want to connect users from your current system as users under ours, we would recommend the SSO solution. If you want to connect users from outside your own system or want to embed Floorplanner in your own app we would recommend the use of OAuth.

#### OAuth

For **enterprise** clients we allow OAuth integrations. This authentication method allows you to integrate floorplanner authentication in your own applications, desktop, web or mobile.

#### Single Sign On (SSO)

Single sign on allows you to connect your authentication system and users to connect directly with Floorplanner. For example if your users are logging in via Google or Azure, we can connect these to our system. This can make it easier to revoke access for users and control who has access to Floorplanner. It will also prevent the user from needing to have extra credentials.

We support multiple platforms for SSO such as:

* Google
* Okta
* Azure / Microsoft
* Any SAML, ADFS and OAuth based authentication systems