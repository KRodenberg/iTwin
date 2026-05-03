const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/api/csrng",
    createProxyMiddleware({
      target: "https://csrng.net",
      changeOrigin: true,
      pathRewrite: {
        "^/api/csrng": "/csrng/csrng.php",
      },
    }),
  );
};
