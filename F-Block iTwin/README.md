
# How to run TLDR:

In the project directory, you can run:

### `npm start`

# Environment Files

Do not commit `.env` or `.env.production`. Use `.env.example` for local development and `.env.production.example` as the production template.

For production GitHub Actions builds, add these values as repository secrets or repository variables:

```text
IMJS_AUTH_CLIENT_CLIENT_ID
IMJS_AUTH_CLIENT_REDIRECT_URI
IMJS_AUTH_CLIENT_LOGOUT_URI
IMJS_AUTH_CLIENT_SCOPES
IMJS_AUTH_AUTHORITY
IMJS_ITWIN_ID
IMJS_IMODEL_ID
IMJS_BING_MAPS_KEY
IMJS_MAP_BOX_KEY
IMJS_CESIUM_ION_KEY
```

The production redirect URI should be `https://itwinapp.geopointstudio.com/signin-callback`.

# Docker

The Docker image serves the React build from nginx and proxies `/api/poll` to `https://rasppi.geopointstudio.com/poll`. The container writes `/env-config.js` when it starts, so the same GHCR image can be configured from Compose environment variables on the target machine.

Build the production image:

```sh
sudo docker build -t f-block-itwin:latest .
```

Run just the app container locally:

```sh
sudo docker run --rm -p 3000:80 f-block-itwin:latest
```

Run the app and Cloudflare tunnel with Compose:

```sh
CLOUDFLARED_TOKEN="your-token" \
sudo docker compose up -d --build
```

For local Compose builds, copy `.env.example` to `.env` and fill in the real values first. The app is served locally at `http://localhost:3000`. If the Cloudflare tunnel is configured in the Cloudflare dashboard, set its service URL to `http://itwin-app:80` so it can reach the app on the Compose network.

## GitHub Container Registry

Pushing to the `main` or `testing` branches publishes the production Docker image to GitHub Container Registry:

```sh
ghcr.io/krodenberg/f-block-itwin:latest
```

Use the pull-only Compose file on another machine:

```sh
CLOUDFLARED_TOKEN="your-token" \
sudo docker compose -f docker-compose.ghcr.yml up -d
```

The machine running `docker-compose.ghcr.yml` needs these values in its local `.env` file:

```text
CLOUDFLARED_TOKEN=your-cloudflare-token
IMJS_AUTH_CLIENT_CLIENT_ID=your-itwin-client-id
IMJS_AUTH_CLIENT_REDIRECT_URI=https://itwin.geopointstudio.com/signin-callback
IMJS_AUTH_CLIENT_LOGOUT_URI=https://itwin.geopointstudio.com/
IMJS_AUTH_CLIENT_SCOPES=itwin-platform
IMJS_AUTH_AUTHORITY=https://ims.bentley.com
IMJS_ITWIN_ID=your-itwin-id
IMJS_IMODEL_ID=your-imodel-id
```

The redirect and logout URLs must exactly match the public domain registered in the Bentley/iTwin developer portal.

If the GitHub package is private, log in first with a GitHub token that has package read access:

```sh
echo "your-github-token" | sudo docker login ghcr.io -u KRodenberg --password-stdin
```

# Getting Started with the iTwin Viewer Create React App Template

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Environment Variables

Prior to running the app, you will need to add OIDC client configuration to the variables in the .env file:

```
# ---- Authorization Client Settings ----
IMJS_AUTH_CLIENT_CLIENT_ID=""
IMJS_AUTH_CLIENT_REDIRECT_URI=""
IMJS_AUTH_CLIENT_LOGOUT_URI=""
IMJS_AUTH_CLIENT_SCOPES =""
```

- You can generate a [test client](https://developer.bentley.com/tutorials/web-application-quick-start/#3-register-an-application) to get started.

- Scopes expected by the viewer are:

  - **Visualization**: `imodelaccess:read`
  - **iModels**: `imodels:read`
  - **Reality Data**: `realitydata:read`

- The application will use the path of the redirect URI to handle the redirection, it must simply match what is defined in your client.

- When you are ready to build a production application, [register here](https://developer.bentley.com/register/).

You should also add a valid iTwinId and iModelId for your user in the this file:

```
# ---- Test ids ----
IMJS_ITWIN_ID = ""
IMJS_IMODEL_ID = ""
```

- For the IMJS_ITWIN_ID variable, you can use the id of one of your existing iTwins. You can obtain their ids via the [iTwin REST APIs](https://developer.bentley.com/apis/itwins/operations/get-itwin/).

- For the IMJS_IMODEL_ID variable, use the id of an iModel that belongs to the iTwin that you specified in the IMJS_ITWIN_ID variable. You can obtain iModel ids via the [iModel REST APIs](https://developer.bentley.com/apis/imodels-v2/operations/get-imodel-details/).

- Alternatively, you can [generate a test iModel](https://developer.bentley.com/tutorials/web-application-quick-start/#4-create-an-imodel) to get started without an existing iModel.

- If at any time you wish to change the iModel that you are viewing, you can change the values of the iTwinId or iModelId query parameters in the url (i.e. localhost:3000?iTwinId=myNewITwinId&iModelId=myNewIModelId)

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Notes

If you are not using NPM, remove the `USING_NPM` env var from [.env](./.env)

## Next Steps

- [iTwin Viewer options](https://www.npmjs.com/package/@itwin/web-viewer-react)

- [Extending the iTwin Viewer](https://developer.bentley.com/tutorials/itwin-viewer-hello-world/)

- [Using the iTwin Platform](https://developer.bentley.com/)

- [iTwin Developer Program](https://www.youtube.com/playlist?list=PL6YCKeNfXXd_dXq4u9vtSFfsP3OTVcL8N)
