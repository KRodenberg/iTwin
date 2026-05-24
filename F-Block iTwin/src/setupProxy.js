const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/api/poll",
    createProxyMiddleware({
      target: "https://rasppi.geopointstudio.com",
      changeOrigin: true,
      pathRewrite: {
        "^/api/poll": "/poll",
      },
    }),
  );
};
