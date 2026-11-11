window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '../openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    validatorUrl: null,
    persistAuthorization: false,
    queryConfigEnabled: false,
    requestInterceptor: function (request) {
      // Test the supplied API key without inheriting an owner browser session.
      request.credentials = 'omit';
      return request;
    },
  });
};
